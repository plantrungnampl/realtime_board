use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    dto::boards::{
        BoardActionMessage, BoardMemberResponse, BoardMemberUser, BoardMembersResponse,
        BoardResponse, CreateBoardRequest, InviteBoardMembersRequest, InviteBoardMembersResponse,
        UpdateBoardMemberRoleRequest,
    },
    error::AppError,
    models::boards::{Board, BoardRole},
    repositories::boards as board_repo,
    repositories::organizations as org_repo,
    repositories::users as user_repo,
};
pub struct BoardService;

impl BoardService {
    pub async fn get_board(pool: &PgPool, user_id: Uuid) -> Result<Vec<BoardResponse>, AppError> {
        board_repo::list_boards_for_user(pool, user_id).await
    }

    pub async fn create_board(
        pool: &PgPool,
        req: CreateBoardRequest,
        user_id: Uuid,
    ) -> Result<Board, AppError> {
        let organization_id = req.organization_id;
        if let Some(organization_id) = organization_id {
            let organization = org_repo::find_organization_by_id(pool, organization_id)
                .await?
                .ok_or(AppError::NotFound("Organization not found".to_string()))?;
            org_repo::get_member_role(pool, organization_id, user_id)
                .await?
                .ok_or(AppError::Forbidden(
                    "You are not a member of this organization".to_string(),
                ))?;

            let board_count =
                board_repo::count_boards_by_organization(pool, organization_id).await?;
            ensure_board_capacity(board_count, organization.max_boards)?;
        }

        let mut tx = pool.begin().await?;
        let board = board_repo::create_board(&mut tx, req, user_id).await?;
        board_repo::add_owner_member(&mut tx, board.id, user_id).await?;
        tx.commit().await?;

        Ok(board)
    }

    /// Lists board members.
    pub async fn list_board_members(
        pool: &PgPool,
        board_id: Uuid,
        user_id: Uuid,
    ) -> Result<BoardMembersResponse, AppError> {
        require_board_role(pool, board_id, user_id).await?;
        let rows = board_repo::list_board_members(pool, board_id).await?;
        let data = rows
            .into_iter()
            .map(|row| BoardMemberResponse {
                id: row.member_id,
                user: BoardMemberUser {
                    id: row.user_id,
                    username: row.username.unwrap_or_default(),
                    display_name: row.display_name,
                    avatar_url: row.avatar_url,
                },
                role: row.role,
                created_at: row.created_at,
                updated_at: row.updated_at,
            })
            .collect();

        Ok(BoardMembersResponse { data })
    }

    /// Invites board members by email (existing users only).
    pub async fn invite_board_members(
        pool: &PgPool,
        board_id: Uuid,
        inviter_id: Uuid,
        req: InviteBoardMembersRequest,
    ) -> Result<InviteBoardMembersResponse, AppError> {
        let inviter_role = require_board_role(pool, board_id, inviter_id).await?;
        ensure_board_manager(inviter_role)?;

        let InviteBoardMembersRequest {
            email,
            emails,
            role,
        } = req;
        let role = normalize_board_role(role)?;
        let emails = collect_invite_emails(email, emails)?;
        let users = load_invite_users(pool, &emails).await?;

        let mut tx = pool.begin().await?;
        let invited_emails: Vec<String> = users.iter().map(|user| user.email.clone()).collect();
        for user in users {
            board_repo::add_board_member(&mut tx, board_id, user.id, role, inviter_id).await?;
        }
        tx.commit().await?;

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
    ) -> Result<BoardActionMessage, AppError> {
        let requester_role = require_board_role(pool, board_id, requester_id).await?;
        ensure_board_manager(requester_role)?;

        let member = board_repo::get_board_member_by_id(pool, board_id, member_id)
            .await?
            .ok_or(AppError::NotFound("Board member not found".to_string()))?;

        if member.role == BoardRole::Owner && requester_role != BoardRole::Owner {
            return Err(AppError::Forbidden(
                "Only owners can update owner roles".to_string(),
            ));
        }

        if req.role == BoardRole::Owner && requester_role != BoardRole::Owner {
            return Err(AppError::Forbidden(
                "Only owners can assign owner role".to_string(),
            ));
        }

        let mut tx = pool.begin().await?;
        board_repo::update_board_member_role(&mut tx, board_id, member_id, req.role).await?;
        tx.commit().await?;

        Ok(BoardActionMessage {
            message: "Board member role updated".to_string(),
        })
    }

    /// Removes a board member.
    pub async fn remove_board_member(
        pool: &PgPool,
        board_id: Uuid,
        requester_id: Uuid,
        member_id: Uuid,
    ) -> Result<BoardActionMessage, AppError> {
        let requester_role = require_board_role(pool, board_id, requester_id).await?;
        ensure_board_manager(requester_role)?;

        let member = board_repo::get_board_member_by_id(pool, board_id, member_id)
            .await?
            .ok_or(AppError::NotFound("Board member not found".to_string()))?;

        if member.role == BoardRole::Owner {
            if requester_role != BoardRole::Owner {
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
        board_repo::remove_board_member(&mut tx, board_id, member_id).await?;
        tx.commit().await?;

        Ok(BoardActionMessage {
            message: "Board member removed".to_string(),
        })
    }
}

async fn require_board_role(
    pool: &PgPool,
    board_id: Uuid,
    user_id: Uuid,
) -> Result<BoardRole, AppError> {
    board_repo::get_board_member_role(pool, board_id, user_id)
        .await?
        .ok_or(AppError::Forbidden(
            "You are not a member of this board".to_string(),
        ))
}

fn ensure_board_manager(role: BoardRole) -> Result<(), AppError> {
    match role {
        BoardRole::Owner | BoardRole::Admin => Ok(()),
        _ => Err(AppError::Forbidden(
            "You do not have permission to manage board members".to_string(),
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

fn is_limit_exceeded(current: i64, additional: i64, limit: i32) -> bool {
    if limit <= 0 {
        return false;
    }

    current.saturating_add(additional) > i64::from(limit)
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

fn collect_invite_emails(
    email: Option<String>,
    email_list: Option<Vec<String>>,
) -> Result<Vec<String>, AppError> {
    let mut emails = Vec::new();
    if let Some(email) = email {
        emails.push(email);
    }
    if let Some(list) = email_list {
        emails.extend(list);
    }

    let mut unique = std::collections::HashSet::new();
    let mut cleaned = Vec::new();
    for email in emails {
        let trimmed = email.trim().to_lowercase();
        if trimmed.is_empty() {
            continue;
        }
        if !unique.insert(trimmed.clone()) {
            return Err(AppError::ValidationError(format!(
                "Duplicate email in invite list: {}",
                trimmed
            )));
        }
        cleaned.push(trimmed);
    }

    if cleaned.is_empty() {
        return Err(AppError::ValidationError(
            "At least one email is required".to_string(),
        ));
    }

    let invalid: Vec<String> = cleaned
        .iter()
        .filter(|email| !is_valid_email(email))
        .cloned()
        .collect();
    if !invalid.is_empty() {
        return Err(AppError::ValidationError(format!(
            "Invalid email(s): {}",
            invalid.join(", ")
        )));
    }

    Ok(cleaned)
}

fn is_valid_email(email: &str) -> bool {
    let trimmed = email.trim();
    if trimmed.is_empty() || trimmed.contains(' ') {
        return false;
    }
    let mut parts = trimmed.split('@');
    let local = match parts.next() {
        Some(value) => value,
        None => return false,
    };
    let domain = match parts.next() {
        Some(value) => value,
        None => return false,
    };
    if parts.next().is_some() {
        return false;
    }
    if local.is_empty() || domain.is_empty() {
        return false;
    }
    if domain.starts_with('.') || domain.ends_with('.') {
        return false;
    }
    domain.contains('.')
}

async fn load_invite_users(
    pool: &PgPool,
    emails: &[String],
) -> Result<Vec<crate::models::users::User>, AppError> {
    let mut users = Vec::new();
    let mut missing = Vec::new();
    for email in emails {
        match user_repo::find_user_by_email(pool, email).await? {
            Some(user) => users.push(user),
            None => missing.push(email.clone()),
        }
    }

    if !missing.is_empty() {
        return Err(AppError::ValidationError(format!(
            "User not found for email(s): {}",
            missing.join(", ")
        )));
    }

    Ok(users)
}
