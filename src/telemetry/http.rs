use std::time::Instant;

use axum::{
    extract::{MatchedPath, Request},
    http::{HeaderName, HeaderValue},
    middleware::Next,
    response::Response,
};
use tracing::{Instrument, field};
use uuid::Uuid;

pub const REQUEST_ID_HEADER: &str = "x-request-id";
pub const TRACE_ID_HEADER: &str = "x-trace-id";

#[derive(Debug, Clone)]
pub struct RequestContext {
    pub request_id: String,
    pub trace_id: String,
}

impl RequestContext {
    pub fn new(request_id: String, trace_id: String) -> Self {
        Self {
            request_id,
            trace_id,
        }
    }
}

pub async fn request_logging_middleware(mut req: Request, next: Next) -> Response {
    let request_id = extract_or_generate_header(&req, REQUEST_ID_HEADER);
    let trace_id = req
        .headers()
        .get(TRACE_ID_HEADER)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string())
        .unwrap_or_else(|| request_id.clone());

    req.extensions_mut()
        .insert(RequestContext::new(request_id.clone(), trace_id.clone()));

    let method = req.method().clone();
    let path = req
        .extensions()
        .get::<MatchedPath>()
        .map(|matched| matched.as_str().to_string())
        .unwrap_or_else(|| req.uri().path().to_string());

    let span = tracing::info_span!(
        "http_request",
        request_id = %request_id,
        trace_id = %trace_id,
        method = %method,
        path = %path,
        status = field::Empty,
        latency_ms = field::Empty
    );

    let start = Instant::now();
    let mut response = next.run(req).instrument(span.clone()).await;
    let latency_ms = start.elapsed().as_millis();
    let status = response.status();

    span.record("status", &field::display(status.as_u16()));
    span.record("latency_ms", &field::display(latency_ms));

    if status.is_server_error() {
        tracing::error!(
            parent: &span,
            status = %status.as_u16(),
            latency_ms = %latency_ms,
            "Request completed with server error"
        );
    } else if status.is_client_error() {
        tracing::warn!(
            parent: &span,
            status = %status.as_u16(),
            latency_ms = %latency_ms,
            "Request completed with client error"
        );
    } else {
        tracing::info!(
            parent: &span,
            status = %status.as_u16(),
            latency_ms = %latency_ms,
            "Request completed successfully"
        );
    }

    insert_header(&mut response, REQUEST_ID_HEADER, &request_id);
    insert_header(&mut response, TRACE_ID_HEADER, &trace_id);

    response
}

fn extract_or_generate_header(request: &Request, name: &str) -> String {
    request
        .headers()
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string())
}

fn insert_header(response: &mut Response, name: &'static str, value: &str) {
    let name = HeaderName::from_static(name);
    if let Ok(header_value) = HeaderValue::from_str(value) {
        response.headers_mut().insert(name, header_value);
    }
}
