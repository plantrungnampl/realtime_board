# Implement Phase 4 Frontend Logging SDK Integration

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan must be maintained in accordance with `./.agent/PLANS.md`.

## Purpose / Big Picture

After this change, the frontend will emit structured, batched client logs that correlate with backend traces and include WebSocket lifecycle events. The app will capture React render errors via an error boundary, propagate trace identifiers on API requests, and provide a small React hook to attach component context to logs. You can verify this by running the frontend and backend, triggering an error or WebSocket reconnect, and seeing `client_log` events in backend logs with `trace_id` and `board_id`.

## Progress

- [x] (2026-01-24 22:55Z) Read docs and logging design requirements; confirmed Phase 4 targets.
- [x] (2026-01-24 23:20Z) Implement trace context helpers and API client header propagation.
- [x] (2026-01-24 23:25Z) Extend ClientLogger with child contexts, retry buffering, and trace enrichment.
- [x] (2026-01-24 23:30Z) Add React hook + error boundary for client error logging.
- [x] (2026-01-24 23:40Z) Integrate WebSocket logging in board realtime hook; replace console calls.
- [x] (2026-01-24 23:45Z) Update docs (`docs/CHANGELOG.md`, `docs/architecture/LOGGING_DESIGN.md`, `docs/architecture/adrs/009-logging-observability-system.md`).

## Surprises & Discoveries

- None yet.

## Decision Log

- Decision: Use a lightweight in-house trace context helper rather than adding an OpenTelemetry browser SDK.
  Rationale: Avoid new dependencies and keep the logging pipeline consistent with existing backend `x-trace-id` handling.
  Date/Author: 2026-01-24 / Codex

## Outcomes & Retrospective

Completed Phase 4 frontend logging integration: trace headers propagate from the browser, client logs include trace context, WebSocket lifecycle events emit structured logs, and React render errors are captured by an error boundary. Remaining work is verification in runtime logs and optional expansion to more UI surfaces.

## Context and Orientation

The frontend entry point is `frontend/src/main.tsx`, which initializes `clientLogger` from `frontend/src/lib/logger/index.ts`. API requests are made via `frontend/src/shared/api/client.ts` using Axios. The backend already exposes `POST /api/telemetry/client` (`src/api/http/telemetry.rs`) for batched client logs, and the HTTP middleware in `src/telemetry/http.rs` handles `x-trace-id` headers. The realtime WebSocket client is implemented in `frontend/src/features/boards/boardRoute/hooks/useBoardRealtime.ts`.

Important terms used in this plan:

Trace identifier (trace ID): A unique string sent with requests so logs across frontend and backend can be correlated. In this repo, it is carried in the `x-trace-id` header and optionally the W3C `traceparent` header.

Error boundary: A React component that catches render errors and allows us to log them and show a safe fallback UI.

## Plan of Work

First, add a small trace context helper in `frontend/src/lib/logger/trace.ts` that can generate trace IDs and parse `traceparent` headers. Update `frontend/src/shared/api/client.ts` to attach `x-trace-id` and `traceparent` headers on every request and to record trace context from response headers.

Next, extend `frontend/src/lib/logger/index.ts` to enrich log events with the active trace context, add a child logger for component and module context, and add retry buffering on failed flushes to avoid dropping logs under transient network failures.

Then, add a React hook in `frontend/src/lib/logger/hooks.ts` to create a contextual logger for components, and introduce a small error boundary component that logs render errors before displaying a generic message. Wrap the app root in this error boundary from `frontend/src/main.tsx`.

Finally, add a WebSocket logger module under `frontend/src/features/boards/realtime/wsLogger.ts` and wire it into `frontend/src/features/boards/boardRoute/hooks/useBoardRealtime.ts` to log connection lifecycle events and remove direct `console.*` calls.

## Concrete Steps

Run these commands from the repository root unless stated otherwise:

1. Create `frontend/src/lib/logger/trace.ts` with trace ID generation and header helpers.
2. Update `frontend/src/shared/api/client.ts` to add trace headers and record response trace context.
3. Update `frontend/src/lib/logger/index.ts` to:
   - include `trace_id` and `span_id` from the active trace context
   - add child logger support and buffering retry
4. Add `frontend/src/lib/logger/hooks.ts` with `useLogger`.
5. Add `frontend/src/components/ClientErrorBoundary.tsx` and wrap `<RouterProvider>` in `frontend/src/main.tsx`.
6. Add `frontend/src/features/boards/realtime/wsLogger.ts` and update `frontend/src/features/boards/boardRoute/hooks/useBoardRealtime.ts` to use it.
7. Update docs files noted above.

Example command transcripts (expected to be similar):

  rg -n "ws error|ws close" frontend/src/features/boards/boardRoute/hooks/useBoardRealtime.ts
  # output: shows console.* lines to replace

## Validation and Acceptance

1. Start backend and frontend (example):
   - Backend: `cargo run`
   - Frontend: `cd frontend && bun run dev`
2. Open the app in a browser, connect to a board, and then disconnect/reconnect (toggle network or refresh).
3. Observe backend logs for `client_log` entries that include `board_id`, `trace_id`, and `source=frontend`.
4. Trigger a React render error (temporarily throw in a component or use a known error state) and confirm a `client_log` with level `error` is emitted and a generic fallback UI is shown.

Acceptance: Client logs are batched and ingested; WebSocket lifecycle events appear in logs; trace IDs are present on client logs and on API requests.

## Idempotence and Recovery

All steps are additive or replace existing logging calls. If a change causes issues, revert the modified files and re-run the app; no data migrations or destructive operations are required.

## Artifacts and Notes

Capture a short backend log snippet showing a `client_log` entry with `trace_id` and `board_id` after WebSocket connect.

## Interfaces and Dependencies

No new dependencies. Use existing Axios instance `frontend/src/shared/api/client.ts` and the `clientLogger` API in `frontend/src/lib/logger/index.ts`. New helper exports to introduce:

In `frontend/src/lib/logger/trace.ts`, define:

  export type TraceContext
  export function buildTraceHeaders(): { headers: Record<string, string>; traceContext: TraceContext }
  export function updateTraceContextFromHeaders(headers: Record<string, string | string[] | undefined>): TraceContext | null
  export function getActiveTraceContext(): TraceContext | null

In `frontend/src/lib/logger/index.ts`, define:

  export type Logger
  export const clientLogger: ClientLogger
  ClientLogger.child(context: Record<string, unknown>): Logger
