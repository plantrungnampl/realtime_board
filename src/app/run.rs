use sqlx::postgres::PgPoolOptions;
use std::{net::SocketAddr, time::Duration};
use tokio::net::TcpListener;

use crate::{app, error::AppError, realtime, services, telemetry};

pub async fn run() -> Result<(), AppError> {
    let _ = dotenvy::dotenv();
    telemetry::init_tracing()
        .map_err(|err| AppError::Internal(format!("telemetry init failed: {}", err)))?;

    let database_url = std::env::var("DATABASE_URL")
        .map_err(|err| AppError::Internal(format!("DATABASE_URL missing: {}", err)))?;
    let max_connections = read_env_u32("DATABASE_MAX_CONNECTIONS").unwrap_or(20);
    let min_connections = read_env_u32("DATABASE_MIN_CONNECTIONS").unwrap_or(5);
    let acquire_timeout_secs = read_env_u64("DATABASE_ACQUIRE_TIMEOUT_SECS").unwrap_or(15);
    let pool = PgPoolOptions::new()
        .max_connections(max_connections)
        .min_connections(min_connections)
        .acquire_timeout(Duration::from_secs(acquire_timeout_secs))
        .connect(&database_url)
        .await
        .map_err(AppError::Database)?;

    let state = app::state::AppState::new(pool);
    realtime::snapshot::spawn_maintenance(state.db.clone(), state.rooms.clone());
    realtime::projection::spawn_projection(state.db.clone(), state.rooms.clone());
    services::maintenance::spawn_board_cleanup(state.db.clone());

    let app = app::router::build_router(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 3000));
    tracing::info!(%addr, "Server listening");
    let listener = TcpListener::bind(addr)
        .await
        .map_err(|err| AppError::Internal(format!("bind failed: {}", err)))?;
    let result = axum::serve(listener, app)
        .await
        .map_err(|err| AppError::Internal(format!("server error: {}", err)));
    telemetry::shutdown_tracing();
    result?;
    Ok(())
}

fn read_env_u32(key: &str) -> Option<u32> {
    std::env::var(key)
        .ok()
        .and_then(|value| value.parse::<u32>().ok())
}

fn read_env_u64(key: &str) -> Option<u64> {
    std::env::var(key)
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
}
