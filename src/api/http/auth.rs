use axum::{Extension, Json, extract::State};

use crate::{
    app::state::AppState,
    auth::jwt::JwtConfig,
    auth::middleware::AuthUser,
    dto::auth::{
        ChangePasswordRequest, DeleteAccountRequest, LoginRequest, LoginResponse, MessageResponse,
        RegisterRequest, UpdatePreferencesRequest, UpdateUserRequest, UserProfileResponse,
        UserReponse, VerifyEmailRequest,
    },
    dto::organizations::OrganizationInvitationsResponse,
    error::AppError,
    usecases::auth::UserServices,
    usecases::organizations::OrganizationService,
};

pub async fn register_handle(
    State(state): State<AppState>,
    Json(req): Json<RegisterRequest>,
) -> Result<Json<LoginResponse>, AppError> {
    let jwt_config = JwtConfig {
        secret: state.jwt_secret.clone(),
        expiration_hours: 24,
    };
    let response =
        UserServices::register_user(&state.db, &jwt_config, state.email_service.as_ref(), req)
            .await?;
    Ok(Json(response))
}
pub async fn login_handle(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, AppError> {
    let jwt_config = JwtConfig {
        secret: state.jwt_secret.clone(),
        expiration_hours: 24,
    };
    let response = UserServices::login(&state.db, &jwt_config, req).await?;
    Ok(Json(response))
}
pub async fn get_me_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
) -> Result<Json<UserProfileResponse>, AppError> {
    let user_id = auth_user.user_id;

    let user = UserServices::get_user_profile(&state.db, user_id).await?;

    Ok(Json(user))
}

/// Returns profile data for the profile setup wizard.
pub async fn get_profile_setup_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
) -> Result<Json<UserReponse>, AppError> {
    let user = UserServices::get_user_by_id(&state.db, auth_user.user_id).await?;

    Ok(Json(user))
}

pub async fn update_me_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Json(req): Json<UpdateUserRequest>,
) -> Result<Json<UserProfileResponse>, AppError> {
    let user_id = auth_user.user_id;
    let user = UserServices::update_user_profile(
        &state.db,
        user_id,
        req.display_name,
        req.avatar_url,
        req.bio,
    )
    .await?;

    Ok(Json(user))
}

/// Completes the profile setup wizard and updates optional profile fields.
pub async fn complete_profile_setup_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Json(req): Json<UpdateUserRequest>,
) -> Result<Json<UserReponse>, AppError> {
    let user = UserServices::complete_profile_setup(&state.db, auth_user.user_id, req).await?;

    Ok(Json(user))
}

pub async fn update_preferences_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Json(req): Json<UpdatePreferencesRequest>,
) -> Result<axum::http::StatusCode, AppError> {
    UserServices::update_user_preferences(&state.db, auth_user.user_id, req).await?;
    Ok(axum::http::StatusCode::OK)
}

pub async fn change_password_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Json(req): Json<ChangePasswordRequest>,
) -> Result<axum::http::StatusCode, AppError> {
    UserServices::change_password(&state.db, auth_user.user_id, req).await?;
    Ok(axum::http::StatusCode::NO_CONTENT)
}

pub async fn delete_account_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Json(req): Json<DeleteAccountRequest>,
) -> Result<axum::http::StatusCode, AppError> {
    UserServices::delete_account(&state.db, auth_user.user_id, req).await?;
    Ok(axum::http::StatusCode::NO_CONTENT)
}

pub async fn request_verification_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
) -> Result<Json<MessageResponse>, AppError> {
    let jwt_config = JwtConfig {
        secret: state.jwt_secret.clone(),
        expiration_hours: 24,
    };
    UserServices::request_email_verification(
        &state.db,
        &jwt_config,
        state.email_service.as_ref(),
        auth_user.user_id,
    )
    .await?;
    Ok(Json(MessageResponse {
        message: "Verification email sent".to_string(),
    }))
}

pub async fn verify_email_handle(
    State(state): State<AppState>,
    Json(req): Json<VerifyEmailRequest>,
) -> Result<Json<MessageResponse>, AppError> {
    let jwt_config = JwtConfig {
        secret: state.jwt_secret.clone(),
        expiration_hours: 24,
    };
    UserServices::verify_email_token(&state.db, &jwt_config, &req.token).await?;
    Ok(Json(MessageResponse {
        message: "Email verified".to_string(),
    }))
}

/// Lists pending organization invitations for the current user.
pub async fn list_invitations_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
) -> Result<Json<OrganizationInvitationsResponse>, AppError> {
    let response = OrganizationService::list_invitations(&state.db, auth_user.user_id).await?;

    Ok(Json(response))
}
