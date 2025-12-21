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
use chrono::Duration;
use dashmap::DashMap;
use sqlx::{PgPool, postgres::PgPoolOptions};
use tower_http::cors::CorsLayer;
use uuid::Uuid;
use yrs::{Doc, ReadTxn, Transact};
mod error;
mod handles;
mod models;
mod services;
use crate::{
    handles::{
        boards::{create_board_handle, get_board_handle, get_element_handle, ws_handler},
        user::{get_me_handle, login_handle, register_handle},
    },
    services::{boards::create_element, middleware::auth_middleware},
};
use std::{collections::HashMap, net::SocketAddr, sync::Arc};
use tokio::{
    net::TcpListener,
    sync::{Mutex, RwLock, broadcast, mpsc},
};
pub struct Room {
    pub doc: Arc<Mutex<Doc>>,
    pub tx: broadcast::Sender<Bytes>,
    pub board_id: Uuid,
}
impl Room {
    pub fn new(board_id: Uuid) -> Self {
        let (tx, _rx) = broadcast::channel(100); //lao
        let doc = Arc::new(Mutex::new(Doc::new()));
        let board_id_clone = board_id.clone();
        let doc_clone = doc.clone();
        tokio::spawn(async move { run_background_save(board_id_clone, doc_clone).await });
        Self { doc, tx, board_id }
    }
}

async fn run_background_save(board_id: Uuid, doc: Arc<Mutex<Doc>>) {
    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(10));
    loop {
        //cho 10s
        interval.tick().await;
        // bat dau luu
        tracing::info!("saving board rom: {:?}", board_id);
        let binary_blop = {
            let doc_guard = doc.lock().await;
            let txn = doc_guard.transact();
            txn.encode_state_as_update_v1(&yrs::StateVector::default());
        };
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
        .route("/ws/boards/{board_id}", get(ws_handler))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth_middleware,
        ));

    let app = Router::new()
        // .route("/ws", get(ws_handler))
        .merge(auth_routes)
        .merge(user_routes)
        .layer(cors)
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 3000));
    println!("listening on {}", addr);
    let listener = TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
