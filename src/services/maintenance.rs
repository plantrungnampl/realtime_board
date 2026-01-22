use std::time::Duration;

use sqlx::PgPool;

use crate::usecases::boards::BoardService;

pub fn spawn_board_cleanup(pool: PgPool) {
    tokio::spawn(async move {
        const CLEANUP_INTERVAL_SECS: u64 = 6 * 60 * 60;
        let mut interval = tokio::time::interval(Duration::from_secs(CLEANUP_INTERVAL_SECS));

        loop {
            interval.tick().await;
            match BoardService::purge_deleted_boards(&pool).await {
                Ok(purged) => {
                    if purged > 0 {
                        tracing::info!("Purged {} deleted boards", purged);
                    }
                }
                Err(error) => {
                    tracing::error!("Failed to purge deleted boards: {}", error);
                }
            }
        }
    });
}
