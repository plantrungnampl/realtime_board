use redis::AsyncCommands;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    error::AppError,
    models::presence::{PresenceStatus, PresenceUser},
    repositories::presence as presence_repo,
};

const PRESENCE_CACHE_TTL_SECS: usize = 60;
const PRESENCE_STALE_AFTER_SECS: i64 = 300;

pub struct PresenceService;

impl PresenceService {
    pub async fn list_active_users(
        pool: &PgPool,
        redis: Option<&redis::Client>,
        board_id: Uuid,
    ) -> Result<Vec<PresenceUser>, AppError> {
        if let Some(redis) = redis {
            if let Ok(mut conn) = redis.get_multiplexed_async_connection().await {
                let key = cache_key(board_id);
                let cached: Result<Option<String>, _> = conn.get(&key).await;
                if let Ok(Some(payload)) = cached {
                    if let Ok(users) = serde_json::from_str::<Vec<PresenceUser>>(&payload) {
                        return Ok(users);
                    }
                }
            }
        }

        let users = presence_repo::list_active_presence(pool, board_id).await?;
        if let Some(redis) = redis {
            if let Ok(mut conn) = redis.get_multiplexed_async_connection().await {
                let key = cache_key(board_id);
                if let Ok(payload) = serde_json::to_string(&users) {
                    let _: Result<(), _> = conn
                        .set_ex(key, payload, PRESENCE_CACHE_TTL_SECS.try_into().unwrap())
                        .await;
                }
            }
        }

        Ok(users)
    }

    pub async fn join(
        pool: &PgPool,
        redis: Option<&redis::Client>,
        board_id: Uuid,
        user_id: Uuid,
        session_id: Uuid,
        connection_id: Option<String>,
    ) -> Result<(), AppError> {
        presence_repo::insert_presence(
            pool,
            presence_repo::PresenceInsertParams {
                board_id,
                user_id,
                session_id,
                connection_id,
            },
        )
        .await?;
        invalidate_cache(redis, board_id).await;
        Ok(())
    }

    pub async fn update_status(
        pool: &PgPool,
        redis: Option<&redis::Client>,
        board_id: Uuid,
        session_id: Uuid,
        status: PresenceStatus,
    ) -> Result<(), AppError> {
        presence_repo::update_presence_status(pool, board_id, session_id, status).await?;
        invalidate_cache(redis, board_id).await;
        Ok(())
    }

    pub async fn heartbeat(
        pool: &PgPool,
        board_id: Uuid,
        session_id: Uuid,
    ) -> Result<(), AppError> {
        presence_repo::update_heartbeat(pool, board_id, session_id).await
    }

    pub async fn disconnect(
        pool: &PgPool,
        redis: Option<&redis::Client>,
        board_id: Uuid,
        session_id: Uuid,
    ) -> Result<(), AppError> {
        presence_repo::mark_disconnected(pool, board_id, session_id).await?;
        invalidate_cache(redis, board_id).await;
        Ok(())
    }

    pub async fn cleanup_stale_sessions(
        pool: &PgPool,
        redis: Option<&redis::Client>,
        board_id: Uuid,
    ) -> Result<Vec<Uuid>, AppError> {
        let users =
            presence_repo::cleanup_stale_presence(pool, board_id, PRESENCE_STALE_AFTER_SECS)
                .await?;
        if !users.is_empty() {
            invalidate_cache(redis, board_id).await;
        }
        Ok(users)
    }

    pub async fn count_active_users(pool: &PgPool, board_id: Uuid) -> Result<i64, AppError> {
        presence_repo::count_active_users(pool, board_id).await
    }

    pub async fn has_active_session(
        pool: &PgPool,
        board_id: Uuid,
        user_id: Uuid,
    ) -> Result<bool, AppError> {
        presence_repo::has_active_presence(pool, board_id, user_id).await
    }
}

fn cache_key(board_id: Uuid) -> String {
    format!("presence:{}", board_id)
}

async fn invalidate_cache(redis: Option<&redis::Client>, board_id: Uuid) {
    let Some(redis) = redis else {
        return;
    };
    if let Ok(mut conn) = redis.get_multiplexed_async_connection().await {
        let key = cache_key(board_id);
        let _: Result<(), _> = conn.del(key).await;
    }
}
