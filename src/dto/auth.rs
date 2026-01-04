use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::models::users::{
    DefaultBoardSettings, NotificationSettings, SubscriptionTier, User, UserPreferences,
};

#[derive(Debug, Deserialize, Clone)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RegisterRequest {
    pub email: String,
    pub password_hash: String,
    pub display_name: String,
    pub username: String,
    pub invite_token: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateUserRequest {
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub bio: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ChangePasswordRequest {
    pub current_password: String,
    pub new_password: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DeleteAccountRequest {
    pub password: String,
    pub confirmation: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct VerifyEmailRequest {
    pub token: String,
}

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub token: String,
    pub user: UserResponse,
}

#[derive(Debug, Serialize)]
pub struct MessageResponse {
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UserResponse {
    pub id: Uuid,
    pub email: String,
    pub email_verified_at: Option<DateTime<Utc>>,
    pub username: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub profile_setup_completed: bool,
}

pub type UserReponse = UserResponse;

fn profile_setup_completed(metadata: &serde_json::Value) -> bool {
    metadata
        .get("profile_setup_completed")
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NotificationSettingsDto {
    pub email: bool,
    pub push: bool,
    pub mentions: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DefaultBoardSettingsDto {
    pub grid_enabled: bool,
    pub snap_to_grid: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UserPreferencesDto {
    pub theme: String,
    pub language: String,
    pub notifications: NotificationSettingsDto,
    pub default_board_settings: Option<DefaultBoardSettingsDto>,
}

pub type UpdatePreferencesRequest = UserPreferencesDto;

#[derive(Debug, Serialize)]
pub struct UserProfileResponse {
    pub id: Uuid,
    pub email: String,
    pub email_verified_at: Option<DateTime<Utc>>,
    pub username: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub bio: Option<String>,
    pub profile_setup_completed: bool,
    pub subscription_tier: SubscriptionTier,
    pub subscription_expires_at: Option<DateTime<Utc>>,
    pub preferences: UserPreferencesDto,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<NotificationSettings> for NotificationSettingsDto {
    fn from(settings: NotificationSettings) -> Self {
        Self {
            email: settings.email,
            push: settings.push,
            mentions: settings.mentions,
        }
    }
}

impl From<DefaultBoardSettings> for DefaultBoardSettingsDto {
    fn from(settings: DefaultBoardSettings) -> Self {
        Self {
            grid_enabled: settings.grid_enabled,
            snap_to_grid: settings.snap_to_grid,
        }
    }
}

impl From<UserPreferences> for UserPreferencesDto {
    fn from(preferences: UserPreferences) -> Self {
        Self {
            theme: preferences.theme,
            language: preferences.language,
            notifications: preferences.notifications.into(),
            default_board_settings: preferences.default_board_settings.map(Into::into),
        }
    }
}

impl From<NotificationSettingsDto> for NotificationSettings {
    fn from(settings: NotificationSettingsDto) -> Self {
        Self {
            email: settings.email,
            push: settings.push,
            mentions: settings.mentions,
        }
    }
}

impl From<DefaultBoardSettingsDto> for DefaultBoardSettings {
    fn from(settings: DefaultBoardSettingsDto) -> Self {
        Self {
            grid_enabled: settings.grid_enabled,
            snap_to_grid: settings.snap_to_grid,
        }
    }
}

impl From<UserPreferencesDto> for UserPreferences {
    fn from(preferences: UserPreferencesDto) -> Self {
        Self {
            theme: preferences.theme,
            language: preferences.language,
            notifications: preferences.notifications.into(),
            default_board_settings: preferences.default_board_settings.map(Into::into),
        }
    }
}

impl From<User> for UserResponse {
    fn from(user: User) -> Self {
        Self {
            id: user.id,
            email: user.email,
            email_verified_at: user.email_verified_at,
            username: user.username.unwrap_or_default(),
            display_name: user.display_name,
            avatar_url: user.avatar_url,
            profile_setup_completed: profile_setup_completed(&user.metadata),
        }
    }
}

impl From<User> for UserProfileResponse {
    fn from(user: User) -> Self {
        Self {
            id: user.id,
            email: user.email,
            email_verified_at: user.email_verified_at,
            username: user.username.unwrap_or_default(),
            display_name: user.display_name,
            avatar_url: user.avatar_url,
            bio: user.bio,
            profile_setup_completed: profile_setup_completed(&user.metadata),
            subscription_tier: user.subscription_tier,
            subscription_expires_at: user.subscription_expires_at,
            preferences: user.preferences.into(),
            created_at: user.created_at,
            updated_at: user.updated_at,
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::profile_setup_completed;

    #[test]
    fn profile_setup_completed_defaults_false() {
        let metadata = json!({});
        assert!(!profile_setup_completed(&metadata));
    }

    #[test]
    fn profile_setup_completed_true_when_set() {
        let metadata = json!({ "profile_setup_completed": true });
        assert!(profile_setup_completed(&metadata));
    }
}
