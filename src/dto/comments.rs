use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::models::comments::CommentStatus;

#[derive(Debug, Deserialize)]
pub struct CreateCommentRequest {
    pub content: String,
    pub content_html: Option<String>,
    pub element_id: Option<Uuid>,
    pub position_x: Option<f64>,
    pub position_y: Option<f64>,
    pub mentions: Option<Vec<Uuid>>,
}

#[derive(Debug, Deserialize)]
pub struct ListCommentsQuery {
    pub element_id: Option<Uuid>,
    pub parent_id: Option<Uuid>,
    pub status: Option<CommentStatus>,
    pub limit: Option<u32>,
    pub cursor: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CommentUserResponse {
    pub id: Uuid,
    pub username: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CommentResponse {
    pub id: Uuid,
    pub board_id: Uuid,
    pub element_id: Option<Uuid>,
    pub parent_id: Option<Uuid>,
    pub created_by: Uuid,
    pub author: CommentUserResponse,
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
}

#[derive(Debug, Serialize)]
pub struct CommentListResponse {
    pub data: Vec<CommentResponse>,
    pub pagination: CommentPagination,
}

#[derive(Debug, Serialize)]
pub struct CommentPagination {
    pub next_cursor: Option<String>,
    pub has_more: bool,
}
