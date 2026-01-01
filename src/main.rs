use axum::{
    Router,
    body::Bytes,
    extract::{
        State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    http::{HeaderValue, Method, header},
    middleware,
    response::IntoResponse,
    routing::{get, post},
};
use dashmap::DashMap;
use sqlx::{PgPool, postgres::PgPoolOptions};
use tower_http::cors::CorsLayer;
use uuid::Uuid;
use yrs::{Doc, sync::Awareness};
mod error;
mod handles;
mod models;
mod services;
use crate::{
    handles::{
        boards::{create_board_handle, get_board_handle, get_element_handle, ws_handler},
        user::{get_me_handle, login_handle, register_handle},
    },
    services::{ boards::BoardService, middleware::auth_middleware},
};
use std::{ net::SocketAddr, sync::Arc, time::Instant};
use tokio::{
    net::TcpListener,
    sync::{Mutex, RwLock, broadcast},
};
pub struct Room {
    pub doc: Arc<Mutex<Doc>>,
    pub tx: broadcast::Sender<Bytes>,
    pub board_id: Uuid,
    pub awareness: Arc<RwLock<Awareness>>,
    pub pending_updates: Arc<Mutex<Vec<Vec<u8>>>>,
    pub last_save: Mutex<Instant>,
}
impl Room {
    pub fn new(board_id: Uuid) -> Self {
        let (tx, _rx) = broadcast::channel(100); //lao
        let doc = Arc::new(Mutex::new(Doc::new()));
        let awareness = Arc::new(RwLock::new(Awareness::new(Doc::new())));
        let pending_updates = Arc::new(Mutex::new(Vec::new()));
        let last_save = Mutex::new(Instant::now());

        Self { doc, tx, board_id, awareness, pending_updates, last_save }
    }
}



// type UserSender = mpsc::UnboundedSender<Message>;
pub type Rooms = Arc<DashMap<Uuid, Arc<Room>>>;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub jwt_secret: String,
    pub rooms: Rooms,

}

impl AppState {
    pub fn new(db: PgPool) -> Self {
        Self {
            db,
            jwt_secret: std::env::var("JWT_SECRET")
                .unwrap_or_else(|_| "zxcsgdfhegrfjherfgjetj".to_string()),
            rooms: Arc::new(DashMap::new()),
        }
    }
}
#[tokio::main]
async fn main() {
    dotenvy::dotenv().expect("do not search file env");
    tracing_subscriber::fmt::init();
    let database_url = std::env::var("DATABASE_URL").expect("you do not key");
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&database_url)
        .await
        .expect("connect to database failed");
    println!("connect success");
    let state = AppState::new(pool);
    let snapshot_state = state.clone();


    
    tokio::spawn(async move {
        const SNAPSHOT_INTERVAL_SECS: u64 = 60;
        const SNAPSHOT_MIN_UPDATES: i64 = 200;
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(
            SNAPSHOT_INTERVAL_SECS,
        ));
        loop {
            interval.tick().await;
            let rooms: Vec<Arc<Room>> = snapshot_state
                .rooms
                .iter()
                .map(|entry| entry.value().clone())
                .collect();
            for room in rooms {
                let pending_updates = {
                    let mut pending = room.pending_updates.lock().await;
                    if pending.is_empty() {
                        Vec::new()
                    } else {
                        pending.drain(..).collect()
                    }
                };
                if !pending_updates.is_empty() {
                    BoardService::save_update_logs(
                        room.board_id,
                        None,
                        pending_updates,
                        snapshot_state.db.clone(),
                    )
                    .await;
                    let mut last_save = room.last_save.lock().await;
                    *last_save = Instant::now();
                }
                if let Err(e) = BoardService::maybe_create_snapshot(
                    &snapshot_state.db,
                    room.board_id,
                    room.doc.clone(),
                    SNAPSHOT_MIN_UPDATES,
                )
                .await
                {
                    tracing::error!(
                        "Failed to create snapshot for board {}: {}",
                        room.board_id,
                        e
                    );
                }
            }
        }
    });

    let cors = CorsLayer::new()
        .allow_origin("http://localhost:5173".parse::<HeaderValue>().unwrap())
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION, header::ACCEPT]);

    // Auth routes (public)
    let auth_routes = Router::new()
        .route("/auth/register", post(register_handle))
        .route("/auth/login", post(login_handle));

    // User routes (protected)
    let user_routes = Router::new()
        .route("/users/me", get(get_me_handle))
        .route("/api/boards/", post(create_board_handle))
        .route("/api/boards/list", get(get_board_handle))
        .route("/api/boards/{board_id}/elements", get(get_element_handle))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth_middleware,
        ));

    // WebSocket routes (protected)
    let ws_routes = Router::new()
        .route("/ws/boards/{board_id}", get(ws_handler))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth_middleware,
        ));

    let app = Router::new()
        .merge(auth_routes)
        .merge(user_routes)
        .merge(ws_routes)
        .layer(cors)
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 3000));
    println!("listening on {}", addr);
    let listener = TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
