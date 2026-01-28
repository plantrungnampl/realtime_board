use std::{env, error::Error, sync::OnceLock};

use opentelemetry::KeyValue;
use opentelemetry::global;
use opentelemetry::trace::TracerProvider;
use opentelemetry_otlp::WithExportConfig;
use opentelemetry_sdk::{Resource, propagation::TraceContextPropagator, trace as sdktrace};
use tracing_opentelemetry::OpenTelemetryLayer;
use tracing_subscriber::Registry;

const DEFAULT_SERVICE_NAME: &str = "realtime-board-api";
const DEFAULT_TRACER_NAME: &str = "realtime-board";

static TRACER_PROVIDER: OnceLock<sdktrace::SdkTracerProvider> = OnceLock::new();

#[derive(Debug, Clone)]
struct OtelConfig {
    endpoint: String,
    service_name: String,
}

impl OtelConfig {
    fn from_env() -> Option<Self> {
        let endpoint = env::var("OTEL_EXPORTER_OTLP_ENDPOINT").ok()?;
        let service_name =
            env::var("OTEL_SERVICE_NAME").unwrap_or_else(|_| DEFAULT_SERVICE_NAME.to_string());

        Some(Self {
            endpoint,
            service_name,
        })
    }
}

pub fn build_otel_layer()
-> Result<Option<OpenTelemetryLayer<Registry, sdktrace::Tracer>>, Box<dyn Error + Send + Sync>> {
    let config = match OtelConfig::from_env() {
        Some(config) => config,
        None => return Ok(None),
    };

    global::set_text_map_propagator(TraceContextPropagator::new());

    let resource = Resource::builder()
        .with_service_name(config.service_name)
        .with_attribute(KeyValue::new(
            "service.version",
            env!("CARGO_PKG_VERSION").to_string(),
        ))
        .build();

    let exporter = opentelemetry_otlp::SpanExporter::builder()
        .with_tonic()
        .with_endpoint(config.endpoint)
        .build()?;

    let tracer_provider = sdktrace::SdkTracerProvider::builder()
        .with_resource(resource)
        .with_batch_exporter(exporter)
        .build();

    let tracer = tracer_provider.tracer(DEFAULT_TRACER_NAME);
    let _ = TRACER_PROVIDER.set(tracer_provider.clone());
    global::set_tracer_provider(tracer_provider);

    Ok(Some(OpenTelemetryLayer::new(tracer)))
}

pub fn shutdown_tracer_provider() {
    if let Some(provider) = TRACER_PROVIDER.get() {
        if let Err(err) = provider.shutdown() {
            tracing::warn!("OpenTelemetry tracer shutdown failed: {}", err);
        }
    }
}
