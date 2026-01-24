Goal (incl. success criteria):
- Implement logging/observability phases per LOGGING_DESIGN/ADR-009; currently verifying Phase 7 tracing end-to-end (Tempo + Alloy + backend traces visible).

Constraints/Assumptions:
- Must read docs/README.md and docs/*.md before analysis; update docs when code changes.
- No package.json or tsconfig.json edits; no new dependencies without asking.
- User prefers Bun for frontend commands.

Key decisions:
- Use Docker-based backend to get logs into Alloy (self-hosted path).
- Use self-hosted Grafana Tempo with Alloy OTLP receiver/exporter for tracing.

State:
  - Done:
  - Implemented Phase 5: Loki ruler alert rules + Grafana dashboard updates; updated docs.
  - Implemented Phase 7: OpenTelemetry tracing, W3C traceparent propagation, Tempo backend wiring, Grafana Tempo datasource; updated docs.
  - Started logging stack (Loki/Alloy/Tempo/Grafana) and backend with OTEL env; Grafana Tempo datasource provisioned.
  - Now:
  - Tempo ingest failing: Alloy exporter retries with `DoBatch: InstancesCount <= 0`; traces not visible yet.
  - Backend stopped after test run; curl POST /api/telemetry/client returned 200 while running.
  - Next:
  - Need official Tempo example config (Grafana repo) to replace current config and retry ingest.

Open questions (UNCONFIRMED if needed):
- UNCONFIRMED: Provide official Tempo `tempo.yaml` (Grafana repo) or raw URL to fetch.

Working set (files/ids/commands):
- CONTINUITY.md
- Cargo.toml
- Cargo.lock
- docker-compose.logging.yml
- logging/alloy-config.alloy
- logging/tempo-config.yml
- logging/grafana/provisioning/datasources/tempo.yaml
- src/telemetry/otel.rs
- src/telemetry/subscriber.rs
- src/telemetry/http.rs
- src/telemetry/mod.rs
- src/app/run.rs
- docs/architecture/LOGGING_DESIGN.md
- docs/architecture/adrs/009-logging-observability-system.md
- docs/CHANGELOG.md
- .agent/execplan-logging-phase-7-otel.md
- Commands: docker compose -f docker-compose.logging.yml up -d; restart alloy/tempo; cargo run with OTEL env; curl POST /api/telemetry/client
