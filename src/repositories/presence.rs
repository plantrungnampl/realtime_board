use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    error::AppError,
    models::presence::{PresenceStatus, PresenceUser},
};

pub struct PresenceInsertParams {
    pub board_id: Uuid,
    pub user_id: Uuid,
    pub session_id: Uuid,
    pub connection_id: Option<String>,
}

pub async fn insert_presence(pool: &PgPool, params: PresenceInsertParams) -> Result<(), AppError> {
    crate::log_query_execute!(
        "presence.insert_presence",
        sqlx::query(
            r#"
                INSERT INTO collab.presence (
                    board_id,
                    user_id,
                    session_id,
                    connection_id,
                    status
                )
                VALUES ($1, $2, $3, $4, $5)
            "#,
        )
        .bind(params.board_id)
        .bind(params.user_id)
        .bind(params.session_id)
        .bind(params.connection_id)
        .bind(PresenceStatus::Online)
        .execute(pool)
    )?;

    Ok(())
}

pub async fn list_active_presence(
    pool: &PgPool,
    board_id: Uuid,
) -> Result<Vec<PresenceUser>, AppError> {
    let rows = crate::log_query_fetch_all!(
        "presence.list_active_presence",
        sqlx::query_as::<_, PresenceUser>(
            r#"
                SELECT DISTINCT ON (p.user_id)
                    p.user_id,
                    u.display_name,
                    u.avatar_url,
                    p.status,
                    p.connected_at,
                    p.last_heartbeat_at
                FROM collab.presence p
                JOIN core.user u ON u.id = p.user_id
                WHERE p.board_id = $1
                  AND p.disconnected_at IS NULL
                ORDER BY p.user_id, p.connected_at DESC
            "#,
        )
        .bind(board_id)
        .fetch_all(pool)
    )?;

    Ok(rows)
}

pub async fn count_active_users(pool: &PgPool, board_id: Uuid) -> Result<i64, AppError> {
    let count = crate::log_query_fetch_one!(
        "presence.count_active_users",
        sqlx::query_scalar::<_, i64>(
            r#"
                SELECT COUNT(DISTINCT user_id)
                FROM collab.presence
                WHERE board_id = $1
                  AND disconnected_at IS NULL
            "#,
        )
        .bind(board_id)
        .fetch_one(pool)
    )?;

    Ok(count)
}

pub async fn has_active_presence(
    pool: &PgPool,
    board_id: Uuid,
    user_id: Uuid,
) -> Result<bool, AppError> {
    let exists = crate::log_query_fetch_one!(
        "presence.has_active_presence",
        sqlx::query_scalar::<_, bool>(
            r#"
                SELECT EXISTS(
                    SELECT 1
                    FROM collab.presence
                    WHERE board_id = $1
                      AND user_id = $2
                      AND disconnected_at IS NULL
                )
            "#,
        )
        .bind(board_id)
        .bind(user_id)
        .fetch_one(pool)
    )?;

    Ok(exists)
}

pub async fn update_presence_status(
    pool: &PgPool,
    board_id: Uuid,
    session_id: Uuid,
    status: PresenceStatus,
) -> Result<(), AppError> {
    crate::log_query_execute!(
        "presence.update_presence_status",
        sqlx::query(
            r#"
                UPDATE collab.presence
                SET status = $3,
                    last_heartbeat_at = CURRENT_TIMESTAMP
                WHERE board_id = $1
                  AND session_id = $2
                  AND disconnected_at IS NULL
            "#,
        )
        .bind(board_id)
        .bind(session_id)
        .bind(status)
        .execute(pool)
    )?;

    Ok(())
}

pub async fn update_heartbeat(
    pool: &PgPool,
    board_id: Uuid,
    session_id: Uuid,
) -> Result<(), AppError> {
    crate::log_query_execute!(
        "presence.update_heartbeat",
        sqlx::query(
            r#"
                UPDATE collab.presence
                SET last_heartbeat_at = CURRENT_TIMESTAMP
                WHERE board_id = $1
                  AND session_id = $2
                  AND disconnected_at IS NULL
            "#,
        )
        .bind(board_id)
        .bind(session_id)
        .execute(pool)
    )?;

    Ok(())
}

pub async fn mark_disconnected(
    pool: &PgPool,
    board_id: Uuid,
    session_id: Uuid,
) -> Result<(), AppError> {
    crate::log_query_execute!(
        "presence.mark_disconnected",
        sqlx::query(
            r#"
                UPDATE collab.presence
                SET status = $3,
                    disconnected_at = CURRENT_TIMESTAMP
                WHERE board_id = $1
                  AND session_id = $2
                  AND disconnected_at IS NULL
            "#,
        )
        .bind(board_id)
        .bind(session_id)
        .bind(PresenceStatus::Offline)
        .execute(pool)
    )?;

    Ok(())
}

pub async fn cleanup_stale_presence(
    pool: &PgPool,
    board_id: Uuid,
    stale_after_secs: i64,
) -> Result<Vec<Uuid>, AppError> {
    let users = crate::log_query_fetch_all!(
        "presence.cleanup_stale_presence",
        sqlx::query_scalar::<_, Uuid>(
            r#"
                WITH stale AS (
                    UPDATE collab.presence
                    SET status = $3,
                        disconnected_at = CURRENT_TIMESTAMP
                    WHERE board_id = $1
                      AND disconnected_at IS NULL
                      AND last_heartbeat_at < (CURRENT_TIMESTAMP - ($2 * INTERVAL '1 second'))
                    RETURNING user_id
                ),
                left_users AS (
                    SELECT DISTINCT user_id
                    FROM stale
                )
                SELECT lu.user_id
                FROM left_users lu
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM collab.presence p
                    WHERE p.board_id = $1
                      AND p.user_id = lu.user_id
                      AND p.disconnected_at IS NULL
                )
            "#,
        )
        .bind(board_id)
        .bind(stale_after_secs)
        .bind(PresenceStatus::Offline)
        .fetch_all(pool)
    )?;

    Ok(users)
}
