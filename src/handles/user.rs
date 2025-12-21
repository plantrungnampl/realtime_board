use axum::{Extension, Json, extract::State};

use crate::{
    AppState,
    error::AppError,
    models::users::{LoginRequest, LoginResponse, RegisterRequest, UserReponse},
    services::{auth::UserServices, middleware::AuthUser},
};

pub async fn register_handle(
    State(state): State<AppState>,
    Json(req): Json<RegisterRequest>,
) -> Result<Json<LoginResponse>, AppError> {
    let response = UserServices::register_user(state.db, req).await?;
    Ok(Json(response))
}
pub async fn login_handle(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, AppError> {
    let response = UserServices::Login(state.db, req).await?;
    Ok(Json(response))
}
pub async fn get_me_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
) -> Result<Json<UserReponse>, AppError> {
    let user_id = auth_user.user_id;

    let user = UserServices::get_user_by_id(state.db, user_id).await?;

    Ok(Json(user.into()))
}
