use uuid::Uuid;

use crate::{
    auth::jwt::{JwtConfig, hash_password, verify_password_user},
    dto::auth::{
        ChangePasswordRequest, DeleteAccountRequest, LoginRequest, LoginResponse, RegisterRequest,
        UpdatePreferencesRequest, UpdateUserRequest, UserProfileResponse, UserResponse,
    },
    error::AppError,
    repositories::organizations as org_repo,
    repositories::users as user_repo,
    services::email::EmailService,
    telemetry::{BusinessEvent, redact_email},
};
pub struct UserServices;
impl UserServices {
    pub async fn register_user(
        pool: &sqlx::PgPool,
        jwt_config: &JwtConfig,
        email_service: Option<&EmailService>,
        req: RegisterRequest,
    ) -> Result<LoginResponse, AppError> {
        let email = req.email.trim().to_string();
        if !is_valid_email(&email) {
            return Err(AppError::ValidationError(
                "Email format is invalid".to_string(),
            ));
        }

        if !is_strong_password(&req.password_hash) {
            return Err(AppError::ValidationError(
                "Password must be at least 8 characters and include 1 uppercase letter and 1 number"
                    .to_string(),
            ));
        }

        if user_repo::email_exists(pool, &email).await? {
            return Err(AppError::Conflict("Email already exists".to_string()));
        }

        if user_repo::username_exists(pool, &req.username).await? {
            return Err(AppError::Conflict("Username already exists".to_string()));
        }

        let invite_token = req
            .invite_token
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let invite = if let Some(token) = invite_token {
            let invite = org_repo::get_email_invite_by_token(pool, token, &email)
                .await?
                .ok_or(AppError::BadRequest(
                    "Invitation is invalid or expired".to_string(),
                ))?;
            if let Some(expires_at) = invite.invite_expires_at {
                if expires_at < chrono::Utc::now() {
                    return Err(AppError::BadRequest(
                        "Invitation has expired".to_string(),
                    ));
                }
            }
            Some(invite)
        } else {
            None
        };
        let invite_org_id = invite.as_ref().map(|record| record.organization_id);

        if invite.is_none() && email_service.is_none() {
            return Err(AppError::ExternalService(
                "Email service not configured".to_string(),
            ));
        }

        let hash_password_user = hash_password(&req.password_hash)
            .map_err(|e| AppError::Internal(format!("Failed to hash password: {}", e)))?;

        let mut tx = pool.begin().await?;
        let mut user = user_repo::insert_user_tx(
            &mut tx,
            &email,
            &hash_password_user,
            &req.display_name,
            &req.username,
        )
        .await?;

        if let Some(invite) = invite {
            let verified_at = chrono::Utc::now();
            user_repo::mark_email_verified_tx(&mut tx, user.id).await?;
            org_repo::add_member_from_email_invite(
                &mut tx,
                invite.organization_id,
                user.id,
                invite.role,
                invite.invited_by,
                invite.invited_at,
                Some(verified_at),
            )
            .await?;
            org_repo::delete_email_invite(&mut tx, invite.organization_id, invite.id).await?;
            user.email_verified_at = Some(verified_at);
        }

        tx.commit().await?;
        BusinessEvent::UserRegistered {
            user_id: user.id,
            email_redacted: redact_email(&user.email),
        }
        .log();
        if let Some(org_id) = invite_org_id {
            BusinessEvent::MemberJoined {
                org_id,
                user_id: user.id,
            }
            .log();
        }

        let token = jwt_config
            .create_token(user.id, user.email.clone())
            .map_err(|e| AppError::Internal(format!("Failed to create token: {}", e)))?;

        if user.email_verified_at.is_none() {
            let verification_token = jwt_config
                .create_email_verification_token(user.id, user.email.clone())
                .map_err(|e| AppError::Internal(format!("Failed to create token: {}", e)))?;

            let email_service = email_service.ok_or(AppError::ExternalService(
                "Email service not configured".to_string(),
            ))?;
            email_service
                .send_verification_email(&user.email, &verification_token)
                .await?;
            user_repo::set_verification_sent_at(pool, user.id, chrono::Utc::now()).await?;
        }

        Ok(LoginResponse {
            user: UserResponse::from(user),
            token,
        })
    }
    pub async fn login(
        pool: &sqlx::PgPool,
        jwt_config: &JwtConfig,
        req: LoginRequest,
    ) -> Result<LoginResponse, AppError> {
        let user = match user_repo::find_user_by_email(pool, &req.email).await? {
            Some(user) => user,
            None => {
                BusinessEvent::LoginFailed {
                    email_redacted: redact_email(&req.email),
                    reason: "user_not_found".to_string(),
                }
                .log();
                return Err(AppError::InvalidCredentials(
                    "Invalid email or password".to_string(),
                ));
            }
        };
        let hash = user
            .password_hash
            .as_deref()
            .ok_or(AppError::Internal("password hash not found".to_string()))?;

        //verify password
        let verifypassword = verify_password_user(&req.password, hash)
            .map_err(|_| AppError::InvalidCredentials("Invalid email or password".to_string()))?;
        if !verifypassword {
            BusinessEvent::LoginFailed {
                email_redacted: redact_email(&req.email),
                reason: "invalid_password".to_string(),
            }
            .log();
            return Err(AppError::InvalidCredentials(
                "Invalid email or password".to_string(),
            ));
        }
        if !user.is_active {
            BusinessEvent::LoginFailed {
                email_redacted: redact_email(&req.email),
                reason: "inactive_account".to_string(),
            }
            .log();
            return Err(AppError::InvalidCredentials(
                "Invalid email or password".to_string(),
            ));
        }

        user_repo::update_last_active(pool, user.id).await?;
        let token = jwt_config
            .create_token(user.id, user.email.clone())
            .map_err(|e| AppError::Internal(format!("Failed to create token: {}", e)))?;

        BusinessEvent::UserLoggedIn { user_id: user.id }.log();
        Ok(LoginResponse {
            token,
            user: UserResponse::from(user),
        })
    }

    pub async fn get_user_by_id(
        pool: &sqlx::PgPool,
        user_id: Uuid,
    ) -> Result<UserResponse, AppError> {
        let user = user_repo::get_user_by_id(pool, user_id).await?;
        Ok(UserResponse::from(user))
    }

    pub async fn get_user_profile(
        pool: &sqlx::PgPool,
        user_id: Uuid,
    ) -> Result<UserProfileResponse, AppError> {
        let user = user_repo::get_user_by_id(pool, user_id).await?;
        Ok(UserProfileResponse::from(user))
    }

    pub async fn update_user_profile(
        pool: &sqlx::PgPool,
        user_id: Uuid,
        display_name: Option<String>,
        avatar_url: Option<String>,
        bio: Option<String>,
    ) -> Result<UserProfileResponse, AppError> {
        if let Some(value) = display_name.as_ref()
            && value.trim().is_empty()
        {
            return Err(AppError::ValidationError(
                "Display name cannot be empty".to_string(),
            ));
        }

        let user = user_repo::update_user_profile(
            pool,
            user_id,
            display_name.as_deref(),
            avatar_url.as_deref(),
            bio.as_deref(),
        )
        .await?;

        Ok(UserProfileResponse::from(user))
    }

    /// Completes the profile setup flow and updates optional profile fields.
    pub async fn complete_profile_setup(
        pool: &sqlx::PgPool,
        user_id: Uuid,
        req: UpdateUserRequest,
    ) -> Result<UserResponse, AppError> {
        if let Some(value) = req.display_name.as_ref()
            && value.trim().is_empty()
        {
            return Err(AppError::ValidationError(
                "Display name cannot be empty".to_string(),
            ));
        }

        let user = user_repo::complete_profile_setup(
            pool,
            user_id,
            req.display_name.as_deref(),
            req.avatar_url.as_deref(),
            req.bio.as_deref(),
        )
        .await?;

        Ok(UserResponse::from(user))
    }

    pub async fn update_user_preferences(
        pool: &sqlx::PgPool,
        user_id: Uuid,
        req: UpdatePreferencesRequest,
    ) -> Result<(), AppError> {
        if req.theme.trim().is_empty() {
            return Err(AppError::ValidationError("Theme is required".to_string()));
        }

        if req.language.trim().is_empty() {
            return Err(AppError::ValidationError(
                "Language is required".to_string(),
            ));
        }

        let preferences = req.into();
        user_repo::update_user_preferences(pool, user_id, &preferences).await?;
        Ok(())
    }

    pub async fn change_password(
        pool: &sqlx::PgPool,
        user_id: Uuid,
        req: ChangePasswordRequest,
    ) -> Result<(), AppError> {
        if !is_strong_password(&req.new_password) {
            return Err(AppError::ValidationError(
                "Password must be at least 8 characters and include 1 uppercase letter and 1 number"
                    .to_string(),
            ));
        }

        let user = user_repo::get_user_by_id(pool, user_id).await?;
        let hash = user
            .password_hash
            .as_deref()
            .ok_or(AppError::BadRequest("Password not set".to_string()))?;
        let valid = verify_password_user(&req.current_password, hash)
            .map_err(|_| AppError::InvalidCredentials("Invalid credentials".to_string()))?;
        if !valid {
            return Err(AppError::InvalidCredentials(
                "Invalid credentials".to_string(),
            ));
        }

        let new_hash = hash_password(&req.new_password)
            .map_err(|e| AppError::Internal(format!("Failed to hash password: {}", e)))?;
        user_repo::update_password_hash(pool, user_id, &new_hash).await?;
        Ok(())
    }

    pub async fn delete_account(
        pool: &sqlx::PgPool,
        user_id: Uuid,
        req: DeleteAccountRequest,
    ) -> Result<(), AppError> {
        if req.confirmation != "DELETE MY ACCOUNT" {
            return Err(AppError::BadRequest(
                "Confirmation must be DELETE MY ACCOUNT".to_string(),
            ));
        }

        let user = user_repo::get_user_by_id(pool, user_id).await?;
        let hash = user
            .password_hash
            .as_deref()
            .ok_or(AppError::BadRequest("Password not set".to_string()))?;
        let valid = verify_password_user(&req.password, hash)
            .map_err(|_| AppError::InvalidCredentials("Invalid credentials".to_string()))?;
        if !valid {
            return Err(AppError::InvalidCredentials(
                "Invalid credentials".to_string(),
            ));
        }

        user_repo::mark_user_deleted(pool, user_id).await?;
        Ok(())
    }

    pub async fn request_email_verification(
        pool: &sqlx::PgPool,
        jwt_config: &JwtConfig,
        email_service: Option<&EmailService>,
        user_id: Uuid,
    ) -> Result<(), AppError> {
        const VERIFICATION_COOLDOWN_SECS: i64 = 120;
        let user = user_repo::get_user_by_id(pool, user_id).await?;
        if user.email_verified_at.is_some() {
            return Err(AppError::Conflict("Email already verified".to_string()));
        }

        if let Some(last_sent) = user_repo::verification_sent_at(pool, user_id).await? {
            let seconds_since = chrono::Utc::now()
                .signed_duration_since(last_sent)
                .num_seconds();
            if seconds_since < VERIFICATION_COOLDOWN_SECS {
                let remaining = VERIFICATION_COOLDOWN_SECS - seconds_since;
                return Err(AppError::BadRequest(format!(
                    "Please wait {} seconds before requesting another verification email",
                    remaining.max(0)
                )));
            }
        }

        let token = jwt_config
            .create_email_verification_token(user.id, user.email.clone())
            .map_err(|e| AppError::Internal(format!("Failed to create token: {}", e)))?;

        let email_service = email_service.ok_or(AppError::ExternalService(
            "Email service not configured".to_string(),
        ))?;
        email_service
            .send_verification_email(&user.email, &token)
            .await?;
        user_repo::set_verification_sent_at(pool, user.id, chrono::Utc::now()).await?;

        Ok(())
    }

    pub async fn verify_email_token(
        pool: &sqlx::PgPool,
        jwt_config: &JwtConfig,
        token: &str,
    ) -> Result<(), AppError> {
        let claims = jwt_config
            .verify_email_verification_token(token)
            .map_err(|_| AppError::BadRequest("Invalid verification token".to_string()))?;

        if claims.typ != "email_verification" {
            return Err(AppError::BadRequest(
                "Invalid verification token".to_string(),
            ));
        }

        let user_id = Uuid::parse_str(&claims.sub)
            .map_err(|_| AppError::BadRequest("Invalid verification token".to_string()))?;
        let user = user_repo::get_user_by_id(pool, user_id).await?;
        if user.email != claims.email {
            return Err(AppError::BadRequest(
                "Invalid verification token".to_string(),
            ));
        }
        if user.email_verified_at.is_some() {
            return Ok(());
        }

        user_repo::mark_email_verified(pool, user_id).await?;
        BusinessEvent::EmailVerified { user_id }.log();
        Ok(())
    }
}

fn is_valid_email(email: &str) -> bool {
    let trimmed = email.trim();
    if trimmed.is_empty() || trimmed.contains(' ') {
        return false;
    }
    let mut parts = trimmed.split('@');
    let local = match parts.next() {
        Some(value) => value,
        None => return false,
    };
    let domain = match parts.next() {
        Some(value) => value,
        None => return false,
    };
    if parts.next().is_some() {
        return false;
    }
    if local.is_empty() || domain.is_empty() {
        return false;
    }
    if domain.starts_with('.') || domain.ends_with('.') {
        return false;
    }
    domain.contains('.')
}

fn is_strong_password(password: &str) -> bool {
    if password.len() < 8 {
        return false;
    }
    let mut has_upper = false;
    let mut has_digit = false;
    for ch in password.chars() {
        if ch.is_ascii_uppercase() {
            has_upper = true;
        }
        if ch.is_ascii_digit() {
            has_digit = true;
        }
    }
    has_upper && has_digit
}
