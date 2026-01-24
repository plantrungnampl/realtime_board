# Phase 7 OpenTelemetry Tracing Integration

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Follow `.agent/PLANS.md` from the repository root. This document must be maintained in accordance with those rules.

## Purpose / Big Picture

After this change, the backend can emit distributed traces using OpenTelemetry and forward them to a self-hosted Grafana Tempo instance via Grafana Alloy. A developer can start the logging stack, hit any API endpoint, and see end-to-end trace spans in Grafana Tempo for each request. This makes it possible to debug slow requests and cross-service call chains with concrete timing data rather than just logs.

## Progress

- [x] (2026-01-24 16:01Z) Created this ExecPlan with scope, dependencies, and acceptance criteria.
- [x] (2026-01-24 16:19Z) Added OpenTelemetry tracing initialization, OTLP propagation, and shutdown handling in the backend.
- [x] (2026-01-24 16:19Z) Added Tempo + Alloy OTLP receiver/exporter and Grafana datasource wiring.
- [x] (2026-01-24 16:19Z) Updated observability documentation and changelog for Phase 7 completion.
- [x] (2026-01-24 16:19Z) Ran `cargo check` and captured warnings.

## Surprises & Discoveries

- Observation: `opentelemetry-otlp` no longer exposes `new_pipeline()`; must build a `SpanExporter` and `SdkTracerProvider` directly.
  Evidence: `cargo check` errors showed missing `new_pipeline`/`new_exporter` and `with_tonic` gated by `grpc-tonic`.
- Observation: `Resource::new` is private in `opentelemetry_sdk`; use `Resource::builder()` instead.
  Evidence: `cargo check` error E0624 for `Resource::new`.

## Decision Log

- Decision: Use self-hosted Grafana Tempo for trace storage and Grafana Alloy OTLP receiver/exporter for ingest.
  Rationale: Aligns with existing self-hosted Loki + Grafana stack while keeping infrastructure simple and cost-controlled.
  Date/Author: 2026-01-24 / Codex
- Decision: Enable OTEL when `OTEL_EXPORTER_OTLP_ENDPOINT` is configured; default service name to `realtime-board-api`.
  Rationale: Use standard OpenTelemetry environment configuration to avoid custom settings and keep behavior predictable.
  Date/Author: 2026-01-24 / Codex
- Decision: Use `SpanExporter::builder().with_tonic()` and `SdkTracerProvider::builder()` with OTLP gRPC.
  Rationale: Matches opentelemetry-otlp 0.31 API and avoids deprecated pipeline helpers.
  Date/Author: 2026-01-24 / Codex
- Decision: Store the tracer provider in a `OnceLock` to allow explicit shutdown on server exit.
  Rationale: `global::shutdown_tracer_provider` is not available in this version; provider shutdown is the supported API.
  Date/Author: 2026-01-24 / Codex

## Outcomes & Retrospective

Phase 7 tracing is implemented with OTLP propagation, Tempo backend wiring, and Grafana datasource provisioning. `cargo check` passes with existing warnings unrelated to this change set.

## Context and Orientation

This repository is a Rust (Axum) backend with a React frontend. Logging is centralized in `src/telemetry/`, and log aggregation uses Grafana Alloy + Loki configured in `logging/` and `docker-compose.logging.yml`.

Key files:
  - `src/telemetry/subscriber.rs` initializes tracing subscribers for logs.
  - `src/telemetry/http.rs` handles request logging and header propagation.
  - `src/app/run.rs` starts the server and currently calls `telemetry::init_tracing()`.
  - `logging/alloy-config.alloy` configures Alloy for log ingestion.
  - `docker-compose.logging.yml` defines Loki, Alloy, and Grafana services.

Definitions:
  - OpenTelemetry (OTEL) is a standard for collecting traces. A trace is a tree of spans that represents a request.
  - OTLP is the protocol used to send traces to a backend.
  - Grafana Tempo is the trace backend that stores and queries spans.
  - Grafana Alloy is the collector/agent that will receive OTLP from the app and export to Tempo.

## Plan of Work

First, implement OTEL initialization in `src/telemetry/otel.rs`. It should read `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_SERVICE_NAME`, configure a resource with `service.name` and `service.version`, install a batch tracer with Tokio runtime, and set a W3C trace context propagator. This module should also expose a shutdown function to flush spans on exit.

Next, update `src/telemetry/subscriber.rs` to compose the logging fmt layer with an optional OTEL layer. If OTEL is disabled (no endpoint), keep existing logging behavior. If enabled, create the OTEL layer and register it with the subscriber.

Then, update `src/telemetry/http.rs` to extract W3C `traceparent` headers into the tracing span context and inject `traceparent` into the response. Keep the existing `x-request-id` and `x-trace-id` headers.

After that, update `src/telemetry/mod.rs` to export the OTEL init/shutdown entry points, and update `src/app/run.rs` to handle init errors and call shutdown after the server exits.

Infrastructure changes:
  - Add `logging/tempo-config.yml` with a minimal local storage config.
  - Update `logging/alloy-config.alloy` to add an OTLP receiver (gRPC + HTTP) and an OTLP exporter that targets Tempo.
  - Update `docker-compose.logging.yml` to add a Tempo service and expose necessary ports.
  - Add `logging/grafana/provisioning/datasources/tempo.yaml` to provision the Tempo datasource in Grafana.

Finally, update documentation to mark Phase 7 complete in `docs/architecture/LOGGING_DESIGN.md`, `docs/architecture/adrs/009-logging-observability-system.md`, and `docs/CHANGELOG.md`.

## Concrete Steps

Work from repository root `/Data/rust_project/Real-time_Board`.

1. Create `src/telemetry/otel.rs` with OTEL setup and shutdown helpers.
2. Update `src/telemetry/subscriber.rs` to wire OTEL layer with existing log formats.
3. Update `src/telemetry/http.rs` to extract and inject `traceparent`.
4. Update `src/telemetry/mod.rs` and `src/app/run.rs` to expose init/shutdown.
5. Add `logging/tempo-config.yml` and update `logging/alloy-config.alloy`.
6. Update `docker-compose.logging.yml` to add Tempo and OTLP port exposures.
7. Add `logging/grafana/provisioning/datasources/tempo.yaml`.
8. Update docs and changelog entries.
9. Run `cargo check` or `cargo test` to validate.

Example commands (run from repo root):
  cargo check
  docker compose -f docker-compose.logging.yml up -d

## Validation and Acceptance

Acceptance is met when:
  - Backend starts with `OTEL_EXPORTER_OTLP_ENDPOINT` set and emits traces without panicking.
  - Grafana shows a Tempo datasource, and a test API request produces a visible trace.
  - `cargo check` (or `cargo test`) succeeds.
  - Documentation reflects Phase 7 completion and describes how to enable tracing.

## Idempotence and Recovery

All steps are additive or replace existing configuration files; they can be re-run without damaging data. If the logging stack fails to start, stop it with `docker compose -f docker-compose.logging.yml down` and rerun after fixing config errors. No destructive migrations are required.

## Artifacts and Notes

Pending until implementation and validation output are available.

## Interfaces and Dependencies

Rust crates:
  - `opentelemetry`, `opentelemetry_sdk`, `opentelemetry-otlp`, `tracing-opentelemetry`.
  - Use `opentelemetry_sdk::runtime::Tokio` for batch exporter and `opentelemetry::global` to set the propagator.

Key functions:
  - `crate::telemetry::otel::build_otel_layer() -> Result<Option<OpenTelemetryLayer<Registry, Tracer>>, Box<dyn Error + Send + Sync>>`
  - `crate::telemetry::otel::shutdown_tracer_provider()`
  - `crate::telemetry::init_tracing() -> Result<(), Box<dyn Error + Send + Sync>>`

Configuration endpoints:
  - Alloy OTLP receiver on `0.0.0.0:4317` (gRPC) and `0.0.0.0:4318` (HTTP).
  - Tempo ingest on `4317` (gRPC) and HTTP API on `3200`.

When this plan is revised, append a short note at the end describing what changed and why.

Plan update 2026-01-24: Marked Phase 7 milestones complete, documented opentelemetry API changes, and recorded decisions/shutdown strategy after successful `cargo check`.
