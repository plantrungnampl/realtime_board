use axum::{
    Json,
    extract::State,
    http::{HeaderMap, header},
};
use serde::Deserialize;
use uuid::Uuid;

use crate::{app::state::AppState, error::AppError};

const MAX_EVENTS: usize = 50;
const MAX_MESSAGE_LEN: usize = 2000;
const MAX_STACK_LEN: usize = 8000;
const MAX_CONTEXT_LEN: usize = 8000;

#[derive(Debug, Deserialize)]
pub(crate) struct ClientLogBatch {
    events: Vec<ClientLogEvent>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct ClientLogEvent {
    level: String,
    message: String,
    context: Option<serde_json::Value>,
    stack: Option<String>,
    url: Option<String>,
    user_agent: Option<String>,
    session_id: Option<String>,
    trace_id: Option<String>,
    span_id: Option<String>,
    timestamp: Option<String>,
    route: Option<String>,
    source: Option<String>,
}

pub async fn ingest_client_logs(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<ClientLogBatch>,
) -> Result<(), AppError> {
    if payload.events.is_empty() {
        return Err(AppError::BadRequest("Events payload is empty".to_string()));
    }
    if payload.events.len() > MAX_EVENTS {
        return Err(AppError::BadRequest("Too many log events".to_string()));
    }

    let user_id = maybe_extract_user_id(&state, &headers)?;

    for event in payload.events {
        validate_event(&event)?;
        emit_client_log(event, user_id.as_ref());
    }

    Ok(())
}

fn maybe_extract_user_id(state: &AppState, headers: &HeaderMap) -> Result<Option<Uuid>, AppError> {
    let token = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .map(str::to_string);

    let Some(token) = token else {
        return Ok(None);
    };

    let jwt_config = state.jwt_config.clone();

    let claims = jwt_config
        .verify_token(&token)
        .map_err(|err| AppError::Unauthorized(format!("Invalid token: {}", err)))?;

    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| AppError::Unauthorized("Invalid user id".to_string()))?;

    Ok(Some(user_id))
}

fn validate_event(event: &ClientLogEvent) -> Result<(), AppError> {
    let level = event.level.as_str();
    if !matches!(level, "debug" | "info" | "warn" | "error") {
        return Err(AppError::BadRequest("Invalid log level".to_string()));
    }

    let message_len = event.message.trim().len();
    if message_len == 0 || message_len > MAX_MESSAGE_LEN {
        return Err(AppError::BadRequest("Invalid log message".to_string()));
    }

    if let Some(stack) = &event.stack {
        if stack.len() > MAX_STACK_LEN {
            return Err(AppError::BadRequest("Stack trace too large".to_string()));
        }
    }

    if let Some(context) = &event.context {
        let context_len = serde_json::to_string(context)
            .map_err(|_| AppError::BadRequest("Invalid context payload".to_string()))?
            .len();
        if context_len > MAX_CONTEXT_LEN {
            return Err(AppError::BadRequest(
                "Context payload too large".to_string(),
            ));
        }
    }

    Ok(())
}

fn emit_client_log(event: ClientLogEvent, user_id: Option<&Uuid>) {
    let level = event.level.as_str();
    let user_id = user_id.map(ToString::to_string).unwrap_or_default();

    match level {
        "debug" => tracing::debug!(
            target: "client_log",
            message = %event.message,
            url = event.url.as_deref().unwrap_or(""),
            user_agent = event.user_agent.as_deref().unwrap_or(""),
            session_id = event.session_id.as_deref().unwrap_or(""),
            trace_id = event.trace_id.as_deref().unwrap_or(""),
            span_id = event.span_id.as_deref().unwrap_or(""),
            route = event.route.as_deref().unwrap_or(""),
            source = event.source.as_deref().unwrap_or(""),
            user_id = %user_id,
            timestamp = event.timestamp.as_deref().unwrap_or(""),
            context = ?event.context,
            stack = event.stack.as_deref().unwrap_or(""),
            "Client log event"
        ),
        "info" => tracing::info!(
            target: "client_log",
            message = %event.message,
            url = event.url.as_deref().unwrap_or(""),
            user_agent = event.user_agent.as_deref().unwrap_or(""),
            session_id = event.session_id.as_deref().unwrap_or(""),
            trace_id = event.trace_id.as_deref().unwrap_or(""),
            span_id = event.span_id.as_deref().unwrap_or(""),
            route = event.route.as_deref().unwrap_or(""),
            source = event.source.as_deref().unwrap_or(""),
            user_id = %user_id,
            timestamp = event.timestamp.as_deref().unwrap_or(""),
            context = ?event.context,
            stack = event.stack.as_deref().unwrap_or(""),
            "Client log event"
        ),
        "warn" => tracing::warn!(
            target: "client_log",
            message = %event.message,
            url = event.url.as_deref().unwrap_or(""),
            user_agent = event.user_agent.as_deref().unwrap_or(""),
            session_id = event.session_id.as_deref().unwrap_or(""),
            trace_id = event.trace_id.as_deref().unwrap_or(""),
            span_id = event.span_id.as_deref().unwrap_or(""),
            route = event.route.as_deref().unwrap_or(""),
            source = event.source.as_deref().unwrap_or(""),
            user_id = %user_id,
            timestamp = event.timestamp.as_deref().unwrap_or(""),
            context = ?event.context,
            stack = event.stack.as_deref().unwrap_or(""),
            "Client log event"
        ),
        _ => tracing::error!(
            target: "client_log",
            message = %event.message,
            url = event.url.as_deref().unwrap_or(""),
            user_agent = event.user_agent.as_deref().unwrap_or(""),
            session_id = event.session_id.as_deref().unwrap_or(""),
            trace_id = event.trace_id.as_deref().unwrap_or(""),
            span_id = event.span_id.as_deref().unwrap_or(""),
            route = event.route.as_deref().unwrap_or(""),
            source = event.source.as_deref().unwrap_or(""),
            user_id = %user_id,
            timestamp = event.timestamp.as_deref().unwrap_or(""),
            context = ?event.context,
            stack = event.stack.as_deref().unwrap_or(""),
            "Client log event"
        ),
    }
}
