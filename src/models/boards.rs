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
    pub deleted_at: Option<DateTime<Utc>>,
}
