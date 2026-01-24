use std::env;

use tracing::Level;
use tracing_subscriber::EnvFilter;

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

pub fn init_tracing() {
    let settings = LogSettings::from_env();
    let env_filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(settings.default_filter()));

    let builder = tracing_subscriber::fmt()
        .with_env_filter(env_filter)
        .with_target(true)
        .with_level(true)
        .with_file(true)
        .with_line_number(true)
        .with_thread_ids(true);

    match settings.format {
        LogFormat::Json => builder.json().init(),
        LogFormat::Pretty => builder.pretty().init(),
    }
}
