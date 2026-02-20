use axum::{
    Router,
    http::{HeaderName, HeaderValue, Method, header},
    middleware,
    routing::{delete, get, patch, post, put},
};
use governor::middleware::NoOpMiddleware;
use std::{net::IpAddr, sync::Arc};
use tower_governor::{
    GovernorLayer,
    errors::GovernorError,
    governor::GovernorConfigBuilder,
    key_extractor::{KeyExtractor, SmartIpKeyExtractor},
};
use tower_http::cors::{AllowOrigin, CorsLayer};
use uuid::Uuid;

use crate::{
    api::{
        http::{
            auth as auth_http, boards as boards_http, comments as comments_http,
            elements as elements_http, organizations as organizations_http,
            telemetry as telemetry_http,
        },
        ws::boards as boards_ws,
    },
    app::state::AppState,
    auth::middleware::{AuthUser, auth_middleware, auth_middleware_flexible, verified_middleware},
    telemetry,
};

#[derive(Clone, Debug, Hash, Eq, PartialEq)]
enum InviteRateLimitKey {
    User(Uuid),
    Ip(IpAddr),
}

#[derive(Clone, Copy, Debug, Default)]
struct InviteKeyExtractor;

impl KeyExtractor for InviteKeyExtractor {
    type Key = InviteRateLimitKey;

    fn extract<T>(&self, req: &axum::http::Request<T>) -> Result<Self::Key, GovernorError> {
        if let Some(auth_user) = req.extensions().get::<AuthUser>() {
            return Ok(InviteRateLimitKey::User(auth_user.user_id));
        }

        let ip = SmartIpKeyExtractor.extract(req)?;
        Ok(InviteRateLimitKey::Ip(ip))
    }
}

pub fn build_router(state: AppState) -> Router {
    let cors = build_cors_layer();
    let auth_rate_limit = build_auth_rate_limiter();
    let onboarding_rate_limit = build_auth_rate_limiter();
    let invite_rate_limit = build_invite_rate_limiter();

    let auth_routes = Router::new()
        .route("/auth/register", post(auth_http::register_handle))
        .route("/auth/login", post(auth_http::login_handle))
        .route("/auth/verify-email", post(auth_http::verify_email_handle))
        .route(
            "/organizations/invites/validate",
            get(organizations_http::validate_invite_handle),
        )
        .layer(auth_rate_limit);

    let telemetry_routes = Router::new().route(
        "/api/telemetry/client",
        post(telemetry_http::ingest_client_logs),
    );

    let onboarding_routes = Router::new()
        .route(
            "/users/me/profile-setup",
            get(auth_http::get_profile_setup_handle),
        )
        .route(
            "/users/me/profile-setup",
            put(auth_http::complete_profile_setup_handle),
        )
        .route(
            "/auth/request-verification",
            post(auth_http::request_verification_handle),
        )
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth_middleware,
        ))
        .layer(onboarding_rate_limit);

    let invite_routes = Router::new()
        .route(
            "/organizations/{organization_id}/members",
            post(organizations_http::invite_members_handle),
        )
        .route(
            "/organizations/{organization_id}/invites/{invite_id}/resend",
            post(organizations_http::resend_email_invite_handle),
        )
        .route(
            "/organizations/{organization_id}/members/{member_id}/resend",
            post(organizations_http::resend_invite_handle),
        )
        .route(
            "/api/boards/{board_id}/members",
            post(boards_http::invite_board_members_handle),
        )
        .route_layer(invite_rate_limit);

    let verified_routes = Router::new()
        .route("/users/me", get(auth_http::get_me_handle))
        .route("/users/me", put(auth_http::update_me_handle))
        .route("/users/me", patch(auth_http::update_me_handle))
        .route("/users/me", delete(auth_http::delete_account_handle))
        .route(
            "/users/me/invitations",
            get(auth_http::list_invitations_handle),
        )
        .route(
            "/users/me/preferences",
            put(auth_http::update_preferences_handle),
        )
        .route(
            "/users/me/password",
            post(auth_http::change_password_handle),
        )
        .route(
            "/organizations",
            get(organizations_http::list_organizations_handle)
                .post(organizations_http::create_organization_handle),
        )
        .route(
            "/organizations/slug-availability",
            get(organizations_http::check_slug_availability_handle),
        )
        .route(
            "/organizations/{organization_id}/members",
            get(organizations_http::list_members_handle),
        )
        .route(
            "/organizations/{organization_id}/usage",
            get(organizations_http::get_usage_handle),
        )
        .route(
            "/organizations/{organization_id}/subscription",
            patch(organizations_http::update_subscription_tier_handle),
        )
        .route(
            "/organizations/{organization_id}/invites",
            get(organizations_http::list_email_invites_handle),
        )
        .route(
            "/organizations/{organization_id}/invites/{invite_id}",
            delete(organizations_http::cancel_email_invite_handle),
        )
        .route(
            "/organizations/{organization_id}/members/{member_id}",
            patch(organizations_http::update_member_role_handle)
                .delete(organizations_http::remove_member_handle),
        )
        .route(
            "/organizations/{organization_id}/members/{member_id}/accept",
            post(organizations_http::accept_invite_handle),
        )
        .route(
            "/organizations/{organization_id}/members/{member_id}/decline",
            delete(organizations_http::decline_invite_handle),
        )
        .route("/api/boards/", post(boards_http::create_board_handle))
        .route("/api/boards/list", get(boards_http::get_board_handle))
        .route(
            "/api/boards/{board_id}",
            get(boards_http::get_board_detail_handle)
                .patch(boards_http::update_board_handle)
                .delete(boards_http::delete_board_handle),
        )
        .route(
            "/api/boards/{board_id}/archive",
            post(boards_http::archive_board_handle),
        )
        .route(
            "/api/boards/{board_id}/unarchive",
            post(boards_http::unarchive_board_handle),
        )
        .route(
            "/api/boards/{board_id}/transfer-ownership",
            post(boards_http::transfer_board_ownership_handle),
        )
        .route(
            "/api/boards/{board_id}/favorite",
            post(boards_http::toggle_board_favorite_handle),
        )
        .route(
            "/api/boards/{board_id}/restore",
            post(boards_http::restore_board_handle),
        )
        .route(
            "/api/boards/{board_id}/members",
            get(boards_http::list_board_members_handle),
        )
        .route(
            "/api/boards/{board_id}/comments",
            get(comments_http::list_board_comments_handle)
                .post(comments_http::create_board_comment_handle),
        )
        .route(
            "/api/boards/{board_id}/members/{member_id}",
            patch(boards_http::update_board_member_role_handle)
                .delete(boards_http::remove_board_member_handle),
        )
        .route(
            "/api/boards/{board_id}/elements",
            post(elements_http::create_board_element_handle),
        )
        .route(
            "/api/boards/{board_id}/elements/{element_id}",
            patch(elements_http::update_board_element_handle)
                .delete(elements_http::delete_board_element_handle),
        )
        .route(
            "/api/boards/{board_id}/elements/{element_id}/restore",
            post(elements_http::restore_board_element_handle),
        )
        .merge(invite_routes)
        // Layer order matters: auth must run before verified.
        .layer(middleware::from_fn_with_state(
            state.clone(),
            verified_middleware,
        ))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth_middleware,
        ));

    let ws_routes = Router::new()
        .route("/ws/boards/{board_id}", get(boards_ws::ws_handler))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            verified_middleware,
        ))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth_middleware_flexible,
        ));

    Router::new()
        .merge(auth_routes)
        .merge(telemetry_routes)
        .merge(onboarding_routes)
        .merge(verified_routes)
        .merge(ws_routes)
        .layer(cors)
        .layer(middleware::from_fn(crate::app::middleware::security_headers))
        .layer(middleware::from_fn(telemetry::request_logging_middleware))
        .with_state(state)
}

fn build_auth_rate_limiter() -> GovernorLayer<SmartIpKeyExtractor, NoOpMiddleware> {
    let per_second = std::env::var("AUTH_RATE_LIMIT_PER_SECOND")
        .ok()
        .and_then(|value| value.parse::<u32>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(5);
    let burst_size = std::env::var("AUTH_RATE_LIMIT_BURST")
        .ok()
        .and_then(|value| value.parse::<u32>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(10);
    // Use SmartIpKeyExtractor to correctly identify clients behind proxies (e.g. Docker, AWS ALB)
    // using headers like X-Forwarded-For, preventing shared rate limits (DoS risk).
    let config = Arc::new(
        GovernorConfigBuilder::default()
            .key_extractor(SmartIpKeyExtractor)
            .per_second(u64::from(per_second))
            .burst_size(burst_size)
            .finish()
            .expect("rate limiter config"),
    );
    GovernorLayer { config }
}

fn build_invite_rate_limiter() -> GovernorLayer<InviteKeyExtractor, NoOpMiddleware> {
    let per_second = std::env::var("INVITE_RATE_LIMIT_PER_SECOND")
        .ok()
        .and_then(|value| value.parse::<u32>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(1);
    let burst_size = std::env::var("INVITE_RATE_LIMIT_BURST")
        .ok()
        .and_then(|value| value.parse::<u32>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(5);
    let config = Arc::new(
        GovernorConfigBuilder::default()
            .key_extractor(InviteKeyExtractor)
            .per_second(u64::from(per_second))
            .burst_size(burst_size)
            .finish()
            .expect("invite rate limiter config"),
    );
    GovernorLayer { config }
}

fn build_cors_layer() -> CorsLayer {
    let mut cors = CorsLayer::new()
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([
            header::CONTENT_TYPE,
            header::AUTHORIZATION,
            header::ACCEPT,
            HeaderName::from_static("x-trace-id"),
            HeaderName::from_static("traceparent"),
        ])
        .expose_headers([
            HeaderName::from_static("x-request-id"),
            HeaderName::from_static("x-trace-id"),
            HeaderName::from_static("traceparent"),
        ]);

    if let Ok(origins) = std::env::var("CORS_ALLOWED_ORIGINS") {
        let values: Vec<HeaderValue> = origins
            .split(',')
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .filter_map(|value| HeaderValue::from_str(value).ok())
            .collect();
        if !values.is_empty() {
            cors = cors.allow_origin(AllowOrigin::list(values));
            return cors;
        }
    }

    cors.allow_origin("http://localhost:5173".parse::<HeaderValue>().unwrap())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::Request;
    use std::net::IpAddr;
    use tower_governor::key_extractor::KeyExtractor;
    use uuid::Uuid;

    #[test]
    fn invite_key_extractor_falls_back_to_ip() {
        let request = Request::builder()
            .uri("/")
            .header("x-forwarded-for", "203.0.113.9")
            .body(())
            .expect("request");
        let extractor = InviteKeyExtractor;
        let key = extractor.extract(&request).expect("key");
        let expected_ip: IpAddr = "203.0.113.9".parse().expect("ip");
        assert!(matches!(key, InviteRateLimitKey::Ip(ip) if ip == expected_ip));
    }

    #[test]
    fn invite_key_extractor_uses_auth_user() {
        let user_id = Uuid::new_v4();
        let auth_user = AuthUser {
            user_id,
            email: "owner@example.com".to_string(),
        };
        let mut request = Request::builder()
            .uri("/")
            .header("x-forwarded-for", "203.0.113.11")
            .body(())
            .expect("request");
        request.extensions_mut().insert(auth_user);
        let extractor = InviteKeyExtractor;
        let key = extractor.extract(&request).expect("key");
        assert!(matches!(key, InviteRateLimitKey::User(id) if id == user_id));
    }
}
