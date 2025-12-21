use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::prelude::FromRow;
use uuid::Uuid;
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CreateBoardRequest {
    // pub created_by: Uuid,
    pub organization_id: Option<Uuid>,
    pub name: String,
    pub description: Option<String>,
    pub thumbnail_url: Option<String>,
}
#[derive(Debug, Deserialize, Serialize, FromRow)]
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
#[derive(Debug, Serialize, Deserialize, sqlx::Type, Clone)]
#[sqlx(type_name = "board.element_type", rename_all = "snake_case")]
pub enum ElementType {
    Shape,
    Text,
    Drawing,
}
#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct BoardElement {
    pub id: Uuid,
    pub board_id: Uuid,
    pub element_type: ElementType,
    pub position_x: f64, // position_x
    pub position_y: f64, // position_y
    pub width: f64,
    pub height: f64,
    pub style: sqlx::types::Json<serde_json::Value>,
    pub properties: sqlx::types::Json<serde_json::Value>,
}
#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(tag = "action", content = "payload")]
pub enum WsBoardElementAction {
    #[serde(rename = "ELEMENT_CREATE")]
    create(BoardElement),
    #[serde(rename = "ELEMENT_UPDATE")]
    update(BoardElement),
    #[serde(rename = "ELEMENT_FINISH")]
    finish(BoardElement),
    #[serde(rename = "CURSOR_MOVE")]
    CursorMove(CursorMove),
}
// cursor realtime
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CursorMove {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CursorBroadcast {
    pub user_id: Uuid,
    pub x: f64,
    pub y: f64,
}
