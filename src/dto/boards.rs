use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::models::boards::BoardRole;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CreateBoardRequest {
    pub organization_id: Option<Uuid>,
    pub name: String,
    pub description: Option<String>,
    pub thumbnail_url: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct BoardResponse {
    pub id: Uuid,
    pub created_by: Uuid,
    pub organization_id: Option<Uuid>,
    pub name: String,
    pub username: String,
    pub description: Option<String>,
    pub thumbnail_url: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Board member user payload.
#[derive(Debug, Serialize)]
pub struct BoardMemberUser {
    pub id: Uuid,
    pub username: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
}

/// Board member payload.
#[derive(Debug, Serialize)]
pub struct BoardMemberResponse {
    pub id: Uuid,
    pub user: BoardMemberUser,
    pub role: BoardRole,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Response payload for board members.
#[derive(Debug, Serialize)]
pub struct BoardMembersResponse {
    pub data: Vec<BoardMemberResponse>,
}

/// Request payload for inviting board members.
#[derive(Debug, Deserialize)]
pub struct InviteBoardMembersRequest {
    pub email: Option<String>,
    pub emails: Option<Vec<String>>,
    pub role: Option<BoardRole>,
}

/// Response payload for invite results.
#[derive(Debug, Serialize)]
pub struct InviteBoardMembersResponse {
    pub invited: Vec<String>,
}

/// Request payload for updating a board member role.
#[derive(Debug, Deserialize)]
pub struct UpdateBoardMemberRoleRequest {
    pub role: BoardRole,
}

/// Response payload for board actions.
#[derive(Debug, Serialize)]
pub struct BoardActionMessage {
    pub message: String,
}
