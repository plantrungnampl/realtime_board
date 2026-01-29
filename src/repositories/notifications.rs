use serde_json::Value;
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

use crate::error::AppError;

pub(crate) struct CreateCommentMentionNotifications {
    pub user_ids: Vec<Uuid>,
    pub actor_id: Uuid,
    pub board_id: Uuid,
    pub element_id: Option<Uuid>,
    pub comment_id: Uuid,
    pub title: String,
    pub body: String,
    pub data: Value,
}

pub async fn create_comment_mentions(
    tx: &mut Transaction<'_, Postgres>,
    params: CreateCommentMentionNotifications,
) -> Result<u64, AppError> {
    if params.user_ids.is_empty() {
        return Ok(0);
    }

    let rows = crate::log_query_execute!(
        "notifications.create_comment_mentions",
        sqlx::query(
            r#"
            INSERT INTO collab.notification (
                user_id,
                actor_id,
                board_id,
                element_id,
                comment_id,
                notification_type,
                title,
                body,
                data
            )
            SELECT
                target_id,
                $2,
                $3,
                $4,
                $5,
                'comment_mention',
                $6,
                $7,
                $8
            FROM UNNEST($1::uuid[]) AS target_id
            "#,
        )
        .bind(params.user_ids)
        .bind(params.actor_id)
        .bind(params.board_id)
        .bind(params.element_id)
        .bind(params.comment_id)
        .bind(params.title)
        .bind(params.body)
        .bind(sqlx::types::Json(params.data))
        .execute(&mut **tx)
    )?;

    Ok(rows.rows_affected())
}
