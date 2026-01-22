use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::models::elements::ElementType;

#[derive(Debug, Deserialize)]
pub struct CreateBoardElementRequest {
    pub id: Option<Uuid>,
    pub element_type: ElementType,
    pub position_x: f64,
    pub position_y: f64,
    pub width: f64,
    pub height: f64,
    pub rotation: Option<f64>,
    pub layer_id: Option<Uuid>,
    pub parent_id: Option<Uuid>,
    pub style: Option<serde_json::Value>,
    pub properties: Option<serde_json::Value>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateBoardElementRequest {
    pub expected_version: i32,
    pub position_x: Option<f64>,
    pub position_y: Option<f64>,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub rotation: Option<f64>,
    pub style: Option<serde_json::Value>,
    pub properties: Option<serde_json::Value>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct ExpectedVersionQuery {
    pub expected_version: i32,
}

#[derive(Debug, Serialize)]
pub struct BoardElementResponse {
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
    pub style: serde_json::Value,
    pub properties: serde_json::Value,
    pub version: i32,
    pub metadata: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct DeleteBoardElementResponse {
    pub id: Uuid,
    pub version: i32,
    pub deleted_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub already_deleted: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct RestoreBoardElementResponse {
    pub id: Uuid,
    pub version: i32,
    pub deleted_at: Option<DateTime<Utc>>,
    pub updated_at: DateTime<Utc>,
}
