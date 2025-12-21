use axum::{
    extract::{FromRef, FromRequestParts, Request, State},
    http::{header, request::Parts},
    middleware::Next,
    response::Response,
};
use uuid::Uuid;

use crate::{AppState, error::AppError, services::jwt::JwtConfig};

#[derive(Debug, Clone)]
pub struct AuthUser {
    pub user_id: Uuid,
    pub email: String,
}

pub async fn auth_middleware(
    State(_state): State<AppState>,
    mut req: Request,
    next: Next,
) -> Result<Response, AppError> {
    let token = match req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|val| val.strip_prefix("Bearer "))
    {
        Some(t) => {
            println!("Auth middleware: Found token in header");
            t.to_string()
        },
        None => {
            let query = req.uri().query().unwrap_or("");
            println!("Auth middleware: Checking query params: {}", query);
            let params: std::collections::HashMap<String, String> =
                serde_urlencoded::from_str(query).unwrap_or_default();
            params
                .get("token")
                .cloned()
                .ok_or(AppError::Unauthorized(
                    "Missing authorization token".to_string(),
                ))?
        }
    };

    let jwt_config = JwtConfig::secret_env();
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
