use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Serialize;
use std::fmt;

#[derive(Debug)]
#[allow(dead_code)]
pub enum AppError {
    // Database errors
    Database(sqlx::Error),

    // Authentication & Authorization
    Unauthorized(String),
    Forbidden(String),
    InvalidCredentials(String),
    EmailNotVerified(String),

    // Resource errors
    NotFound(String),
    Conflict(String),
    ConflictWithPayload(String, serde_json::Value),
    BoardArchived(String),
    BoardDeleted(String),

    // Validation errors
    BadRequest(String),
    ValidationError(String),

    // WebSocket errors
    WebSocketError(String),

    // External service errors
    ExternalService(String),

    // Subscription limits
    LimitExceeded(String),

    // Internal errors
    Internal(String),
}

#[derive(Serialize)]
struct ErrorResponse {
    success: bool,
    error: ErrorDetail,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<serde_json::Value>,
}

#[derive(Serialize)]
struct ErrorDetail {
    code: String,
    message: String,
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::Database(e) => write!(f, "Database error: {}", e),
            AppError::Unauthorized(msg) => write!(f, "Unauthorized: {}", msg),
            AppError::Forbidden(msg) => write!(f, "Forbidden: {}", msg),
            AppError::InvalidCredentials(msg) => write!(f, "Invalid credentials: {}", msg),
            AppError::EmailNotVerified(msg) => write!(f, "Email not verified: {}", msg),
            AppError::NotFound(msg) => write!(f, "Not found: {}", msg),
            AppError::Conflict(msg) => write!(f, "Conflict: {}", msg),
            AppError::ConflictWithPayload(msg, _) => write!(f, "Conflict: {}", msg),
            AppError::BoardArchived(msg) => write!(f, "Board archived: {}", msg),
            AppError::BoardDeleted(msg) => write!(f, "Board deleted: {}", msg),
            AppError::BadRequest(msg) => write!(f, "Bad request: {}", msg),
            AppError::ValidationError(msg) => write!(f, "Validation error: {}", msg),
            AppError::WebSocketError(msg) => write!(f, "WebSocket error: {}", msg),
            AppError::ExternalService(msg) => write!(f, "External service error: {}", msg),
            AppError::LimitExceeded(msg) => write!(f, "Limit exceeded: {}", msg),
            AppError::Internal(msg) => write!(f, "Internal error: {}", msg),
        }
    }
}

impl std::error::Error for AppError {}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code, message) = match &self {
            AppError::Database(e) => {
                tracing::error!("Database error: {:?}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "DATABASE_ERROR",
                    "database error".to_string(),
                )
            }
            AppError::Unauthorized(msg) => (StatusCode::UNAUTHORIZED, "UNAUTHORIZED", msg.clone()),
            AppError::Forbidden(msg) => (StatusCode::FORBIDDEN, "FORBIDDEN", msg.clone()),
            AppError::InvalidCredentials(msg) => {
                (StatusCode::UNAUTHORIZED, "INVALID_CREDENTIALS", msg.clone())
            }
            AppError::EmailNotVerified(msg) => {
                (StatusCode::UNAUTHORIZED, "EMAIL_NOT_VERIFIED", msg.clone())
            }
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, "NOT_FOUND", msg.clone()),
            AppError::Conflict(msg) => (StatusCode::CONFLICT, "CONFLICT", msg.clone()),
            AppError::ConflictWithPayload(msg, _) => {
                (StatusCode::CONFLICT, "CONFLICT", msg.clone())
            }
            AppError::BoardArchived(msg) => (StatusCode::GONE, "BOARD_ARCHIVED", msg.clone()),
            AppError::BoardDeleted(msg) => (StatusCode::GONE, "BOARD_DELETED", msg.clone()),
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, "BAD_REQUEST", msg.clone()),
            AppError::ValidationError(msg) => (
                StatusCode::UNPROCESSABLE_ENTITY,
                "VALIDATION_ERROR",
                msg.clone(),
            ),
            AppError::WebSocketError(msg) => {
                (StatusCode::BAD_REQUEST, "WEBSOCKET_ERROR", msg.clone())
            }
            AppError::ExternalService(msg) => {
                tracing::error!("External service error: {}", msg);
                (
                    StatusCode::BAD_GATEWAY,
                    "EXTERNAL_SERVICE_ERROR",
                    "Error service".to_string(),
                )
            }
            AppError::LimitExceeded(msg) => {
                (StatusCode::PAYMENT_REQUIRED, "LIMIT_EXCEEDED", msg.clone())
            }
            AppError::Internal(msg) => {
                tracing::error!("Internal error: {}", msg);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "Server Error".to_string(),
                )
            }
        };

        let data = match &self {
            AppError::ConflictWithPayload(_, payload) => Some(payload.clone()),
            _ => None,
        };

        let body = ErrorResponse {
            success: false,
            error: ErrorDetail {
                code: code.to_string(),
                message,
            },
            data,
        };

        (status, Json(body)).into_response()
    }
}

// From implementations for automatic conversion
impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        match &err {
            sqlx::Error::RowNotFound => AppError::NotFound("Data not found".to_string()),
            _ => AppError::Database(err),
        }
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::BadRequest(format!("JSON parse error: {}", err))
    }
}
