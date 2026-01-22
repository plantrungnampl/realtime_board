use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::prelude::FromRow;
use uuid::Uuid;
/// Board member role mapping for core.board_role.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[serde(rename_all = "lowercase")]
#[sqlx(type_name = "core.board_role", rename_all = "lowercase")]
pub enum BoardRole {
    Owner,
    Admin,
    Editor,
    Commenter,
    Viewer,
}

impl BoardRole {
    /// Returns true when the role is allowed to modify board content.
    pub fn can_edit(self) -> bool {
        matches!(self, Self::Owner | Self::Admin | Self::Editor)
    }

    pub fn permissions(self) -> BoardPermissions {
        BoardPermissions::from_role(self)
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BoardPermissions {
    pub can_view: bool,
    pub can_edit: bool,
    pub can_comment: bool,
    pub can_manage_members: bool,
    pub can_manage_board: bool,
}

impl BoardPermissions {
    pub fn from_role(role: BoardRole) -> Self {
        match role {
            BoardRole::Owner | BoardRole::Admin => Self {
                can_view: true,
                can_edit: true,
                can_comment: true,
                can_manage_members: true,
                can_manage_board: true,
            },
            BoardRole::Editor => Self {
                can_view: true,
                can_edit: true,
                can_comment: true,
                can_manage_members: false,
                can_manage_board: false,
            },
            BoardRole::Commenter => Self {
                can_view: true,
                can_edit: false,
                can_comment: true,
                can_manage_members: false,
                can_manage_board: false,
            },
            BoardRole::Viewer => Self {
                can_view: true,
                can_edit: false,
                can_comment: false,
                can_manage_members: false,
                can_manage_board: false,
            },
        }
    }

    pub fn viewer_only() -> Self {
        Self::from_role(BoardRole::Viewer)
    }

    pub fn apply_overrides(mut self, overrides: Option<&BoardPermissionOverrides>) -> Self {
        let Some(overrides) = overrides else {
            return self;
        };

        if let Some(value) = overrides.can_view {
            self.can_view = value;
        }
        if let Some(value) = overrides.can_edit {
            self.can_edit = value;
        }
        if let Some(value) = overrides.can_comment {
            self.can_comment = value;
        }
        if let Some(value) = overrides.can_manage_members {
            self.can_manage_members = value;
        }
        if let Some(value) = overrides.can_manage_board {
            self.can_manage_board = value;
        }

        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BoardPermissionOverrides {
    pub can_view: Option<bool>,
    pub can_edit: Option<bool>,
    pub can_comment: Option<bool>,
    pub can_manage_members: Option<bool>,
    pub can_manage_board: Option<bool>,
}

#[cfg(test)]
mod tests {
    use super::{BoardPermissionOverrides, BoardPermissions, BoardRole};

    #[test]
    fn board_permissions_from_role_defaults() {
        let owner = BoardPermissions::from_role(BoardRole::Owner);
        assert!(owner.can_view);
        assert!(owner.can_edit);
        assert!(owner.can_comment);
        assert!(owner.can_manage_members);
        assert!(owner.can_manage_board);

        let editor = BoardPermissions::from_role(BoardRole::Editor);
        assert!(editor.can_view);
        assert!(editor.can_edit);
        assert!(editor.can_comment);
        assert!(!editor.can_manage_members);
        assert!(!editor.can_manage_board);

        let viewer = BoardPermissions::from_role(BoardRole::Viewer);
        assert!(viewer.can_view);
        assert!(!viewer.can_edit);
        assert!(!viewer.can_comment);
        assert!(!viewer.can_manage_members);
        assert!(!viewer.can_manage_board);
    }

    #[test]
    fn board_permissions_apply_overrides_updates_only_specified_fields() {
        let overrides = BoardPermissionOverrides {
            can_view: None,
            can_edit: Some(false),
            can_comment: Some(true),
            can_manage_members: Some(true),
            can_manage_board: None,
        };

        let base = BoardPermissions::from_role(BoardRole::Editor);
        let result = base.apply_overrides(Some(&overrides));

        assert!(result.can_view);
        assert!(!result.can_edit);
        assert!(result.can_comment);
        assert!(result.can_manage_members);
        assert!(!result.can_manage_board);
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasSettings {
    pub width: f64,
    pub height: f64,
    pub background_color: String,
    pub grid_size: i32,
    pub grid_enabled: bool,
    pub snap_to_grid: bool,
    pub show_rulers: bool,
    pub default_zoom: f64,
}

impl Default for CanvasSettings {
    fn default() -> Self {
        Self {
            width: 10000.0,
            height: 10000.0,
            background_color: "#ffffff".to_string(),
            grid_size: 20,
            grid_enabled: true,
            snap_to_grid: true,
            show_rulers: true,
            default_zoom: 1.0,
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Viewport {
    pub x: f64,
    pub y: f64,
    pub zoom: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize, FromRow)]
pub struct Board {
    pub id: Uuid,

    // Ownership
    pub organization_id: Option<Uuid>,
    pub created_by: Uuid,

    // Basic Info
    pub name: String,
    pub description: Option<String>,
    pub thumbnail_url: Option<String>,

    // Visibility
    pub is_public: bool,
    pub is_template: bool,

    // Canvas Settings
    // #[sqlx(json)]: Tự động parse JSONB từ Postgres vào Struct
    #[sqlx(json)]
    pub canvas_settings: CanvasSettings,

    #[sqlx(json)]
    pub viewport: Option<Viewport>,

    pub version: i32,

    // Statistics
    pub element_count: i32,
    pub view_count: i32,
    pub last_edited_at: Option<DateTime<Utc>>,
    pub last_edited_by: Option<Uuid>,

    // Metadata
    // TEXT[] -> Vec<String>
    pub tags: Option<Vec<String>>,

    // SQL: JSONB metadata -> Dùng serde_json::Value cho dữ liệu động
    #[sqlx(json)]
    pub metadata: Option<serde_json::Value>,

    // Timestamps
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub archived_at: Option<DateTime<Utc>>,
    pub deleted_at: Option<DateTime<Utc>>,
}
