use redis::Client;
use sqlx::PgPool;
use std::sync::Arc;

use crate::{realtime::room::Rooms, services::email::EmailService};
use tracing::warn;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub jwt_secret: String,
    pub rooms: Rooms,
    pub redis: Option<Client>,
    pub email_service: Option<EmailService>,
}

impl AppState {
    pub fn new(db: PgPool) -> Self {
        let email_service = match EmailService::from_env() {
            Ok(service) => Some(service),
            Err(message) => {
                warn!("Email service not configured: {}", message);
                None
            }
        };
        let redis = match std::env::var("REDIS_URL") {
            Ok(url) => match Client::open(url) {
                Ok(client) => Some(client),
                Err(error) => {
                    warn!("Redis client init failed: {}", error);
                    None
                }
            },
            Err(_) => None,
        };

        Self {
            db,
            jwt_secret: std::env::var("JWT_SECRET")
                .unwrap_or_else(|_| "zxcsgdfhegrfjherfgjetj".to_string()),
            rooms: Arc::new(dashmap::DashMap::new()),
            redis,
            email_service,
        }
    }
}
