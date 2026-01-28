use chrono::{DateTime, Utc};
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::{error::AppError, models::comments::CommentStatus};

#[derive(Debug)]
pub(crate) struct CreateCommentParams {
    pub board_id: Uuid,
    pub element_id: Option<Uuid>,
    pub parent_id: Option<Uuid>,
    pub created_by: Uuid,
    pub position_x: Option<f64>,
    pub position_y: Option<f64>,
    pub content: String,
    pub content_html: Option<String>,
    pub mentions: Vec<Uuid>,
}

#[derive(Debug, sqlx::FromRow)]
pub(crate) struct CommentRow {
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
    pub author_username: Option<String>,
    pub author_display_name: String,
    pub author_avatar_url: Option<String>,
}

pub async fn create_comment(
    tx: &mut Transaction<'_, Postgres>,
    params: CreateCommentParams,
) -> Result<CommentRow, AppError> {
    let row = crate::log_query_fetch_one!(
        "comments.create_comment",
        sqlx::query_as::<_, CommentRow>(
            r#"
            WITH inserted AS (
                INSERT INTO collab.comment (
                    board_id,
                    element_id,
                    parent_id,
                    created_by,
                    position_x,
                    position_y,
                    content,
                    content_html,
                    mentions
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *
            )
            SELECT
                inserted.id,
                inserted.board_id,
                inserted.element_id,
                inserted.parent_id,
                inserted.created_by,
                inserted.position_x,
                inserted.position_y,
                inserted.content,
                inserted.content_html,
                inserted.mentions,
                inserted.status,
                inserted.resolved_by,
                inserted.resolved_at,
                inserted.is_edited,
                inserted.edited_at,
                inserted.reply_count,
                inserted.created_at,
                inserted.updated_at,
                u.username AS author_username,
                COALESCE(u.display_name, 'Deleted user') AS author_display_name,
                u.avatar_url AS author_avatar_url
            FROM inserted
            LEFT JOIN core.user u ON u.id = inserted.created_by
            "#,
        )
        .bind(params.board_id)
        .bind(params.element_id)
        .bind(params.parent_id)
        .bind(params.created_by)
        .bind(params.position_x)
        .bind(params.position_y)
        .bind(params.content)
        .bind(params.content_html)
        .bind(params.mentions)
        .fetch_one(&mut **tx)
    )?;

    Ok(row)
}

pub async fn list_comments(
    pool: &PgPool,
    board_id: Uuid,
    element_id: Option<Uuid>,
    parent_id: Option<Uuid>,
    status: Option<CommentStatus>,
) -> Result<Vec<CommentRow>, AppError> {
    let rows = crate::log_query_fetch_all!(
        "comments.list_comments",
        sqlx::query_as::<_, CommentRow>(
            r#"
            SELECT
                c.id,
                c.board_id,
                c.element_id,
                c.parent_id,
                c.created_by,
                c.position_x,
                c.position_y,
                c.content,
                c.content_html,
                c.mentions,
                c.status,
                c.resolved_by,
                c.resolved_at,
                c.is_edited,
                c.edited_at,
                c.reply_count,
                c.created_at,
                c.updated_at,
                u.username AS author_username,
                COALESCE(u.display_name, 'Deleted user') AS author_display_name,
                u.avatar_url AS author_avatar_url
            FROM collab.comment c
            LEFT JOIN core.user u ON u.id = c.created_by
            WHERE c.board_id = $1
            AND c.deleted_at IS NULL
            AND ($2::uuid IS NULL OR c.element_id = $2)
            AND ($3::uuid IS NULL OR c.parent_id = $3)
            AND ($4::collab.comment_status IS NULL OR c.status = $4)
            ORDER BY c.created_at ASC
            "#,
        )
        .bind(board_id)
        .bind(element_id)
        .bind(parent_id)
        .bind(status)
        .fetch_all(pool)
    )?;

    Ok(rows)
}

pub async fn filter_mentions(
    pool: &PgPool,
    board_id: Uuid,
    user_ids: &[Uuid],
) -> Result<Vec<Uuid>, AppError> {
    if user_ids.is_empty() {
        return Ok(Vec::new());
    }

    let rows = crate::log_query_fetch_all!(
        "comments.filter_mentions",
        sqlx::query_scalar::<_, Uuid>(
            r#"
            WITH target_board AS (
                SELECT organization_id
                FROM board.board
                WHERE id = $1
                AND deleted_at IS NULL
            )
            SELECT DISTINCT u.id
            FROM core.user u
            WHERE u.deleted_at IS NULL
            AND u.id = ANY($2)
            AND (
                EXISTS (
                    SELECT 1
                    FROM board.board_member bm
                    WHERE bm.board_id = $1
                    AND bm.user_id = u.id
                )
                OR EXISTS (
                    SELECT 1
                    FROM target_board tb
                    JOIN core.organization_member om
                        ON om.organization_id = tb.organization_id
                    WHERE tb.organization_id IS NOT NULL
                    AND om.user_id = u.id
                    AND om.accepted_at IS NOT NULL
                    AND om.role IN ('owner', 'admin')
                )
            )
            "#,
        )
        .bind(board_id)
        .bind(user_ids)
        .fetch_all(pool)
    )?;

    Ok(rows)
}
