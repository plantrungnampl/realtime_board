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

fn extract_token_from_header(req: &Request) -> Option<String> {
    req.headers()
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|val| val.strip_prefix("Bearer "))
        .map(str::to_string)
}

fn extract_token_from_header_or_query(req: &Request) -> Option<String> {
    extract_token_from_header(req).or_else(|| {
        let query = req.uri().query().unwrap_or("");
        let params: std::collections::HashMap<String, String> =
            serde_urlencoded::from_str(query).unwrap_or_default();
        params.get("token").cloned()
    })
}

async fn authenticate_with_extractor<F>(
    state: AppState,
    mut req: Request,
    next: Next,
    extract: F,
) -> Result<Response, AppError>
where
    F: Fn(&Request) -> Option<String>,
{
    let token = extract(&req).ok_or(AppError::Unauthorized(
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

pub async fn auth_middleware(
    State(state): State<AppState>,
    req: Request,
    next: Next,
) -> Result<Response, AppError> {
    authenticate_with_extractor(state, req, next, extract_token_from_header).await
}

pub async fn auth_middleware_flexible(
    State(state): State<AppState>,
    req: Request,
    next: Next,
) -> Result<Response, AppError> {
    authenticate_with_extractor(state, req, next, extract_token_from_header_or_query).await
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

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, http::Request};

    #[test]
    fn extract_token_header_priority() {
        let req = Request::builder()
            .header("Authorization", "Bearer header_token")
            .uri("/?token=query_token")
            .body(Body::empty())
            .unwrap();
        // Even with query param allowed, header should take precedence
        assert_eq!(
            extract_token_from_header_or_query(&req),
            Some("header_token".to_string())
        );
    }

    #[test]
    fn extract_token_strict_ignores_query() {
        let req = Request::builder()
            .uri("/?token=query_token")
            .body(Body::empty())
            .unwrap();
        assert_eq!(extract_token_from_header(&req), None);
    }

    #[test]
    fn extract_token_flexible_allows_query() {
        let req = Request::builder()
            .uri("/?token=query_token")
            .body(Body::empty())
            .unwrap();
        assert_eq!(
            extract_token_from_header_or_query(&req),
            Some("query_token".to_string())
        );
    }
}
