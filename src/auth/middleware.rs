use axum::{
    Extension,
    extract::{Request, State},
    http::header,
    middleware::Next,
    response::Response,
};
use uuid::Uuid;

use crate::{app::state::AppState, error::AppError, repositories::users as user_repo};

#[derive(Debug, Clone)]
pub struct AuthUser {
    pub user_id: Uuid,
    #[allow(dead_code)]
    pub email: String,
}

pub async fn auth_middleware(
    State(state): State<AppState>,
    mut req: Request,
    next: Next,
) -> Result<Response, AppError> {
    let token = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|val| val.strip_prefix("Bearer "))
        .map(str::to_string)
        .or_else(|| {
            let query = req.uri().query().unwrap_or("");
            let params: std::collections::HashMap<String, String> =
                serde_urlencoded::from_str(query).unwrap_or_default();
            params.get("token").cloned()
        })
        .ok_or(AppError::Unauthorized(
            "Missing authorization token".to_string(),
        ))?;

    let jwt_config = state.jwt_config.clone();

    let claim = jwt_config
        .verify_token(&token)
        .map_err(|e| AppError::Unauthorized(format!("Invalid token: {}", e)))?;

    let user_id = Uuid::parse_str(&claim.sub)
        .map_err(|_| AppError::Unauthorized("Invaliod User id ".to_string()))?;

    let auth_user = AuthUser {
        user_id,
        email: claim.email,
    };

    req.extensions_mut().insert(auth_user);

    Ok(next.run(req).await)
}

pub async fn verified_middleware(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    req: Request,
    next: Next,
) -> Result<Response, AppError> {
    let user = user_repo::get_user_by_id(&state.db, auth_user.user_id).await?;
    if user.email_verified_at.is_none() {
        return Err(AppError::EmailNotVerified(
            "Email address not verified".to_string(),
        ));
    }

    Ok(next.run(req).await)
}
