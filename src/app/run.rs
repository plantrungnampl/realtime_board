use sqlx::postgres::PgPoolOptions;
use std::net::SocketAddr;
use tokio::net::TcpListener;

use crate::{app, error::AppError, realtime, services, telemetry};

pub async fn run() -> Result<(), AppError> {
    let _ = dotenvy::dotenv();
    telemetry::init_tracing();

    let database_url = std::env::var("DATABASE_URL")
        .map_err(|err| AppError::Internal(format!("DATABASE_URL missing: {}", err)))?;
    let pool = PgPoolOptions::new()
        .max_connections(10)
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
    axum::serve(listener, app)
        .await
        .map_err(|err| AppError::Internal(format!("server error: {}", err)))?;
    Ok(())
}
