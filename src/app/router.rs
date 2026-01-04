use axum::{
    Router,
    http::{HeaderValue, Method, header},
    middleware,
    routing::{delete, get, patch, post, put},
};
use tower_http::cors::CorsLayer;

use crate::{
    api::{
        http::{auth as auth_http, boards as boards_http, organizations as organizations_http},
        ws::boards as boards_ws,
    },
    app::state::AppState,
    auth::middleware::{auth_middleware, verified_middleware},
};

pub fn build_router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin("http://localhost:5173".parse::<HeaderValue>().unwrap())
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION, header::ACCEPT]);

    let auth_routes = Router::new()
        .route("/auth/register", post(auth_http::register_handle))
        .route("/auth/login", post(auth_http::login_handle))
        .route("/auth/verify-email", post(auth_http::verify_email_handle))
        .route(
            "/organizations/invites/validate",
            get(organizations_http::validate_invite_handle),
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
        ));

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
            get(organizations_http::list_members_handle)
                .post(organizations_http::invite_members_handle),
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
            "/organizations/{organization_id}/invites/{invite_id}/resend",
            post(organizations_http::resend_email_invite_handle),
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
        .route(
            "/organizations/{organization_id}/members/{member_id}/resend",
            post(organizations_http::resend_invite_handle),
        )
        .route("/api/boards/", post(boards_http::create_board_handle))
        .route("/api/boards/list", get(boards_http::get_board_handle))
        .route(
            "/api/boards/{board_id}/members",
            get(boards_http::list_board_members_handle)
                .post(boards_http::invite_board_members_handle),
        )
        .route(
            "/api/boards/{board_id}/members/{member_id}",
            patch(boards_http::update_board_member_role_handle)
                .delete(boards_http::remove_board_member_handle),
        )
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
            auth_middleware,
        ));

    Router::new()
        .merge(auth_routes)
        .merge(onboarding_routes)
        .merge(verified_routes)
        .merge(ws_routes)
        .layer(cors)
        .with_state(state)
}
