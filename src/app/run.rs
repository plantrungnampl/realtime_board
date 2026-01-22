use sqlx::postgres::PgPoolOptions;
use std::net::SocketAddr;
use tokio::net::TcpListener;

use crate::{app, realtime, services};

pub async fn run() {
    dotenvy::dotenv().expect("do not search file env");
    tracing_subscriber::fmt::init();

    let database_url = std::env::var("DATABASE_URL").expect("you do not key");
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&database_url)
        .await
        .expect("connect to database failed");

    let state = app::state::AppState::new(pool);
    realtime::snapshot::spawn_maintenance(state.db.clone(), state.rooms.clone());
    realtime::projection::spawn_projection(state.db.clone(), state.rooms.clone());
    services::maintenance::spawn_board_cleanup(state.db.clone());

    let app = app::router::build_router(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 3000));
    println!("listening on {}", addr);
    let listener = TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
