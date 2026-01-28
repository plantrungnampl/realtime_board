use std::env;

use tracing::Level;
use tracing_subscriber::{EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};

use crate::telemetry::otel;

#[derive(Debug, Clone, Copy)]
pub enum LogFormat {
    Pretty,
    Json,
}

#[derive(Debug, Clone)]
pub struct LogSettings {
    pub format: LogFormat,
    pub level: Level,
}

impl LogSettings {
    pub fn from_env() -> Self {
        let format = match env::var("LOG_FORMAT").as_deref() {
            Ok("json") => LogFormat::Json,
            _ => LogFormat::Pretty,
        };

        let level = match env::var("LOG_LEVEL").as_deref() {
            Ok("trace") => Level::TRACE,
            Ok("debug") => Level::DEBUG,
            Ok("warn") => Level::WARN,
            Ok("error") => Level::ERROR,
            _ => Level::INFO,
        };

        Self { format, level }
    }

    fn default_filter(&self) -> String {
        let level = self.level.as_str().to_lowercase();
        format!("{level},tower_http=info")
    }
}

pub fn init_tracing() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let settings = LogSettings::from_env();
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new(settings.default_filter()));
    let otel_layer = otel::build_otel_layer()?;
    let registry = tracing_subscriber::registry();

    match (settings.format, otel_layer) {
        (LogFormat::Json, Some(otel_layer)) => {
            let fmt_layer = tracing_subscriber::fmt::layer()
                .json()
                .with_target(true)
                .with_level(true)
                .with_file(true)
                .with_line_number(true)
                .with_thread_ids(true);
            registry
                .with(otel_layer)
                .with(env_filter)
                .with(fmt_layer)
                .init();
        }
        (LogFormat::Json, None) => {
            let fmt_layer = tracing_subscriber::fmt::layer()
                .json()
                .with_target(true)
                .with_level(true)
                .with_file(true)
                .with_line_number(true)
                .with_thread_ids(true);
            registry.with(env_filter).with(fmt_layer).init();
        }
        (LogFormat::Pretty, Some(otel_layer)) => {
            let fmt_layer = tracing_subscriber::fmt::layer()
                .pretty()
                .with_target(true)
                .with_level(true)
                .with_file(true)
                .with_line_number(true)
                .with_thread_ids(true);
            registry
                .with(otel_layer)
                .with(env_filter)
                .with(fmt_layer)
                .init();
        }
        (LogFormat::Pretty, None) => {
            let fmt_layer = tracing_subscriber::fmt::layer()
                .pretty()
                .with_target(true)
                .with_level(true)
                .with_file(true)
                .with_line_number(true)
                .with_thread_ids(true);
            registry.with(env_filter).with(fmt_layer).init();
        }
    }

    Ok(())
}

pub fn shutdown_tracing() {
    otel::shutdown_tracer_provider();
}
