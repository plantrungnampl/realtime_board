pub mod http;
pub mod database;
pub mod events;
pub mod otel;
pub mod subscriber;

pub use database::log_query;
pub use events::{BusinessEvent, redact_email};
pub use http::{
    RequestContext,
    extract_header,
    extract_or_generate_header,
    request_logging_middleware,
    REQUEST_ID_HEADER,
    TRACE_ID_HEADER,
};
pub use subscriber::{init_tracing, shutdown_tracing};
