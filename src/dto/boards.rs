use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::models::boards::{
    BoardPermissionOverrides, BoardPermissions, BoardRole, CanvasSettings,
};

/// Optional filters for listing boards.
#[derive(Debug, Deserialize)]
pub struct BoardListQuery {
    pub organization_id: Option<Uuid>,
    pub is_template: Option<bool>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CreateBoardRequest {
    pub organization_id: Option<Uuid>,
    pub name: String,
    pub description: Option<String>,
    pub thumbnail_url: Option<String>,
    pub is_public: Option<bool>,
    pub is_template: Option<bool>,
    pub template_board_id: Option<Uuid>,
    pub canvas_settings: Option<CanvasSettingsInput>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasSettingsInput {
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub background_color: Option<String>,
    pub grid_size: Option<i32>,
    pub grid_enabled: Option<bool>,
    pub snap_to_grid: Option<bool>,
    pub show_rulers: Option<bool>,
    pub default_zoom: Option<f64>,
}

impl CanvasSettingsInput {
    pub fn apply_to(&self, mut settings: CanvasSettings) -> CanvasSettings {
        if let Some(width) = self.width {
            settings.width = width;
        }
        if let Some(height) = self.height {
            settings.height = height;
        }
        if let Some(background_color) = &self.background_color {
            settings.background_color = background_color.clone();
        }
        if let Some(grid_size) = self.grid_size {
            settings.grid_size = grid_size;
        }
        if let Some(grid_enabled) = self.grid_enabled {
            settings.grid_enabled = grid_enabled;
        }
        if let Some(snap_to_grid) = self.snap_to_grid {
            settings.snap_to_grid = snap_to_grid;
        }
        if let Some(show_rulers) = self.show_rulers {
            settings.show_rulers = show_rulers;
        }
        if let Some(default_zoom) = self.default_zoom {
            settings.default_zoom = default_zoom;
        }
        settings
    }
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
    pub is_favorite: bool,
    pub last_accessed_at: Option<DateTime<Utc>>,
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
    pub custom_permissions: Option<BoardPermissionOverrides>,
    pub effective_permissions: BoardPermissions,
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

#[derive(Debug, Deserialize, Serialize)]
pub struct UpdateBoardRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub is_public: Option<bool>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct TransferBoardOwnershipRequest {
    pub new_owner_id: Uuid,
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
    pub custom_permissions: Option<BoardPermissionOverrides>,
}

/// Response payload for board actions.
#[derive(Debug, Serialize)]
pub struct BoardActionMessage {
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct BoardFavoriteResponse {
    pub is_favorite: bool,
}
