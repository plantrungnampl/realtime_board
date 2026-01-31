use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fmt;
use uuid::Uuid;

use crate::models::users::{
    DefaultBoardSettings, NotificationSettings, SubscriptionTier, User, UserPreferences,
};

#[derive(Deserialize, Clone)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

impl fmt::Debug for LoginRequest {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("LoginRequest")
            .field("email", &self.email)
            .field("password", &"***")
            .finish()
    }
}

#[derive(Clone, Deserialize)]
pub struct RegisterRequest {
    pub email: String,
    pub password_hash: String,
    pub display_name: String,
    pub username: String,
    pub invite_token: Option<String>,
}

impl fmt::Debug for RegisterRequest {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("RegisterRequest")
            .field("email", &self.email)
            .field("password_hash", &"***")
            .field("display_name", &self.display_name)
            .field("username", &self.username)
            .field("invite_token", &"***")
            .finish()
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateUserRequest {
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub bio: Option<String>,
}

#[derive(Clone, Deserialize)]
pub struct ChangePasswordRequest {
    pub current_password: String,
    pub new_password: String,
}

impl fmt::Debug for ChangePasswordRequest {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ChangePasswordRequest")
            .field("current_password", &"***")
            .field("new_password", &"***")
            .finish()
    }
}

#[derive(Clone, Deserialize)]
pub struct DeleteAccountRequest {
    pub password: String,
    pub confirmation: String,
}

impl fmt::Debug for DeleteAccountRequest {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("DeleteAccountRequest")
            .field("password", &"***")
            .field("confirmation", &self.confirmation)
            .finish()
    }
}

#[derive(Clone, Deserialize)]
pub struct VerifyEmailRequest {
    pub token: String,
}

impl fmt::Debug for VerifyEmailRequest {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("VerifyEmailRequest")
            .field("token", &"***")
            .finish()
    }
}

#[derive(Serialize)]
pub struct LoginResponse {
    pub token: String,
    pub user: UserResponse,
}

impl fmt::Debug for LoginResponse {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("LoginResponse")
            .field("token", &"***")
            .field("user", &self.user)
            .finish()
    }
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

    #[test]
    fn debug_redacts_login_request() {
        use super::LoginRequest;
        let req = LoginRequest {
            email: "test@example.com".to_string(),
            password: "super_secret_password".to_string(),
        };
        let debug_output = format!("{:?}", req);
        assert!(debug_output.contains("email"));
        assert!(debug_output.contains("test@example.com"));
        assert!(debug_output.contains("password"));
        assert!(debug_output.contains("***"));
        assert!(!debug_output.contains("super_secret_password"));
    }

    #[test]
    fn debug_redacts_register_request() {
        use super::RegisterRequest;
        let req = RegisterRequest {
            email: "test@example.com".to_string(),
            password_hash: "plaintext_password_actually".to_string(),
            display_name: "Test User".to_string(),
            username: "testuser".to_string(),
            invite_token: Some("secret_invite_token".to_string()),
        };
        let debug_output = format!("{:?}", req);
        assert!(debug_output.contains("email"));
        assert!(debug_output.contains("test@example.com"));
        assert!(debug_output.contains("password_hash"));
        assert!(debug_output.contains("***"));
        assert!(!debug_output.contains("plaintext_password_actually"));
        assert!(debug_output.contains("invite_token"));
        assert!(debug_output.contains("***"));
        assert!(!debug_output.contains("secret_invite_token"));
    }

    #[test]
    fn debug_redacts_change_password_request() {
        use super::ChangePasswordRequest;
        let req = ChangePasswordRequest {
            current_password: "old_password".to_string(),
            new_password: "new_password".to_string(),
        };
        let debug_output = format!("{:?}", req);
        assert!(debug_output.contains("current_password"));
        assert!(debug_output.contains("***"));
        assert!(!debug_output.contains("old_password"));
        assert!(debug_output.contains("new_password"));
        assert!(debug_output.contains("***"));
    }

    #[test]
    fn debug_redacts_delete_account_request() {
        use super::DeleteAccountRequest;
        let req = DeleteAccountRequest {
            password: "my_password".to_string(),
            confirmation: "DELETE MY ACCOUNT".to_string(),
        };
        let debug_output = format!("{:?}", req);
        assert!(debug_output.contains("password"));
        assert!(debug_output.contains("***"));
        assert!(!debug_output.contains("my_password"));
        assert!(debug_output.contains("confirmation"));
        assert!(debug_output.contains("DELETE MY ACCOUNT"));
    }

    #[test]
    fn debug_redacts_verify_email_request() {
        use super::VerifyEmailRequest;
        let req = VerifyEmailRequest {
            token: "secret_token".to_string(),
        };
        let debug_output = format!("{:?}", req);
        assert!(debug_output.contains("token"));
        assert!(debug_output.contains("***"));
        assert!(!debug_output.contains("secret_token"));
    }

    #[test]
    fn debug_redacts_login_response() {
        use super::{LoginResponse, UserResponse};
        use uuid::Uuid;
        let req = LoginResponse {
            token: "jwt_token_secret".to_string(),
            user: UserResponse {
                id: Uuid::new_v4(),
                email: "user@example.com".to_string(),
                email_verified_at: None,
                username: "user".to_string(),
                display_name: "User".to_string(),
                avatar_url: None,
                profile_setup_completed: false,
            },
        };
        let debug_output = format!("{:?}", req);
        assert!(debug_output.contains("token"));
        assert!(debug_output.contains("***"));
        assert!(!debug_output.contains("jwt_token_secret"));
        assert!(debug_output.contains("user"));
        assert!(debug_output.contains("user@example.com"));
    }
}
