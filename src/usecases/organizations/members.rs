use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    dto::organizations::{
        OrganizationActionMessage, OrganizationMemberResponse, OrganizationMemberUser,
        OrganizationMembersResponse, UpdateMemberRoleRequest,
    },
    error::AppError,
    models::organizations::OrgRole,
    repositories::{boards as board_repo, organizations as org_repo},
};

use super::{
    OrganizationService,
    helpers::{ensure_manager, require_member_role, resolve_fallback_owner_id},
};

impl OrganizationService {
    /// Lists organization members.
    pub async fn list_members(
        pool: &PgPool,
        organization_id: Uuid,
        user_id: Uuid,
    ) -> Result<OrganizationMembersResponse, AppError> {
        require_member_role(pool, organization_id, user_id).await?;
        let rows = org_repo::list_members(pool, organization_id).await?;
        let data = rows
            .into_iter()
            .map(|row| OrganizationMemberResponse {
                id: row.member_id,
                user: OrganizationMemberUser {
                    id: row.user_id,
                    username: row.username.unwrap_or_default(),
                    display_name: row.display_name,
                    avatar_url: row.avatar_url,
                },
                role: row.role,
                invited_at: row.invited_at,
                accepted_at: row.accepted_at,
                created_at: row.created_at,
                updated_at: row.updated_at,
            })
            .collect();

        Ok(OrganizationMembersResponse { data })
    }

    /// Updates a member role or transfers ownership.
    pub async fn update_member_role(
        pool: &PgPool,
        organization_id: Uuid,
        requester_id: Uuid,
        member_id: Uuid,
        req: UpdateMemberRoleRequest,
    ) -> Result<OrganizationActionMessage, AppError> {
        let requester_role = require_member_role(pool, organization_id, requester_id).await?;
        ensure_manager(requester_role)?;

        let member = org_repo::get_member_by_id(pool, organization_id, member_id)
            .await?
            .ok_or(AppError::NotFound(
                "Organization member not found".to_string(),
            ))?;

        if member.user_id == requester_id && req.role != member.role {
            return Err(AppError::Forbidden(
                "You cannot change your own role".to_string(),
            ));
        }

        if member.role == OrgRole::Owner && requester_role != OrgRole::Owner {
            return Err(AppError::Forbidden(
                "Only owners can update owner roles".to_string(),
            ));
        }

        let mut tx = pool.begin().await?;
        if req.role == OrgRole::Owner {
            if requester_role != OrgRole::Owner {
                return Err(AppError::Forbidden(
                    "Only owners can transfer ownership".to_string(),
                ));
            }
            org_repo::demote_other_owners(&mut tx, organization_id, member_id, OrgRole::Admin)
                .await?;
            org_repo::update_member_role(&mut tx, organization_id, member_id, OrgRole::Owner)
                .await?;
        } else {
            org_repo::update_member_role(&mut tx, organization_id, member_id, req.role).await?;
        }
        tx.commit().await?;

        Ok(OrganizationActionMessage {
            message: "Member role updated".to_string(),
        })
    }

    /// Removes a member from an organization.
    pub async fn remove_member(
        pool: &PgPool,
        organization_id: Uuid,
        requester_id: Uuid,
        member_id: Uuid,
    ) -> Result<OrganizationActionMessage, AppError> {
        let requester_role = require_member_role(pool, organization_id, requester_id).await?;
        ensure_manager(requester_role)?;

        let member = org_repo::get_member_by_id(pool, organization_id, member_id)
            .await?
            .ok_or(AppError::NotFound(
                "Organization member not found".to_string(),
            ))?;

        if member.role == OrgRole::Owner {
            if requester_role != OrgRole::Owner {
                return Err(AppError::Forbidden(
                    "Only owners can remove owners".to_string(),
                ));
            }
            let owners = org_repo::count_owners(pool, organization_id).await?;
            if owners <= 1 {
                return Err(AppError::BadRequest(
                    "Cannot remove the last owner".to_string(),
                ));
            }
        }

        let mut tx = pool.begin().await?;
        let boards_to_transfer = board_repo::list_boards_requiring_owner_transfer(
            &mut tx,
            organization_id,
            member.user_id,
        )
        .await?;
        if !boards_to_transfer.is_empty() {
            let fallback_owner_id = resolve_fallback_owner_id(
                pool,
                organization_id,
                requester_id,
                requester_role,
                member.user_id,
            )
            .await?;
            for board_id in boards_to_transfer {
                board_repo::ensure_board_owner(&mut tx, board_id, fallback_owner_id).await?;
            }
        }
        board_repo::remove_board_memberships_by_organization(
            &mut tx,
            organization_id,
            member.user_id,
        )
        .await?;
        org_repo::remove_member(&mut tx, organization_id, member_id).await?;
        tx.commit().await?;

        Ok(OrganizationActionMessage {
            message: "Member removed".to_string(),
        })
    }
}
