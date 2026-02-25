use chrono::{Duration, Utc};
use sqlx::{PgPool, Postgres, Transaction};
use std::collections::HashMap;
use uuid::Uuid;

use crate::{
    dto::boards::{
        BoardActionMessage, BoardFavoriteResponse, BoardMemberResponse, BoardMemberUser,
        BoardMembersResponse, BoardResponse, CreateBoardRequest, InviteBoardMembersRequest,
        InviteBoardMembersResponse, TransferBoardOwnershipRequest, UpdateBoardMemberRoleRequest,
        UpdateBoardRequest,
    },
    error::AppError,
    models::{
        boards::{Board, BoardPermissionOverrides, BoardPermissions, BoardRole, CanvasSettings},
        elements::BoardElement,
        organizations::OrgRole,
        users::{SubscriptionTier, User},
    },
    realtime::snapshot,
    repositories::boards as board_repo,
    repositories::elements as element_repo,
    repositories::organizations as org_repo,
    repositories::realtime as realtime_repo,
    repositories::users as user_repo,
    services::email::EmailService,
    telemetry::{BusinessEvent, redact_email},
    usecases::invites::collect_invite_emails,
    usecases::organizations::{max_boards_for_tier, send_invite_emails},
};
pub struct BoardService;

const TRASH_RETENTION_DAYS: i64 = 30;

pub(crate) struct BoardMemberChange {
    pub message: BoardActionMessage,
    pub member_user_id: Uuid,
    pub role: Option<BoardRole>,
    pub permissions: Option<BoardPermissions>,
}

#[derive(Debug, Clone, Copy)]
struct BoardAccess {
    role: BoardRole,
    permissions: BoardPermissions,
}

#[derive(Debug, Clone, Copy)]
enum BoardPermission {
    View,
    Edit,
    Comment,
    ManageMembers,
    ManageBoard,
}

impl BoardService {
    /// Lists boards accessible to the user, optionally filtered by organization.
    pub async fn get_board(
        pool: &PgPool,
        user_id: Uuid,
        organization_id: Option<Uuid>,
        is_template: Option<bool>,
    ) -> Result<Vec<BoardResponse>, AppError> {
        board_repo::list_boards_for_user(pool, user_id, organization_id, is_template).await
    }

    /// Loads a board with full metadata, enforcing access rules.
    pub async fn get_board_detail(
        pool: &PgPool,
        board_id: Uuid,
        user_id: Uuid,
    ) -> Result<Board, AppError> {
        require_board_permission(pool, board_id, user_id, BoardPermission::View).await?;
        if let Err(error) = board_repo::touch_board_last_accessed(pool, board_id, user_id).await {
            tracing::warn!(
                "Failed to update board last_accessed_at for {}: {}",
                board_id,
                error
            );
        }
        board_repo::find_board_by_id(pool, board_id)
            .await?
            .ok_or(AppError::NotFound("Board not found".to_string()))
    }

    pub async fn toggle_board_favorite(
        pool: &PgPool,
        board_id: Uuid,
        user_id: Uuid,
    ) -> Result<BoardFavoriteResponse, AppError> {
        require_board_permission(pool, board_id, user_id, BoardPermission::View).await?;
        let is_favorite = board_repo::toggle_board_favorite(pool, board_id, user_id)
            .await?
            .ok_or(AppError::Forbidden(
                "Board membership required to favorite this board".to_string(),
            ))?;
        Ok(BoardFavoriteResponse { is_favorite })
    }

    /// Resolves the access role for a board based on membership, org admin, or public access.
    pub async fn get_access_role(
        pool: &PgPool,
        board_id: Uuid,
        user_id: Uuid,
    ) -> Result<BoardRole, AppError> {
        Ok(resolve_board_access(pool, board_id, user_id).await?.role)
    }

    pub async fn get_access_permissions(
        pool: &PgPool,
        board_id: Uuid,
        user_id: Uuid,
    ) -> Result<BoardPermissions, AppError> {
        Ok(resolve_board_access(pool, board_id, user_id)
            .await?
            .permissions)
    }

    pub async fn ensure_can_view(
        pool: &PgPool,
        board_id: Uuid,
        user_id: Uuid,
    ) -> Result<(), AppError> {
        require_board_permission(pool, board_id, user_id, BoardPermission::View).await?;
        Ok(())
    }

    pub async fn ensure_can_comment(
        pool: &PgPool,
        board_id: Uuid,
        user_id: Uuid,
    ) -> Result<(), AppError> {
        require_board_permission(pool, board_id, user_id, BoardPermission::Comment).await?;
        Ok(())
    }

    pub async fn create_board(
        pool: &PgPool,
        req: CreateBoardRequest,
        user_id: Uuid,
    ) -> Result<Board, AppError> {
        let CreateBoardRequest {
            organization_id,
            name,
            description,
            thumbnail_url,
            is_public,
            is_template,
            template_board_id,
            canvas_settings,
        } = req;

        let name = name.trim();
        if name.is_empty() {
            return Err(AppError::BadRequest("Board name is required".to_string()));
        }

        if let Some(organization_id) = organization_id {
            let organization = org_repo::find_organization_by_id(pool, organization_id)
                .await?
                .ok_or(AppError::NotFound("Organization not found".to_string()))?;
            let member_role = org_repo::get_member_role(pool, organization_id, user_id)
                .await?
                .ok_or(AppError::Forbidden(
                    "You are not a member of this organization".to_string(),
                ))?;
            ensure_org_manager(member_role)?;

            let board_count =
                board_repo::count_boards_by_organization(pool, organization_id).await?;
            ensure_board_capacity(board_count, organization.max_boards)?;
        } else {
            let user = user_repo::get_user_by_id(pool, user_id).await?;
            let board_count = board_repo::count_personal_boards_by_owner(pool, user_id).await?;
            let max_boards = max_boards_for_tier(resolve_active_tier(&user));
            ensure_board_capacity(board_count, max_boards)?;
        }

        let mut template_elements: Vec<BoardElement> = Vec::new();
        let mut base_canvas_settings = CanvasSettings::default();
        if let Some(template_board_id) = template_board_id {
            let template = board_repo::find_board_by_id(pool, template_board_id)
                .await?
                .ok_or(AppError::NotFound("Template board not found".to_string()))?;
            if !template.is_template {
                return Err(AppError::BadRequest("Template board not found".to_string()));
            }
            require_board_permission(pool, template_board_id, user_id, BoardPermission::View)
                .await?;
            template_elements =
                element_repo::list_elements_by_board(pool, template_board_id).await?;
            base_canvas_settings = template.canvas_settings;
        }

        let canvas_settings = match canvas_settings {
            Some(input) => input.apply_to(base_canvas_settings),
            None => base_canvas_settings,
        };
        validate_canvas_settings(&canvas_settings)?;

        let params = board_repo::CreateBoardParams {
            organization_id,
            name: name.to_string(),
            description,
            thumbnail_url,
            is_public: is_public.unwrap_or(true),
            is_template: is_template.unwrap_or(false),
            canvas_settings,
        };

        let mut tx = pool.begin().await?;
        let board = board_repo::create_board(&mut tx, params, user_id).await?;
        board_repo::add_owner_member(&mut tx, board.id, user_id).await?;
        if !template_elements.is_empty() {
            let cloned =
                clone_template_elements(&mut tx, board.id, user_id, template_elements).await?;
            let state_bin = snapshot::build_state_update_from_elements(&cloned)?;
            if !state_bin.is_empty() {
                realtime_repo::insert_snapshot(&mut tx, board.id, 0, state_bin, Some(user_id))
                    .await?;
            }
        }
        tx.commit().await?;

        BusinessEvent::BoardCreated {
            board_id: board.id,
            user_id,
            organization_id,
            is_template: board.is_template,
        }
        .log();

        Ok(board)
    }

    /// Updates board metadata (name, description, visibility).
    pub async fn update_board(
        pool: &PgPool,
        board_id: Uuid,
        user_id: Uuid,
        req: UpdateBoardRequest,
    ) -> Result<Board, AppError> {
        require_board_permission(pool, board_id, user_id, BoardPermission::ManageBoard).await?;

        let name = normalize_optional_name(req.name)?;
        let description = normalize_optional_description(req.description);
        let mut fields = Vec::new();
        if name.is_some() {
            fields.push("name".to_string());
        }
        if description.is_some() {
            fields.push("description".to_string());
        }
        if req.is_public.is_some() {
            fields.push("is_public".to_string());
        }

        let mut tx = pool.begin().await?;
        let updated =
            board_repo::update_board_metadata(&mut tx, board_id, name, description, req.is_public)
                .await?;
        tx.commit().await?;
        if !fields.is_empty() {
            BusinessEvent::BoardUpdated {
                board_id,
                user_id,
                fields,
            }
            .log();
        }

        Ok(updated)
    }

    /// Archives a board (soft hide).
    pub async fn archive_board(
        pool: &PgPool,
        board_id: Uuid,
        user_id: Uuid,
    ) -> Result<BoardActionMessage, AppError> {
        let board = load_board_for_access(pool, board_id).await?;
        ensure_board_not_deleted(&board)?;
        require_board_permission_with_board(pool, &board, user_id, BoardPermission::ManageBoard)
            .await?;
        if board.archived_at.is_some() {
            return Ok(BoardActionMessage {
                message: "Board already archived".to_string(),
            });
        }

        let mut tx = pool.begin().await?;
        board_repo::set_board_archived(&mut tx, board_id, Some(Utc::now())).await?;
        tx.commit().await?;

        Ok(BoardActionMessage {
            message: "Board archived".to_string(),
        })
    }

    /// Unarchives a board.
    pub async fn unarchive_board(
        pool: &PgPool,
        board_id: Uuid,
        user_id: Uuid,
    ) -> Result<BoardActionMessage, AppError> {
        let board = load_board_for_access(pool, board_id).await?;
        ensure_board_not_deleted(&board)?;
        require_board_permission_with_board(pool, &board, user_id, BoardPermission::ManageBoard)
            .await?;
        if board.archived_at.is_none() {
            return Ok(BoardActionMessage {
                message: "Board already active".to_string(),
            });
        }

        let mut tx = pool.begin().await?;
        board_repo::set_board_archived(&mut tx, board_id, None).await?;
        tx.commit().await?;

        Ok(BoardActionMessage {
            message: "Board unarchived".to_string(),
        })
    }

    /// Transfers board ownership to another member.
    pub async fn transfer_board_ownership(
        pool: &PgPool,
        board_id: Uuid,
        requester_id: Uuid,
        req: TransferBoardOwnershipRequest,
    ) -> Result<BoardActionMessage, AppError> {
        let board = load_board_for_access(pool, board_id).await?;
        ensure_board_active(&board)?;
        require_board_owner_with_board(pool, &board, requester_id).await?;

        let member = board_repo::get_board_member_by_user_id(pool, board_id, req.new_owner_id)
            .await?
            .ok_or(AppError::NotFound(
                "Target user is not a board member".to_string(),
            ))?;
        if member.role == BoardRole::Owner {
            return Ok(BoardActionMessage {
                message: "User is already an owner".to_string(),
            });
        }

        let mut tx = pool.begin().await?;
        board_repo::set_actor_id(&mut tx, requester_id).await?;
        board_repo::demote_other_board_owners(&mut tx, board_id, req.new_owner_id).await?;
        board_repo::update_board_member_role(
            &mut tx,
            board_id,
            member.user_id,
            BoardRole::Owner,
            None,
        )
        .await?;
        tx.commit().await?;

        Ok(BoardActionMessage {
            message: "Board ownership transferred".to_string(),
        })
    }

    /// Soft deletes a board (moves to trash).
    pub async fn delete_board(
        pool: &PgPool,
        board_id: Uuid,
        requester_id: Uuid,
    ) -> Result<BoardActionMessage, AppError> {
        let board = load_board_including_deleted(pool, board_id).await?;
        require_board_owner_with_board(pool, &board, requester_id).await?;

        if board.deleted_at.is_some() {
            return Ok(BoardActionMessage {
                message: "Board already in trash".to_string(),
            });
        }

        let mut tx = pool.begin().await?;
        board_repo::mark_board_deleted(&mut tx, board_id).await?;
        tx.commit().await?;
        BusinessEvent::BoardDeleted {
            board_id,
            user_id: requester_id,
        }
        .log();

        Ok(BoardActionMessage {
            message: "Board moved to trash".to_string(),
        })
    }

    /// Restores a board from trash.
    pub async fn restore_board(
        pool: &PgPool,
        board_id: Uuid,
        requester_id: Uuid,
    ) -> Result<BoardActionMessage, AppError> {
        let board = load_board_including_deleted(pool, board_id).await?;
        require_board_owner_with_board(pool, &board, requester_id).await?;
        ensure_board_restorable(&board)?;

        let mut tx = pool.begin().await?;
        board_repo::restore_board(&mut tx, board_id).await?;
        tx.commit().await?;

        Ok(BoardActionMessage {
            message: "Board restored".to_string(),
        })
    }

    /// Purges boards that have been deleted beyond the retention window.
    pub async fn purge_deleted_boards(pool: &PgPool) -> Result<u64, AppError> {
        let mut tx = pool.begin().await?;
        let purged = board_repo::purge_deleted_boards(&mut tx, TRASH_RETENTION_DAYS).await?;
        tx.commit().await?;
        Ok(purged)
    }

    /// Lists board members.
    pub async fn list_board_members(
        pool: &PgPool,
        board_id: Uuid,
        user_id: Uuid,
    ) -> Result<BoardMembersResponse, AppError> {
        let board = load_board_for_access(pool, board_id).await?;
        ensure_board_active(&board)?;
        require_board_permission_with_board(pool, &board, user_id, BoardPermission::View).await?;
        let is_org_board = board.organization_id.is_some();
        let rows = board_repo::list_board_members(pool, board_id).await?;
        let data = rows
            .into_iter()
            .map(|row| {
                let effective_permissions = resolve_member_permissions(
                    row.role,
                    row.custom_permissions.as_ref(),
                    is_org_board,
                    row.org_role,
                );
                BoardMemberResponse {
                    id: row.member_id,
                    user: BoardMemberUser {
                        id: row.user_id,
                        username: row.username.unwrap_or_default(),
                        display_name: row.display_name,
                        avatar_url: row.avatar_url,
                    },
                    role: row.role,
                    custom_permissions: row.custom_permissions,
                    effective_permissions,
                    created_at: row.created_at,
                    updated_at: row.updated_at,
                }
            })
            .collect();

        Ok(BoardMembersResponse { data })
    }

    /// Invites board members by email (existing users only).
    pub async fn invite_board_members(
        pool: &PgPool,
        email_service: Option<&EmailService>,
        board_id: Uuid,
        inviter_id: Uuid,
        req: InviteBoardMembersRequest,
    ) -> Result<InviteBoardMembersResponse, AppError> {
        require_board_permission(pool, board_id, inviter_id, BoardPermission::ManageMembers)
            .await?;

        let InviteBoardMembersRequest {
            email,
            emails,
            role,
        } = req;
        let role = normalize_board_role(role)?;
        let emails = collect_invite_emails(email, emails)?;
        let users = load_invite_users(pool, &emails).await?;
        let organization_id = board_repo::load_board_organization_id(pool, board_id).await?;
        if let Some(org_id) = organization_id {
            for user in &users {
                let member = org_repo::get_member_by_user_id(pool, org_id, user.id).await?;
                let member_role = member.map(|record| record.role);
                ensure_guest_role_permissions(member_role, role, None)?;
            }
        }
        let (organization, pending_org_invites) =
            prepare_org_invites(pool, organization_id, &users).await?;

        let mut tx = pool.begin().await?;
        board_repo::set_actor_id(&mut tx, inviter_id).await?;
        let invited_emails: Vec<String> = users.iter().map(|user| user.email.clone()).collect();
        let mut org_invite_users: Vec<User> = Vec::new();
        let mut pending_events: Vec<BusinessEvent> = Vec::new();
        if let Some(org_id) = organization_id {
            for user in &pending_org_invites {
                if org_repo::organization_member_exists(&mut tx, org_id, user.id).await? {
                    continue;
                }
                org_repo::add_member_invite(&mut tx, org_id, user.id, OrgRole::Guest, inviter_id)
                    .await?;
                pending_events.push(BusinessEvent::MemberInvited {
                    org_id,
                    inviter_id,
                    invitee_email_redacted: redact_email(&user.email),
                });
                org_invite_users.push(user.clone());
            }
        }
        for user in users {
            board_repo::add_board_member(&mut tx, board_id, user.id, role, inviter_id).await?;
            pending_events.push(BusinessEvent::BoardShared {
                board_id,
                shared_by: inviter_id,
                shared_with: user.id,
                role: format!("{:?}", role).to_lowercase(),
            });
        }
        tx.commit().await?;
        for event in pending_events {
            event.log();
        }

        if let Some(org) = organization {
            send_invite_emails(email_service, &org, &org_invite_users).await?;
        }

        Ok(InviteBoardMembersResponse {
            invited: invited_emails,
        })
    }

    /// Updates a board member role.
    pub async fn update_board_member_role(
        pool: &PgPool,
        board_id: Uuid,
        requester_id: Uuid,
        member_id: Uuid,
        req: UpdateBoardMemberRoleRequest,
    ) -> Result<BoardMemberChange, AppError> {
        let requester_access =
            require_board_permission(pool, board_id, requester_id, BoardPermission::ManageMembers)
                .await?;

        let member = board_repo::get_board_member_by_id(pool, board_id, member_id)
            .await?
            .ok_or(AppError::NotFound("Board member not found".to_string()))?;
        let organization_id = board_repo::load_board_organization_id(pool, board_id).await?;
        let mut org_role: Option<OrgRole> = None;
        if let Some(org_id) = organization_id {
            let member_record =
                org_repo::get_member_by_user_id(pool, org_id, member.user_id).await?;
            org_role = member_record.map(|record| record.role);
            ensure_guest_role_permissions(org_role, req.role, req.custom_permissions.as_ref())?;
        }

        if member.role == BoardRole::Owner && requester_access.role != BoardRole::Owner {
            return Err(AppError::Forbidden(
                "Only owners can update owner roles".to_string(),
            ));
        }

        if req.role == BoardRole::Owner && requester_access.role != BoardRole::Owner {
            return Err(AppError::Forbidden(
                "Only owners can assign owner role".to_string(),
            ));
        }

        let mut tx = pool.begin().await?;
        board_repo::set_actor_id(&mut tx, requester_id).await?;
        board_repo::update_board_member_role(
            &mut tx,
            board_id,
            member_id,
            req.role,
            req.custom_permissions.clone(),
        )
        .await?;
        tx.commit().await?;

        let final_permissions = resolve_member_permissions(
            req.role,
            req.custom_permissions
                .as_ref()
                .or(member.custom_permissions.as_ref()),
            organization_id.is_some(),
            org_role,
        );

        Ok(BoardMemberChange {
            message: BoardActionMessage {
                message: "Board member role updated".to_string(),
            },
            member_user_id: member.user_id,
            role: Some(req.role),
            permissions: Some(final_permissions),
        })
    }

    /// Removes a board member.
    pub async fn remove_board_member(
        pool: &PgPool,
        board_id: Uuid,
        requester_id: Uuid,
        member_id: Uuid,
    ) -> Result<BoardMemberChange, AppError> {
        let requester_access =
            require_board_permission(pool, board_id, requester_id, BoardPermission::ManageMembers)
                .await?;

        let member = board_repo::get_board_member_by_id(pool, board_id, member_id)
            .await?
            .ok_or(AppError::NotFound("Board member not found".to_string()))?;

        if member.role == BoardRole::Owner {
            if requester_access.role != BoardRole::Owner {
                return Err(AppError::Forbidden(
                    "Only owners can remove owners".to_string(),
                ));
            }
            let owners = board_repo::count_board_owners(pool, board_id).await?;
            if owners <= 1 {
                return Err(AppError::BadRequest(
                    "Cannot remove the last owner".to_string(),
                ));
            }
        }

        let mut tx = pool.begin().await?;
        board_repo::set_actor_id(&mut tx, requester_id).await?;
        board_repo::remove_board_member(&mut tx, board_id, member_id).await?;
        tx.commit().await?;

        Ok(BoardMemberChange {
            message: BoardActionMessage {
                message: "Board member removed".to_string(),
            },
            member_user_id: member.user_id,
            role: None,
            permissions: None,
        })
    }
}

async fn clone_template_elements(
    tx: &mut Transaction<'_, Postgres>,
    board_id: Uuid,
    user_id: Uuid,
    template_elements: Vec<BoardElement>,
) -> Result<Vec<BoardElement>, AppError> {
    element_repo::lock_board_elements(tx, board_id).await?;
    let mut id_map = HashMap::with_capacity(template_elements.len());
    for element in &template_elements {
        id_map.insert(element.id, Uuid::new_v4());
    }

    let mut cloned_elements = Vec::with_capacity(template_elements.len());
    for element in template_elements {
        let new_id = *id_map
            .get(&element.id)
            .ok_or_else(|| AppError::Internal("Missing template element id mapping".to_string()))?;
        let parent_id = element
            .parent_id
            .and_then(|parent| id_map.get(&parent).copied());
        let cloned = element_repo::create_element(
            tx,
            element_repo::CreateElementParams {
                id: Some(new_id),
                board_id,
                layer_id: element.layer_id,
                parent_id,
                created_by: user_id,
                element_type: element.element_type,
                position_x: element.position_x,
                position_y: element.position_y,
                width: element.width,
                height: element.height,
                rotation: element.rotation,
                z_index: element.z_index,
                style: element.style,
                properties: element.properties,
                metadata: element.metadata,
            },
        )
        .await?;
        cloned_elements.push(cloned);
    }

    Ok(cloned_elements)
}

fn validate_canvas_settings(settings: &CanvasSettings) -> Result<(), AppError> {
    if settings.width <= 0.0 || settings.height <= 0.0 {
        return Err(AppError::BadRequest(
            "Canvas dimensions must be positive".to_string(),
        ));
    }
    if settings.grid_size <= 0 {
        return Err(AppError::BadRequest(
            "Grid size must be positive".to_string(),
        ));
    }
    Ok(())
}

async fn require_board_permission(
    pool: &PgPool,
    board_id: Uuid,
    user_id: Uuid,
    permission: BoardPermission,
) -> Result<BoardAccess, AppError> {
    let access = resolve_board_access(pool, board_id, user_id).await?;
    ensure_permission(&access.permissions, permission)?;
    Ok(access)
}

async fn require_board_permission_with_board(
    pool: &PgPool,
    board: &Board,
    user_id: Uuid,
    permission: BoardPermission,
) -> Result<BoardAccess, AppError> {
    let access = resolve_board_access_with_board(pool, board, user_id).await?;
    ensure_permission(&access.permissions, permission)?;
    Ok(access)
}

async fn require_board_owner_with_board(
    pool: &PgPool,
    board: &Board,
    user_id: Uuid,
) -> Result<BoardAccess, AppError> {
    let access = resolve_board_access_with_board(pool, board, user_id).await?;
    if access.role != BoardRole::Owner {
        return Err(AppError::Forbidden(
            "Only board owners can manage this board".to_string(),
        ));
    }
    Ok(access)
}

async fn resolve_board_access(
    pool: &PgPool,
    board_id: Uuid,
    user_id: Uuid,
) -> Result<BoardAccess, AppError> {
    let board = load_board_for_access(pool, board_id).await?;
    ensure_board_active(&board)?;
    resolve_board_access_with_board(pool, &board, user_id).await
}

async fn resolve_board_access_with_board(
    pool: &PgPool,
    board: &Board,
    user_id: Uuid,
) -> Result<BoardAccess, AppError> {
    let (board_member, org_member) = match board.organization_id {
        Some(org_id) => {
            // Perf: fetch board + org membership in parallel to reduce access latency.
            tokio::try_join!(
                board_repo::get_board_member_access(pool, board.id, user_id),
                org_repo::get_member_by_user_id(pool, org_id, user_id),
            )?
        }
        None => (
            board_repo::get_board_member_access(pool, board.id, user_id).await?,
            None,
        ),
    };

    if let Some(member) = board_member {
        if board.organization_id.is_some() {
            match org_member {
                Some(record) if record.accepted_at.is_some() => {
                    let permissions = resolve_board_permissions_for_org_member(
                        member.role,
                        member.custom_permissions.as_ref(),
                        record.role,
                    );
                    return Ok(BoardAccess {
                        role: member.role,
                        permissions,
                    });
                }
                _ => {
                    return Err(AppError::Forbidden(
                        "You must accept the workspace invitation before accessing this board"
                            .to_string(),
                    ));
                }
            }
        }

        let permissions = member
            .role
            .permissions()
            .apply_overrides(member.custom_permissions.as_ref());
        return Ok(BoardAccess {
            role: member.role,
            permissions,
        });
    }

    if let Some(record) = org_member {
        if record.accepted_at.is_some() && matches!(record.role, OrgRole::Owner | OrgRole::Admin) {
            return Ok(BoardAccess {
                role: BoardRole::Viewer,
                permissions: BoardPermissions::viewer_only(),
            });
        }
    }

    if board.is_public {
        return Ok(BoardAccess {
            role: BoardRole::Viewer,
            permissions: BoardPermissions::viewer_only(),
        });
    }

    Err(AppError::Forbidden(
        "You are not a member of this board".to_string(),
    ))
}

async fn load_board_for_access(pool: &PgPool, board_id: Uuid) -> Result<Board, AppError> {
    board_repo::find_board_by_id_including_deleted(pool, board_id)
        .await?
        .ok_or(AppError::NotFound("Board not found".to_string()))
}

async fn load_board_including_deleted(pool: &PgPool, board_id: Uuid) -> Result<Board, AppError> {
    board_repo::find_board_by_id_including_deleted(pool, board_id)
        .await?
        .ok_or(AppError::NotFound("Board not found".to_string()))
}

fn ensure_org_manager(role: OrgRole) -> Result<(), AppError> {
    match role {
        OrgRole::Owner | OrgRole::Admin => Ok(()),
        _ => Err(AppError::Forbidden(
            "Only organization owners or admins can create boards".to_string(),
        )),
    }
}

fn ensure_board_capacity(current: i64, limit: i32) -> Result<(), AppError> {
    if is_limit_exceeded(current, 1, limit) {
        return Err(AppError::LimitExceeded(
            "Board limit reached for subscription tier".to_string(),
        ));
    }

    Ok(())
}

fn resolve_active_tier(user: &User) -> SubscriptionTier {
    if user.subscription_tier == SubscriptionTier::Free {
        return SubscriptionTier::Free;
    }

    match user.subscription_expires_at {
        Some(expires_at) if expires_at > Utc::now() => user.subscription_tier,
        _ => SubscriptionTier::Free,
    }
}

fn resolve_board_permissions_for_org_member(
    role: BoardRole,
    custom_permissions: Option<&BoardPermissionOverrides>,
    org_role: OrgRole,
) -> BoardPermissions {
    if org_role == OrgRole::Guest {
        return BoardPermissions::viewer_only();
    }

    role.permissions().apply_overrides(custom_permissions)
}

fn resolve_member_permissions(
    role: BoardRole,
    custom_permissions: Option<&BoardPermissionOverrides>,
    is_org_board: bool,
    org_role: Option<OrgRole>,
) -> BoardPermissions {
    if is_org_board && matches!(org_role, Some(OrgRole::Guest) | None) {
        return BoardPermissions::viewer_only();
    }

    role.permissions().apply_overrides(custom_permissions)
}

fn ensure_permission(
    permissions: &BoardPermissions,
    permission: BoardPermission,
) -> Result<(), AppError> {
    let allowed = match permission {
        BoardPermission::View => permissions.can_view,
        BoardPermission::Edit => permissions.can_edit,
        BoardPermission::Comment => permissions.can_comment,
        BoardPermission::ManageMembers => permissions.can_manage_members,
        BoardPermission::ManageBoard => permissions.can_manage_board,
    };

    if allowed {
        return Ok(());
    }

    let message = match permission {
        BoardPermission::View => "You do not have permission to view this board",
        BoardPermission::Edit => "You do not have permission to edit this board",
        BoardPermission::Comment => "You do not have permission to comment on this board",
        BoardPermission::ManageMembers => "You do not have permission to manage this board",
        BoardPermission::ManageBoard => "You do not have permission to manage this board",
    };

    Err(AppError::Forbidden(message.to_string()))
}

fn ensure_guest_role_permissions(
    org_role: Option<OrgRole>,
    role: BoardRole,
    custom_permissions: Option<&BoardPermissionOverrides>,
) -> Result<(), AppError> {
    if !matches!(org_role, Some(OrgRole::Guest) | None) {
        return Ok(());
    }

    if role != BoardRole::Viewer {
        return Err(AppError::Forbidden(
            "Guest members can only be assigned viewer role".to_string(),
        ));
    }

    if let Some(overrides) = custom_permissions {
        let restricted = overrides.can_edit.unwrap_or(false)
            || overrides.can_comment.unwrap_or(false)
            || overrides.can_manage_members.unwrap_or(false)
            || overrides.can_manage_board.unwrap_or(false);
        if restricted {
            return Err(AppError::Forbidden(
                "Guest members can only be assigned viewer role".to_string(),
            ));
        }
    }

    Ok(())
}

fn ensure_board_not_archived(board: &Board) -> Result<(), AppError> {
    if board.archived_at.is_some() {
        return Err(AppError::BoardArchived(
            "Board has been archived".to_string(),
        ));
    }
    Ok(())
}

fn ensure_board_not_deleted(board: &Board) -> Result<(), AppError> {
    if board.deleted_at.is_some() {
        return Err(AppError::BoardDeleted("Board has been deleted".to_string()));
    }
    Ok(())
}

fn ensure_board_active(board: &Board) -> Result<(), AppError> {
    ensure_board_not_deleted(board)?;
    ensure_board_not_archived(board)?;
    Ok(())
}

fn ensure_board_restorable(board: &Board) -> Result<(), AppError> {
    let deleted_at = board
        .deleted_at
        .ok_or(AppError::BadRequest("Board is not in trash".to_string()))?;
    let expires_at = deleted_at + Duration::days(TRASH_RETENTION_DAYS);
    if Utc::now() > expires_at {
        return Err(AppError::BoardDeleted(
            "Board has been permanently deleted".to_string(),
        ));
    }
    Ok(())
}

fn normalize_optional_name(name: Option<String>) -> Result<Option<String>, AppError> {
    let Some(value) = name else {
        return Ok(None);
    };
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(AppError::BadRequest(
            "Board name cannot be empty".to_string(),
        ));
    }
    Ok(Some(trimmed.to_string()))
}

fn normalize_optional_description(description: Option<String>) -> Option<String> {
    description.and_then(|value| {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}

fn ensure_member_capacity(current: i64, additional: i64, limit: i32) -> Result<(), AppError> {
    if is_limit_exceeded(current, additional, limit) {
        return Err(AppError::LimitExceeded(
            "Organization member limit reached".to_string(),
        ));
    }

    Ok(())
}

fn is_limit_exceeded(current: i64, additional: i64, limit: i32) -> bool {
    if limit <= 0 {
        return false;
    }

    current.saturating_add(additional) > i64::from(limit)
}

async fn prepare_org_invites(
    pool: &PgPool,
    organization_id: Option<Uuid>,
    users: &[User],
) -> Result<
    (
        Option<crate::models::organizations::Organization>,
        Vec<User>,
    ),
    AppError,
> {
    let Some(organization_id) = organization_id else {
        return Ok((None, Vec::new()));
    };

    let organization = org_repo::find_organization_by_id(pool, organization_id)
        .await?
        .ok_or(AppError::NotFound("Organization not found".to_string()))?;

    let mut pending_invites = Vec::new();
    for user in users {
        if org_repo::get_member_by_user_id(pool, organization_id, user.id)
            .await?
            .is_none()
        {
            pending_invites.push(user.clone());
        }
    }

    let current_members = org_repo::count_organization_members(pool, organization_id).await?;
    let current_invites = org_repo::count_organization_email_invites(pool, organization_id).await?;
    ensure_member_capacity(
        current_members + current_invites,
        pending_invites.len() as i64,
        organization.max_members,
    )?;

    Ok((Some(organization), pending_invites))
}

#[cfg(test)]
mod tests {
    use super::is_limit_exceeded;

    #[test]
    fn limit_exceeded_when_over_capacity() {
        assert!(is_limit_exceeded(9, 1, 9));
        assert!(!is_limit_exceeded(8, 1, 9));
    }

    #[test]
    fn limit_exceeded_skips_when_unlimited() {
        assert!(!is_limit_exceeded(20, 1, 0));
    }
}

fn normalize_board_role(role: Option<BoardRole>) -> Result<BoardRole, AppError> {
    let role = role.unwrap_or(BoardRole::Viewer);
    Ok(role)
}

async fn load_invite_users(
    pool: &PgPool,
    emails: &[String],
) -> Result<Vec<crate::models::users::User>, AppError> {
    let users = user_repo::find_users_by_emails(pool, emails).await?;

    let user_map: HashMap<String, crate::models::users::User> =
        users.into_iter().map(|u| (u.email.clone(), u)).collect();

    if user_map.len() != emails.len() {
        let missing: Vec<String> = emails
            .iter()
            .filter(|e| !user_map.contains_key(*e))
            .cloned()
            .collect();

        if !missing.is_empty() {
            return Err(AppError::ValidationError(format!(
                "User not found for email(s): {}",
                missing.join(", ")
            )));
        }
    }
    let mut ordered_users = Vec::with_capacity(emails.len());
    for email in emails {
        if let Some(user) = user_map.get(email) {
            ordered_users.push(user.clone());
        }
    }

    Ok(ordered_users)
}
