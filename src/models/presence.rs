use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::prelude::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, sqlx::Type, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
#[sqlx(type_name = "collab.presence_status", rename_all = "lowercase")]
pub enum PresenceStatus {
    Online,
    Idle,
    Away,
    Offline,
}

impl PresenceStatus {
    pub fn normalize_client(status: &str) -> Option<Self> {
        match status {
            "active" => Some(Self::Online),
            "online" => Some(Self::Online),
            "idle" => Some(Self::Idle),
            "away" => Some(Self::Away),
            "offline" => Some(Self::Offline),
            _ => None,
        }
    }

    pub fn is_visible(self) -> bool {
        matches!(self, Self::Online | Self::Idle | Self::Away)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct PresenceRecord {
    pub id: Uuid,
    pub board_id: Uuid,
    pub user_id: Uuid,
    pub session_id: Uuid,
    pub connection_id: Option<String>,
    pub cursor_x: Option<f64>,
    pub cursor_y: Option<f64>,
    #[sqlx(json)]
    pub viewport: serde_json::Value,
    pub status: PresenceStatus,
    pub selected_elements: Vec<Uuid>,
    #[sqlx(json)]
    pub device_info: Option<serde_json::Value>,
    pub connected_at: DateTime<Utc>,
    pub last_heartbeat_at: DateTime<Utc>,
    pub disconnected_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct PresenceUser {
    pub user_id: Uuid,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub status: PresenceStatus,
    pub connected_at: DateTime<Utc>,
    pub last_heartbeat_at: DateTime<Utc>,
}
