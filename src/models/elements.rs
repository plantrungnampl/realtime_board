use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::prelude::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, sqlx::Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "board.element_type", rename_all = "snake_case")]
pub enum ElementType {
    #[serde(alias = "Shape")]
    Shape,
    #[serde(alias = "Text")]
    Text,
    #[serde(alias = "StickyNote")]
    StickyNote,
    #[serde(alias = "Image")]
    Image,
    #[serde(alias = "Video")]
    Video,
    #[serde(alias = "Frame")]
    Frame,
    #[serde(alias = "Connector")]
    Connector,
    #[serde(alias = "Drawing")]
    Drawing,
    #[serde(alias = "Embed")]
    Embed,
    #[serde(alias = "Document")]
    Document,
    #[serde(alias = "Component")]
    Component,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct BoardElement {
    pub id: Uuid,
    pub board_id: Uuid,
    pub layer_id: Option<Uuid>,
    pub parent_id: Option<Uuid>,
    pub created_by: Uuid,
    pub element_type: ElementType,
    pub position_x: f64,
    pub position_y: f64,
    pub width: f64,
    pub height: f64,
    pub rotation: f64,
    pub z_index: i32,
    #[sqlx(json)]
    pub style: serde_json::Value,
    #[sqlx(json)]
    pub properties: serde_json::Value,
    pub version: i32,
    #[sqlx(json)]
    pub metadata: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}
