use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::prelude::FromRow;
use uuid::Uuid;

// enum for subcription
#[derive(Debug, Clone, Copy, Serialize, Deserialize, sqlx::Type, Default, PartialEq)]
#[sqlx(type_name = "core.subscription_tier", rename_all = "lowercase")]
pub enum SubscriptionTier {
    #[default]
    Free,
    Starter,
    Professional,
    Enterprise,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserPreferences {
    pub theme: String,
    pub language: String,
    pub notifications: NotificationSettings,
    pub default_board_settings: Option<DefaultBoardSettings>,
}
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct NotificationSettings {
    pub email: bool,
    pub push: bool,
    pub mentions: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DefaultBoardSettings {
    pub grid_enabled: bool,
    pub snap_to_grid: bool,
}
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub email_verified_at: Option<DateTime<Utc>>,
    #[sqlx(rename = "password_hash")]
    pub password_hash: Option<String>,

    pub username: Option<String>,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub bio: Option<String>,

    #[sqlx(json)]
    pub preferences: UserPreferences,

    pub is_active: bool,
    pub last_active_at: Option<DateTime<Utc>>,

    pub subscription_tier: SubscriptionTier,
    pub subscription_expires_at: Option<DateTime<Utc>>,

    #[sqlx(json)]
    pub metadata: serde_json::Value,

    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}

impl Default for UserPreferences {
    fn default() -> Self {
        Self {
            theme: "system".to_string(),
            language: "en".to_string(),
            notifications: NotificationSettings::default(),
            default_board_settings: Some(DefaultBoardSettings::default()),
        }
    }
}
