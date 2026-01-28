use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

/// Comment status mapping for collab.comment_status.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, sqlx::Type, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
#[sqlx(type_name = "collab.comment_status", rename_all = "lowercase")]
pub enum CommentStatus {
    Open,
    Resolved,
    Archived,
}

/// Comment model mapped to collab.comment.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Comment {
    pub id: Uuid,
    pub board_id: Uuid,
    pub element_id: Option<Uuid>,
    pub parent_id: Option<Uuid>,
    pub created_by: Uuid,
    pub position_x: Option<f64>,
    pub position_y: Option<f64>,
    pub content: String,
    pub content_html: Option<String>,
    pub mentions: Vec<Uuid>,
    pub status: CommentStatus,
    pub resolved_by: Option<Uuid>,
    pub resolved_at: Option<DateTime<Utc>>,
    pub is_edited: bool,
    pub edited_at: Option<DateTime<Utc>>,
    pub reply_count: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}
