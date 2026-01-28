# Documentation Changelog

## Version 3.45 - 2026-01-28

### 🛠️ Invites

#### ✅ Invite Token Hashing + Backfill

- Store pre-signup invite tokens as SHA-256 hashes (`invite_token_hash`) and make `invite_token` nullable (deprecated).
- Added migration + backfill utility to hash existing invite tokens.

## Version 3.44 - 2026-01-28

### 🛠️ Invites

#### ✅ Invite Rate Limiting

- Added invite-only rate limiter keyed by authenticated user with IP fallback.
- Applied limiter to org member invites, invite resends, and board invites.
- Documented `INVITE_RATE_LIMIT_PER_SECOND` (default 1) and `INVITE_RATE_LIMIT_BURST` (default 5).

## Version 3.43 - 2026-01-28

### 🛠️ Invites

#### ✅ Shared Invite Email Validation

- Consolidated invite email validation helpers into a shared usecase module.
- Enforced invite batch size cap with default limit (25) and per-call override for tests.
- Added unit tests for normalization, duplicates, invalid emails, empty input, and batch limits.

## Version 3.42 - 2026-01-28

### 🛠️ Fixes

#### ✅ Rate Limiter Build Compatibility

- Fixed `tower_governor` import path and layer construction for v0.6.0
- Updated rate limiter config builder usage to match current API
- Added explicit `governor` (0.8.x) dependency for middleware type references

## Version 3.41 - 2026-01-26

### 🛠️ Fixes

#### ✅ Element Persist Deduping + Stable Lock Set

- Skip redundant element PATCH requests when the element snapshot is unchanged
- Stabilize locked element ID sets to avoid rerunning load-time routing on presence heartbeats

## Version 3.40 - 2026-01-26

### 🛠️ Fixes

#### ✅ Realtime Metrics Type Scope

- Moved WsMetrics type to module scope to fix TS name resolution

## Version 3.39 - 2026-01-26

### 📊 Observability

#### ✅ Realtime WS Metrics Sampling

- Added optional WebSocket inbound/outbound counters gated by `RTC_DEBUG_REALTIME`

## Version 3.38 - 2026-01-26

### ⚡ Performance

#### ✅ Routing Cache Hash Normalization

- Normalize obstacle hashes to improve graph cache hits across obstacle ordering

## Version 3.37 - 2026-01-26

### ⚡ Performance

#### ✅ Routing Time Budget Sampling

- Check routing time budget every 64 iterations to reduce per-iteration overhead

## Version 3.36 - 2026-01-26

### ⚡ Performance

#### ✅ Routing Edge Obstacle Prefilter

- Prefilter obstacles per row/column when building the routing graph to reduce segment checks

## Version 3.35 - 2026-01-26

### ⚡ Performance

#### ✅ Connector Routing Lock Check Cleanup

- Removed duplicate lock-route obstacle check to avoid repeated obstacle builds

## Version 3.34 - 2026-01-26

### ⚡ Performance

#### ✅ Routing Budget Telemetry + Short-Range Margin

- Optional debug logging for routing budget bailouts via `RTC_DEBUG_ROUTING`
- Use smaller routing margin for short connector distances

## Version 3.33 - 2026-01-26

### ⚡ Performance

#### ✅ Connector Routing Budgets

- Added node/iteration/time budgets to orthogonal router to avoid worst-case stalls

## Version 3.32 - 2026-01-26

### ⚡ Performance

#### ✅ Projection Prefilter

- Skip projection param building when version/updated_at/deleted_at match defaults

## Version 3.31 - 2026-01-26

### ⚡ Performance

#### ✅ Chunked Snapshot Replay

- Load CRDT updates in chunks during board state hydration to reduce memory spikes

## Version 3.30 - 2026-01-26

### ⚡ Performance

#### ✅ WebSocket Logging Throttle

- Downgraded WS message logs to debug with sampling via `WS_MESSAGE_LOG_SAMPLE_RATE`

## Version 3.29 - 2026-01-26

### ⚡ Performance

#### ✅ DB Pool Tuning

- Made database pool size and acquire timeout configurable via env

## Version 3.28 - 2026-01-26

### ⚡ Performance

#### ✅ Batch Projection Upserts

- Batch upsert projected elements to reduce query count and lock time

## Version 3.27 - 2026-01-26

### 📊 Observability

#### ✅ Snapshot/Projection Metrics Logs

- Added per-tick debug metrics for projection and snapshot maintenance

## Version 3.26 - 2026-01-26

### ⚡ Performance

#### ✅ Snapshot Maintenance Gating

- Skip snapshot work for rooms without pending updates
- Process snapshot/log flush with bounded concurrency

## Version 3.25 - 2026-01-26

### ⚡ Performance

#### ✅ Projection Dirty Tracking

- Skip CRDT projection when no WebSocket updates have changed a room
- Track per-room projection sequence to avoid full materialization every tick

## Version 3.24 - 2026-01-26

### 🛠️ Tooling

#### ✅ Lint Warning Cleanup

- Adjusted hook dependencies and effect cleanup for lint compliance

## Version 3.23 - 2026-01-26

### 🛠️ Tooling

#### ✅ Build Compatibility Fixes

- Updated Yjs observer typing for deep map events
- Normalized Axios headers handling to satisfy strict typings
- Removed unused logger timer field

## Version 3.22 - 2026-01-26

### ⚡ Performance

#### ✅ Coalesced Pointer Updates

- Batched pointer move + drag updates via requestAnimationFrame to reduce update rate

## Version 3.21 - 2026-01-26

### ⚡ Performance

#### ✅ Selection/Transform Overlay Layer

- Moved selection outlines and transform handles into a dedicated memoized layer

## Version 3.20 - 2026-01-26

### ⚡ Performance

#### ✅ Static Background/Grid Layer

- Memoized background + grid rendering to avoid redraws on cursor/selection updates

## Version 3.19 - 2026-01-26

### 🛠️ Tooling

#### ✅ Worker Typings Fix

- Added web worker lib reference for connector routing worker typing

## Version 3.18 - 2026-01-26

### ⚡ Performance

#### ✅ Cursor Render Isolation

- Split cursor markers into a dedicated layer to avoid re-rendering elements on cursor-only updates
- Stabilized drag presence data passed to PixiScene to reduce unnecessary render churn

## Version 3.17 - 2026-01-26

### ⚡ Performance

#### ✅ Incremental Yjs Element Updates

- Avoided full element rematerialize + z-index sort on every CRDT update
- Applied incremental element map/list updates based on Yjs change events

## Version 3.16 - 2026-01-25

### 🔗 Connectors

#### ✅ Worker Routing Coverage

- Extended Web Worker routing to quick-create, commit, and initial routing passes
- Prevented main-thread stalls during non-live connector updates

## Version 3.15 - 2026-01-25

### 🔗 Connectors

#### ✅ Obstacle Spatial Index

- Added quadtree-based spatial index to reduce obstacle scans during routing
- Filtered obstacle candidates per connector using route search bounds
- Reused spatial index for live, commit, and initial routing passes

## Version 3.14 - 2026-01-25

### 🔗 Connectors

#### ✅ Web Worker Routing

- Offloaded connector routing pathfinding to a Web Worker during live updates
- Added worker module and routing helper to avoid main-thread stalls

## Version 3.13 - 2026-01-25

### 🔗 Connectors

#### ✅ Straight Routing Obstacle Avoidance

- Straight connectors now fall back to obstacle-avoiding paths when blocked
- Preserved straight-line rendering when no obstacles intersect
- Avoided straight paths cutting through bound elements by using full bounds for the intersection check

## Version 3.12 - 2026-01-25

### 🔗 Connectors

#### ✅ Adaptive Routing Window

- Expanded routing search margin when initial path intersects obstacles
- Reused best path if no clear route is found within the max margin

## Version 3.11 - 2026-01-25

### 🔗 Connectors

#### ✅ Anchor Cache Cleanup

- Pruned connector auto-anchor cache when connectors are removed

## Version 3.10 - 2026-01-25

### 🔗 Connectors

#### ✅ Straight Routing Support

- Preserved straight connector mode without forced orthogonal routing
- Rendered straight connector points without orthogonal normalization

## Version 3.09 - 2026-01-25

### 🎨 UI

#### ✅ Transparent Shape Dragging

- Always fill shapes with alpha 0 to preserve hit testing when fill is transparent

## Version 3.08 - 2026-01-25

### 🎨 UI

#### ✅ Transparent Fill Rendering

- Treated `transparent` fill as alpha 0 in canvas rendering
- Prevented accidental blue fill from hex parsing of "transparent"

## Version 3.07 - 2026-01-25

### 🎨 UI

#### ✅ Default Shape Fill Behavior

- Prevented quick-create shapes from inheriting fill color
- Kept default shape fill transparent unless explicitly chosen

## Version 3.06 - 2026-01-25

### 🧩 Realtime

#### ✅ Client Element Dimension Clamping

- Normalized element width/height to >= 1 in realtime updates
- Preserved rect element positioning when dragging in negative directions

## Version 3.05 - 2026-01-25

### 🧩 Realtime

#### ✅ Projection Log Noise Reduction

- Downgraded dimension-normalization warnings for connector/drawing elements
- Included element type in projection normalization logs

## Version 3.04 - 2026-01-25

### 🧩 Realtime

#### ✅ Presence Status Enum Fix

- Added migration to ensure `collab.presence_status` includes `away`

## Version 3.03 - 2026-01-25

### 🧩 Realtime

#### ✅ Element Write Serialization

- Added DB-level trigger to acquire per-board advisory lock on element writes
- Prevents cross-instance deadlocks when projections/upserts overlap

## Version 3.02 - 2026-01-25

### 🧩 Realtime

#### ✅ CRDT Projection Contention Reduction

- Added projection no-op skip when version/updated_at/deleted_at are unchanged
- Centralized per-board element advisory lock helper and reused for template cloning

## Version 3.01 - 2026-01-25

### 🧩 Realtime

#### ✅ CRDT Projection Deadlock Mitigation

- Serialized per-board projections with advisory locks
- Applied stable element ordering to reduce lock contention
- Added deadlock retry with bounded backoff for projections

## Version 3.00 - 2026-01-25

### 🧭 Observability

#### ✅ SQLx Offline Build Fix

- Regenerated SQLx offline query cache for realtime repository queries
- Tightened query logging helpers to avoid type inference errors in macros

## Version 2.99 - 2026-01-24

### 🧭 Observability

#### ✅ Phase 4: Frontend Logging Integration

- Added trace header propagation (`x-trace-id`, `traceparent`) from the frontend API client
- Added React error boundary logging + component logger hook
- Added WebSocket client lifecycle logging integration

## Version 2.98 - 2026-01-24

### 🧭 Observability

#### ✅ Phase 7: Distributed Tracing

- Added OpenTelemetry tracing layer with W3C traceparent propagation
- Added Grafana Tempo backend and Alloy OTLP receiver/exporter
- Provisioned Tempo datasource in Grafana
- Pinned Tempo image to 2.9.0 and aligned config with official TNS example (multi receivers + local storage)

## Version 2.97 - 2026-01-24

### 🧭 Observability

#### ✅ Phase 5: Alerts + Dashboards

- Added Loki alert rules and ruler configuration
- Provisioned alert rules into logging stack via Loki config
- Expanded Grafana log dashboard with auth, DB, and WS panels

## Version 2.96 - 2026-01-24

### 🧭 Observability

#### ✅ Logging Hardening

- Emitted business events only after successful DB commits
- Redacted email addresses in business-event payloads
- Added row counts to DB query logs where available

## Version 2.95 - 2026-01-24

### 🧭 Observability

#### ✅ Phase 3: Database + Business Events

- Added db query logging wrapper + `log_query!` macro across repositories
- Added business event logging for auth/org/board/CRDT milestones
- Logged CRDT snapshot + projection completion as business events

## Version 2.94 - 2026-01-24

### 🧭 Observability

#### ✅ WebSocket Lifecycle Logging

- Added structured WebSocket connect/disconnect/message logging
- Propagated request_id/trace_id into WebSocket log spans
- Documented Phase 2 WebSocket logging status in design + ADR

## Version 2.93 - 2026-01-23

### 🧭 Observability

#### ✅ Frontend API Base URL

- Frontend API client now reads `VITE_API_URL`
- Deployment guide updated for Docker backend port 3002

## Version 2.92 - 2026-01-23

### 🧭 Observability

#### ✅ Frontend Logging Pipeline

- Added client log ingestion endpoint and frontend logger SDK
- Updated logging design docs to use /api/telemetry/client
- Documented client telemetry endpoint in API docs

## Version 2.91 - 2026-01-23

### 🧭 Observability

#### ✅ HTTP Status Breakdown Panels

- Added 2xx/4xx/5xx request rate panels to Grafana dashboard

## Version 2.90 - 2026-01-23

### 🧭 Observability

#### ✅ Grafana Empty-Series Handling

- Show zero for 5xx panels when no errors occur

## Version 2.89 - 2026-01-23

### 🧭 Observability

#### ✅ Grafana LogQL Fix

- Extract nested JSON fields for 5xx rate and latency panels

## Version 2.88 - 2026-01-23

### 🧭 Observability

#### ✅ Container Startup Hardening

- Make `.env` optional and surface startup errors cleanly

## Version 2.87 - 2026-01-23

### 🧭 Observability

#### ✅ Docker Compose Port Mapping

- Mapped backend to host port 3002 to avoid local 3000 conflicts

## Version 2.86 - 2026-01-23

### 🧭 Observability

#### ✅ Docker Builder Compatibility

- Updated Rust builder image to 1.88 to satisfy crate MSRV

## Version 2.85 - 2026-01-23

### 🧭 Observability

#### ✅ Docker Builder Update

- Updated Rust builder image to support edition 2024

## Version 2.84 - 2026-01-23

### 🧭 Observability

#### ✅ Docker Build Hygiene

- Added `.dockerignore` to keep backend build context small

## Version 2.83 - 2026-01-23

### 🧭 Observability

#### ✅ Docker Runtime Fix

- Aligned backend builder image to Debian bookworm to avoid GLIBC mismatch

## Version 2.82 - 2026-01-23

### 🧭 Observability

#### ✅ Grafana Provisioning Fix

- Switched dashboard datasource reference to name-based lookup
- Removed explicit Loki datasource UID to avoid provisioning failure

## Version 2.81 - 2026-01-23

### 🧭 Observability

#### ✅ Grafana Loki Datasource Plugin

- Preinstalled `grafana-loki-datasource` to fix provisioning failures

## Version 2.80 - 2026-01-23

### 🧭 Observability

#### ✅ Grafana Dashboard

- Added provisioned Grafana dashboard for request rate, errors, and latency
- Added dashboard provider configuration for auto-load

## Version 2.79 - 2026-01-23

### 🧭 Observability

#### ✅ Alloy Backend Filter

- Filtered Alloy scrape targets to `realtime_board_backend` container
- Added `service_name` label from Docker container metadata

## Version 2.78 - 2026-01-23

### 🧭 Observability

#### ✅ Docker Backend for Logging

- Added backend Dockerfile and compose service for self-hosted logging
- Added SQLx offline metadata (`.sqlx`) for release container builds
- Documented `DATABASE_URL_DOCKER` usage for containerized backend

## Version 2.77 - 2026-01-23

### 🧭 Observability

#### ✅ Self-hosted Logging Stack

- Added Loki + Grafana Alloy + Grafana docker-compose setup
- Added Loki/Alloy config files and Grafana datasource provisioning
- Updated docs to reflect Alloy collector and LogQL examples

## Version 2.76 - 2026-01-23

### 🧭 Observability

#### ✅ Backend Logging Foundation

- Added telemetry module with env-based subscriber (pretty/json)
- Added HTTP request logging with request_id/trace_id response headers
- Logged server start via tracing

## Version 2.75 - 2026-01-23

### ⚡ Performance

#### ✅ Parallel Access Checks

- Fetch board membership and org membership in parallel during access resolution

## Version 2.74 - 2026-01-23

### ⚡ Performance

#### ✅ Board Access Write Throttle

- Skip last_accessed_at updates when the user reopens a board within 1 minute

## Version 2.73 - 2026-01-23

### 🧪 Tests

#### ✅ Vitest Runner

- Added Vitest config and a basic routing unit test
- Updated frontend test script to run `vitest run`
- Added obstacle-avoidance coverage for orthogonal routing

## Version 2.72 - 2026-01-23

### 🧪 Tests

#### ✅ Frontend Test Script

- Added a frontend `test` script that reports when no tests are configured

## Version 2.71 - 2026-01-23

### 🛠️ Fixes

#### ✅ React Compiler Lint Alignment

- Added missing memoization dependencies for Pixi canvas pointer handlers

## Version 2.70 - 2026-01-23

### ⚡ Performance

#### ✅ Orthogonal Routing Search Optimization

- Avoid per-iteration sorting in A* open list by scanning for the best node
- Track open-set membership with a Set to skip O(n) duplicate scans

## Version 2.69 - 2026-01-22

### 🛠️ Fixes

#### ✅ PixiJS Runtime Stabilization

- Replaced transformer plugin with native PixiJS resize/rotate handles
- Hardened color parsing to avoid invalid fill/line colors in Pixi renderer
- Removed incompatible @pixi-essentials/transformer dependency
- Fixed wheel listener to use non-passive handler for zoom/pan preventDefault
- Updated Pixi Graphics API calls to v8 names (circle/rect/roundRect, fill/stroke) to remove deprecation warnings

## Version 2.68 - 2026-01-22

### 🛠️ Fixes

#### ✅ PixiJS Build Cleanup

- Updated Pixi line style calls and pointer event typings for TypeScript builds
- Hardened connector binding typing and bindable hit-test selection logic

## Version 2.67 - 2026-01-22

### 🎯 Major Updates

#### ✅ PixiJS Canvas Migration

- Replaced Konva rendering with PixiJS + @pixi/react for the board canvas
- Updated interactions and transform handling to use PixiJS events/transformer

## Version 2.66 - 2026-01-22

### 🎯 Major Updates

#### ✅ Middle Mouse Panning

- Pan the canvas by dragging with the middle mouse button in Select tool
- Prevent panning from interfering with selection or drawing

## Version 2.65 - 2026-01-22

### 🎯 Major Updates

#### ✅ Connector Anchor Gap Tuning

- Reduce anchor gap by scaling stroke offsets for tighter attachment
- Keep a small minimum gap to avoid border overlap

## Version 2.64 - 2026-01-22

### 🎯 Major Updates

#### ✅ Connector Live Follow Fix

- Route bound connectors based on element movement during drag
- Prevent live routing throttle from freezing connector updates

## Version 2.63 - 2026-01-22

### 🎯 Major Updates

#### ✅ Live Connector Smoothing

- Smooth connector point updates during drag to reduce jitter
- Lock auto-anchors during drag to prevent flicker

#### ✅ Connector Drag Stability

- Throttle live connector reroutes by minimum movement distance
- Keep obstacle avoidance enabled during drag
- Reduced live routing frequency and increased smoothing to cut jitter

#### ✅ Connector Binding Fix

- Treat circle interior as bindable so connectors attach reliably

#### ✅ Rounded Connector Corners

- Render orthogonal connector corners with rounded bends for smoother visuals

#### ✅ Connector Dimension Guard

- Initialize connector dimensions to minimum size to avoid backend normalization warnings

## Version 2.62 - 2026-01-22

### 🎯 Major Updates

#### ✅ Smooth Live Connector Preview

- Use obstacle-free routing during drag for smoother connector movement
- Keep full obstacle-aware routing on commit

## Version 2.61 - 2026-01-22

### 🎯 Major Updates

#### ✅ Connector Proximity Binding

- Bind connector endpoints by proximity on create/load to avoid detached segments
- Lock initial anchor side to prevent flicker on diagonal movement

## Version 2.60 - 2026-01-22

### 🎯 Major Updates

#### ✅ Connector Load Re-route Trigger

- Re-run connector routing once when elements hydrate after refresh

## Version 2.59 - 2026-01-22

### 🎯 Major Updates

#### ✅ Connector Rebind On Load

- Re-route and auto-bind connectors on load to prevent detached segments after refresh

## Version 2.58 - 2026-01-22

### 🎯 Major Updates

#### ✅ Connector Auto-Bind On Create

- Auto-bind connector endpoints to shapes on creation for stable anchors

## Version 2.57 - 2026-01-22

### 🎯 Major Updates

#### ✅ Connector Stroke Fallback

- Applied connector stroke width fallback when computing anchor offsets

## Version 2.56 - 2026-01-22

### 🎯 Major Updates

#### ✅ Connector Stroke Alignment

- Offset connector anchors by connector stroke width to avoid “stabbing” into shapes

## Version 2.55 - 2026-01-22

### 🎯 Major Updates

#### ✅ Connector Anchor Tuning

- Reduced anchor gap to remove visible connector “air gap”
- Added ratio-based side switching to prevent diagonal flicker

## Version 2.54 - 2026-01-22

### 🎯 Major Updates

#### ✅ Bound-Element Obstacle Padding

- Included bound elements in obstacle routing with reduced padding to keep paths off borders

## Version 2.53 - 2026-01-22

### 🎯 Major Updates

#### ✅ Connector Stub + Stronger Hysteresis

- Added small connector stub segments to keep lines off shape borders
- Increased auto-anchor hysteresis for steadier side selection

## Version 2.52 - 2026-01-22

### 🎯 Major Updates

#### ✅ Connector Anchor Stability

- Added anchor gap so connector lines don't rub against shape borders
- Strengthened auto-anchor hysteresis to stop side flicker while dragging

## Version 2.51 - 2026-01-22

### 🎯 Major Updates

#### ✅ Smoother Connector Routing

- Increased connector routing refresh rate to improve drag smoothness
- Added anchor hysteresis to reduce connector endpoint side flipping

## Version 2.50 - 2026-01-21

### 🎯 Major Updates

#### ✅ Snapshot On Load

- Auto-create snapshots on load when update logs are large to prevent slow board loads

## Version 2.49 - 2026-01-21

### 🎯 Major Updates

#### ✅ Update Replay Diagnostics

- Logged per-update replay with optional RTC_SKIP_UPDATE_SEQ to bypass a stuck update

## Version 2.48 - 2026-01-21

### 🎯 Major Updates

#### ✅ Realtime Load Instrumentation

- Added detailed logging around update replay and hydration to pinpoint hangs

## Version 2.47 - 2026-01-21

### 🎯 Major Updates

#### ✅ Realtime Hydration Timeout

- Added timeout and start log around hydration DB query to prevent boards hanging on load

## Version 2.46 - 2026-01-21

### 🎯 Major Updates

#### ✅ Realtime Load Logging

- Added backend logging around board state load/hydration to diagnose hanging boards

## Version 2.45 - 2026-01-21

### 🎯 Major Updates

#### ✅ Canvas Debug Logging

- Added dev-only logging for invalid canvas elements to trace blank-screen issues

## Version 2.44 - 2026-01-21

### 🎯 Major Updates

#### ✅ Canvas Render Guards

- Added defensive validation for drawing points and element positions to prevent Konva crashes on corrupted data

## Version 2.43 - 2026-01-21

### 🎯 Major Updates

#### ✅ Connector Render Guard

- Added defensive validation for connector points/endpoints to avoid runtime crashes on corrupted board data

## Version 2.42 - 2026-01-21

### 🎯 Major Updates

#### ✅ Realtime Init Loop Fix

- Stabilized realtime initialization by decoupling role update callbacks from reconnect effect dependencies

## Version 2.41 - 2026-01-21

### 🎯 Major Updates

#### ✅ Realtime Stability

- Added reconnect throttling/limits and guarded initial sync updates to prevent WS storming on failures

## Version 2.40 - 2026-01-21

### 🎯 Major Updates

#### ✅ Lint Cleanup

- Resolved lint warnings in board canvas hooks, toast/quick-create hooks, and board element mutations

## Version 2.39 - 2026-01-21

### 🎯 Major Updates

#### ✅ Frontend Bundle Splitting

- Added manualChunks vendor splitting and lazy-loaded devtools to reduce production bundle size

## Version 2.38 - 2026-01-21

### 🎯 Major Updates

#### ✅ Build & Typing Fixes

- Resolved TypeScript errors after canvas refactor and aligned dashboard usage messaging

## Version 2.37 - 2026-01-21

### 🎯 Major Updates

#### ✅ Board Canvas Deep Split

- Extracted canvas zoom, hit-testing, and transform handlers into dedicated boardCanvas hooks

## Version 2.36 - 2026-01-21

### 🎯 Major Updates

#### ✅ Board Canvas Hooks Refactor

- Split boardCanvas.hooks.ts helpers into dedicated boardCanvas modules (element utils, connector routing, viewport hook)

## Version 2.35 - 2026-01-21

### 🎯 Major Updates

#### ✅ Board Route Hook Split

- Extracted access/role handling, restore flows, public toast, and connector routing into boardRoute hooks

## Version 2.34 - 2026-01-21

### 🎯 Major Updates

#### ✅ Board Route UI Hooks

- Extracted selection-derived UI state and presence/sync display helpers into boardRoute hooks

## Version 2.33 - 2026-01-21

### 🎯 Major Updates

#### ✅ Board Route Further Split

- Extracted quick-create logic and delete/undo handling into dedicated boardRoute hooks

## Version 2.32 - 2026-01-21

### 🎯 Major Updates

#### ✅ Board Route Helpers Split

- Moved board status screen selection, hotkeys handler, and error helpers into boardRoute modules

## Version 2.31 - 2026-01-21

### 🎯 Major Updates

#### ✅ Board Route Refactor

- Split board.$boardId route UI into smaller components for maintainability

## Version 2.30 - 2026-01-21

### 🎯 Major Updates

#### ✅ Quick-Create Ghost Preview

- Added ghost/phantom preview for quick-create that mirrors shape type and color
- Smartly offsets ghost placement to avoid overlaps, hiding preview when blocked

## Version 2.29 - 2026-01-21

### 🎯 Major Updates

#### ✅ Connector Anchor Alignment

- Offset connector anchors by half stroke width to avoid overlapping shape borders
- Restored auto-side resolution across all four sides based on dominant axis for better alignment

## Version 2.28 - 2026-01-21

### 🎯 Major Updates

#### ✅ Connector Anchor Contact

- Removed connector anchor gap so bound connectors touch shape edges (including quick-create and existing connectors)

## Version 2.27 - 2026-01-21

### 🎯 Major Updates

#### ✅ Connector Orthogonal Cleanup

- Offset connector anchors away from shapes and excluded bound elements from obstacles
- Normalized connector rendering to keep orthogonal segments without hugging shape edges

## Version 2.24 - 2026-01-21

### 🎯 Major Updates

#### ✅ Connector Visual Fallback

- Rendered fallback orthogonal points for connectors without routed points to avoid diagonal lines

## Version 2.23 - 2026-01-21

### 🎯 Major Updates

#### ✅ Connector Orthogonal Consistency

- Dynamic anchors now stay on left/right (no auto top/bottom switching)
- Orthogonal routing fallback no longer returns diagonal lines

## Version 2.22 - 2026-01-21

### 🎯 Major Updates

#### ✅ Connector Aesthetics

- Forced orthogonal routing for connectors missing points or set to straight
- Routed new connector tool draws to orthogonal paths on mouse-up

## Version 2.21 - 2026-01-21

### 🎯 Major Updates

#### ✅ UX Cleanup: Guides & Connectors

- Disabled smart guide alignment snapping and guide lines
- Coerced connectors to orthogonal routing to avoid diagonal straight-line visuals

## Version 2.20 - 2026-01-21

### 🎯 Major Updates

#### ✅ Dynamic Anchors + Spawn Animation

- Added dynamic connector anchors (auto side selection) for bound connectors
- Added spawn animation for newly created elements to smooth the creation UX

## Version 2.19 - 2026-01-20

### 🎯 Major Updates

#### ✅ Routing Live Update Fix

- Fixed hook initialization order causing connector routing updates to crash the board

## Version 2.18 - 2026-01-20

### 🎯 Major Updates

#### ✅ Quick Diagramming + Orthogonal Routing

- Added orthogonal connector routing with obstacle avoidance and live updates
- Added per-connector routing toggle (straight vs orthogonal)
- Quick-create connectors now default to orthogonal routing with bindings

## Version 2.17 - 2026-01-20

### 🎯 Major Updates

#### ✅ Selection Overlay Alignment

- Aligned floating selection toolbar and quick-create handles to local render overrides for accurate positioning during transforms

## Version 2.16 - 2026-01-20

### 🎯 Major Updates

#### ✅ Interaction & UX Enhancements

- Strengthened smart guide snapping and colored alignment guides for visibility
- Added floating selection toolbar for quick fill/stroke edits
- Added quick-create (+) handles to spawn connected shapes

## Version 2.15 - 2026-01-20

### 🎯 Major Updates

#### ✅ Dashboard Filters & Sorting

- Enabled All boards/Recent/Starred dropdown, owner filter, and sort options in the board list toolbar

## Version 2.14 - 2026-01-20

### 🎯 Major Updates

#### ✅ CRDT Projection Dimension Guard

- Normalized non-positive element width/height during projection to satisfy DB constraints

## Version 2.13 - 2026-01-20

### 🎯 Major Updates

#### ✅ Dashboard Recent & Starred Boards

- Added favorite toggling endpoint and documented response fields for `is_favorite` and `last_accessed_at`
- Implemented Recent/Starred filtering in the dashboard UI and updated docs accordingly

## Version 2.12 - 2026-01-20

### 🎯 Major Updates

#### ✅ Rotation Normalization (Frontend)

- Normalized element rotations before persisting to avoid 422 validation errors

## Version 2.11 - 2026-01-20

### 🎯 Major Updates

#### ✅ CRDT Projection Rotation Guard

- Normalized rotation during projection to prevent invalid values violating DB constraints

## Version 2.10 - 2026-01-20

### 🎯 Major Updates

#### ✅ Presence Awareness

- Ensured awareness initializes with the current user profile to avoid Anonymous cursors after reconnects

## Version 2.09 - 2026-01-20

### 🎯 Major Updates

#### ✅ Resize Element (FR-ELM-05) Improvements

- Added Shift keep-ratio and Alt centered resize behavior on the transformer
- Scaled text elements by updating font size during resize
- Enforced consistent minimum resize bounds in the canvas transformer

## Version 2.08 - 2026-01-20

### 🎯 Major Updates

#### ✅ CRDT Conflict Resolution Fixes

- Prevented element updates from reviving deleted CRDT entries
- Preserved immutable projection fields (created_by/created_at) from DB defaults when available
- Avoided re-sending server-sourced element patches back over WebSocket

## Version 2.07 - 2026-01-19

### 🎯 Major Updates

#### ✅ CRDT Element Map Initialization (Frontend)

- Attach element Yjs maps to the document before applying patches to avoid premature-access warnings

## Version 2.06 - 2026-01-19

### 🎯 Major Updates

#### ✅ CRDT Projection Guardrails (Backend)

- Allowed CRDT projection to bypass optimistic-lock triggers via session flag
- Backfilled missing projection fields from existing DB rows when available
- Added fallback to board owner timestamps/creator when CRDT fields are missing

## Version 2.05 - 2026-01-19

### 🎯 Major Updates

#### ✅ CRDT Conflict Resolution (Frontend)

- Stored board elements as field-level Yjs maps with nested maps/text for properties
- Observed deep map changes and filtered deleted elements via `deleted_at`
- Removed manual conflict resolution paths from element mutations

## Version 2.04 - 2026-01-19

### 🎯 Major Updates

#### ✅ CRDT Conflict Resolution (Backend)

- Switched element updates to field-level CRDT maps with CRDT-authoritative mutations
- Added CRDT → DB projection worker and immediate projection for offline updates
- Removed optimistic-lock conflict payloads from element mutations (CRDT merge authoritative)

## Version 2.03 - 2026-01-19

### 🎯 Major Updates

#### ✅ Board Realtime Offline Sync (Frontend)

- Persisted Yjs board updates locally via IndexedDB to keep offline edits across reloads
- Added board header sync status indicator for connecting/syncing/offline states

## Version 2.02 - 2026-01-19

### 🎯 Major Updates

#### ✅ React Ref Typing Cleanup (Frontend)

- Replaced deprecated `React.ElementRef` usage with `React.ComponentRef` in shared UI components

## Version 2.01 - 2026-01-19

### 🎯 Major Updates

#### ✅ Board Page Background Hook (Frontend)

- Allowed nullable element refs in usePageBackgroundColor to match DOM ref usage

## Version 2.00 - 2026-01-19

### 🎯 Major Updates

#### ✅ Board Canvas Stage Typing (Frontend)

- Allowed nullable stage refs in BoardCanvasStage props to match hook refs

## Version 1.99 - 2026-01-19

### 🎯 Major Updates

#### ✅ Board Text Editor Typing (Frontend)

- Allowed nullable textarea refs in overlay props to match hook usage

## Version 1.98 - 2026-01-19

### 🎯 Major Updates

#### ✅ Organization Member Mutations (Frontend)

- Aligned member mutation action runner typing with API return payloads

## Version 1.97 - 2026-01-19

### 🎯 Major Updates

#### ✅ Realtime Protocol Typing (Frontend)

- Returned explicit nulls from WebSocket handler to satisfy RoleUpdateEvent typing

## Version 1.96 - 2026-01-19

### 🎯 Major Updates

#### ✅ Board Canvas Typing (Frontend)

- Guarded drawing bounds helper to keep BoardElement property access narrowed

## Version 1.95 - 2026-01-19

### 🎯 Major Updates

#### ✅ Board Realtime Patching (Frontend)

- Preserved BoardElement discriminated unions when applying remote patches

## Version 1.94 - 2026-01-19

### 🎯 Major Updates

#### ✅ Board Canvas Hooks (Frontend)

- Preserved BoardElement union typing when cloning during transform updates

## Version 1.93 - 2026-01-19

### 🎯 Major Updates

#### ✅ Board Element Mutations (Frontend)

- Added typed element cloning helper to preserve discriminated unions

## Version 1.92 - 2026-01-19

### 🎯 Major Updates

#### ✅ Board Element Factories (Frontend)

- Fixed media element factory overloads to satisfy discriminated unions

## Version 1.91 - 2026-01-19

### 🎯 Major Updates

#### ✅ Board Element Factories (Frontend)

- Fixed media element factory typings to return discriminated element types

## Version 1.90 - 2026-01-19

### 🎯 Major Updates

#### ✅ Board Route Module Split (Frontend)

- Split board route logic into focused modules (tools, elements, presence, hooks)
- Added shared board route types and pointer utility helper

## Version 1.89 - 2026-01-19

### 🎯 Major Updates

#### ✅ Board Route Logic Refactor (Frontend)

- Simplified presence parsing helpers and shared timer/RAF cleanup
- Tightened realtime reset cleanup for cursor/drag state

## Version 1.88 - 2026-01-18

### 🎯 Major Updates

#### ✅ Frontend Lint Cleanup

- Switched board metadata and invite validation to React Query-backed state
- Removed effect-driven canvas resets and corrected hook ordering
- Tightened hook dependencies and unused dependency warnings

## Version 1.87 - 2026-01-18

### 🎯 Major Updates

#### ✅ Board Realtime Awareness Refactor (Frontend)

- Centralized awareness state updates to reduce duplicate timestamp work

## Version 1.86 - 2026-01-18

### 🎯 Major Updates

#### ✅ Board Canvas Hooks Refactor (Frontend)

- Reused memoized selection sets and shared snapping logic to cut per-drag allocations

## Version 1.85 - 2026-01-18

### 🎯 Major Updates

#### ✅ Board Canvas Refactor (Frontend)

- Extracted memoized element rendering and selection overlays for better canvas performance

## Version 1.84 - 2026-01-18

### 🎯 Major Updates

#### ✅ Board Route Refactor (Frontend)

- Extracted board status gating, hotkey handling, and undo toast for clearer board route logic

## Version 1.83 - 2026-01-18

### 🎯 Major Updates

#### ✅ Board UI Accessibility (Frontend)

- Added aria-labels and focus-visible rings for board header + toolbar icon buttons

## Version 1.82 - 2026-01-18

### 🎯 Major Updates

#### ✅ Presence Cleanup (Backend)

- Sweep stale sessions after heartbeat timeout and broadcast `user:left`

## Version 1.81 - 2026-01-18

### 🎯 Major Updates

#### ✅ Presence Cleanup (Frontend)

- Close board WebSocket even when still connecting to prevent stale presence after leaving

## Version 1.80 - 2026-01-18

### 🎯 Major Updates

#### ✅ Element Selection Sync (Frontend)

- Broadcast selection + edit-lock presence via Yjs awareness updates
- Render remote selection overlays and guard edits against locked elements

## Version 1.79 - 2026-01-18

### 🎯 Major Updates

#### ✅ Element Selection Sync (Design)

- Added FR-RTC-03 design based on Yjs awareness selection/locks
- Marked legacy selection/cursor events as deprecated in realtime specs

## Version 1.78 - 2026-01-18

### 🎯 Major Updates

#### ✅ Live Cursors (Frontend)

- Enforced 5s cursor idle timeout using cursor-specific timestamps
- Added cursor smoothing via Konva tweening to reduce jitter

## Version 1.77 - 2026-01-18

### 🎯 Major Updates

#### ✅ Audit Logging (Backend)

- Set `app.current_user_id` for element mutations so audit history records the correct actor

## Version 1.76 - 2026-01-18

### 🎯 Major Updates

#### ✅ Audit Logging (Database)

- Guarded `audit.save_element_history()` against empty UUID settings to prevent 22P02 errors

## Version 1.75 - 2026-01-18

### 🎯 Major Updates

#### ✅ Presence Awareness (Backend)

- Emit `user:left` only when no active sessions remain for the user to avoid false removals
- Added unit tests for the user-left emission guard

## Version 1.74 - 2026-01-18

### 🎯 Major Updates

#### ✅ Presence Awareness (Backend + Frontend)

- Added presence schema migration with `collab.presence` and status enum updates
- Implemented presence join/heartbeat/update/disconnect in WebSocket flow with queue handling
- Wired frontend presence list rendering and queue status screen
- Fixed SQLx enum binding for presence status updates

## Version 1.73 - 2026-01-18

### 🎯 Major Updates

#### ✅ Real-time Collaboration (Design)

- Expanded FR-RTC-01 Presence Awareness logic design (flows, status model, queue, UI rules)
- Added `board:queued` WebSocket response for full-board waiting queue
- Clarified queue is mandatory with `BOARD_FULL` fallback only when queue is unavailable

## Version 1.72 - 2026-01-11

### 🎯 Major Updates

#### ✅ Board Templates (Backend)

- Clone template elements with new IDs and snapshot state to prevent 404/409 on updates
- Include `z_index` in realtime element sync payloads to preserve layer ordering

#### ✅ Board Elements (Frontend)

- Remap element IDs locally when create/update conflicts indicate template ID collisions

## Version 1.71 - 2026-01-11

### 🎯 Major Updates

#### ✅ Board Elements (Frontend)

- Added update fallback to create elements when PATCH returns NOT_FOUND

## Version 1.70 - 2026-01-11

### 🎯 Major Updates

#### ✅ Board Elements (Frontend)

- Implemented FR-ELM-04 move behavior with grid/alignment snapping, guide lines, and arrow-key nudging
- Enabled connector dragging by translating start/end points during move updates

## Version 1.69 - 2026-01-11

### 🎯 Major Updates

#### ✅ Board Elements (Design)

- Documented FR-ELM-04 move behavior for snapping, alignment guides, and keyboard nudging

## Version 1.68 - 2026-01-09

### 🎯 Major Updates

#### ✅ Board Elements (Backend + Frontend)

- Added element delete/restore endpoints with optimistic locking and realtime delete broadcasts
- Added multi-select delete confirmation and undo restore banner on the board canvas

## Version 1.67 - 2026-01-09

### 🎯 Major Updates

#### ✅ Board Elements (Backend)

- Broadcast element updates into Yjs rooms to keep versions in sync after REST edits

## Version 1.66 - 2026-01-09

### 🎯 Major Updates

#### ✅ Board Elements (Frontend)

- Auto-retry geometry-only updates on version conflict to avoid 409s when moving elements

## Version 1.65 - 2026-01-09

### 🎯 Major Updates

#### ✅ Board Route (Frontend)

- Guarded board metadata refresh to prevent render loops causing maximum update depth errors

## Version 1.64 - 2026-01-09

### 🎯 Major Updates

#### ✅ Board Elements (Backend)

- Hydrated missing element versions into Yjs state to prevent create-on-move conflicts
- Included element versions in realtime create broadcasts
- Fixed missing Yrs WriteTxn import for version hydration

## Version 1.63 - 2026-01-09

### 🎯 Major Updates

#### ✅ Board Elements (Frontend)

- Persisted queued moves after create conflicts to avoid losing drag updates
- Broadcast persisted element versions across Yjs to prevent create-on-move conflicts after reloads
- Normalized element dimensions before update requests to avoid 422 errors on move

## Version 1.62 - 2026-01-09

### 🎯 Major Updates

#### ✅ Board Elements (Frontend)

- Added transformer-based resize/rotate for selectable elements, including sticky notes
- Switched drawing movement to position offsets for smoother drag behavior
- De-duped create requests while pending and synced latest state after create completes
- Improved conflict payload normalization to reduce version mismatch alerts
- Buffered drag updates locally and broadcast drag presence via awareness to avoid conflict jitter

## Version 1.61 - 2026-01-08

### 🎯 Major Updates

#### ✅ Board Access Control (Backend)

- Added effective permission evaluation with custom overrides for board members
- Enforced permissions across board APIs and realtime access with audit logging for board_member changes
- Fixed audit logging to avoid missing `created_by` on tables without that column

#### ✅ Board Access Control (Frontend)

- Displayed effective permissions for board members and enabled custom permission overrides in the share dialog

#### ✅ Board Elements (Backend)

- Added element creation endpoint with validation and auto z-index assignment
- Broadcast element creation updates into Yjs rooms and persisted CRDT update logs when no room is active
- Added element update endpoint with optimistic locking and validation
- Restricted element update endpoint to geometry/style/property changes (structure handled separately)

#### ✅ Board Elements (Frontend)

- Added tools and placeholders for all element types with drag-to-create sizing
- Added sticky note editing flow and z-index ordering for realtime elements
- Added element edit persistence calls with optimistic locking updates
- Synced element `updated_at` metadata after edit persistence
- Disabled auto-size on click for drawing tools; require drag-sized creation (including sticky notes)
- Sized sticky note text editor to the dragged note bounds and normalized note geometry on finalize
- Enabled sticky note drag/drop movement and persisted position updates
- Enabled drag/drop movement for non-connector elements in select mode
- Normalized connector bounds before persistence and suppressed conflict alerts when auto-reconciled

#### ✅ Board Elements (Backend + Frontend)

- Return latest element payload on edit conflict for client reconciliation
- Merge JSON style/properties/metadata updates on edit
- Seed element versions on first edit via create fallback
- Handle duplicate element ids on create by returning conflict payload
- Fix unique-violation code path in element creation

## Version 1.60 - 2026-01-08

### 🎯 Major Updates

#### ✅ Organization Members Refactor

- Split organization members UI into dedicated components and hooks, and reorganized backend organization usecases by domain

## Version 1.59 - 2026-01-06

### 🎯 Major Updates

#### ✅ Board Realtime Sync

- Buffer local Yjs updates until websocket opens to prevent losing early strokes

## Version 1.58 - 2026-01-06

### 🎯 Major Updates

#### ✅ Board Realtime Sync

- Send Yjs sync step on websocket open to ensure board state reloads after refresh

## Version 1.57 - 2026-01-06

### 🎯 Major Updates

#### ✅ Board Realtime Persistence

- Flush pending CRDT updates when the last user disconnects to avoid losing drawings on refresh

## Version 1.56 - 2026-01-06

### 🎯 Major Updates

#### ✅ Board Route Refactor

- Extracted canvas interactions and viewport calculations into dedicated hooks
- Moved canvas rendering into a reusable stage component

## Version 1.55 - 2026-01-06

### 🎯 Major Updates

#### ✅ Board Route Refactor

- Extracted board header, status screens, toolbar, toast, text editor overlay, and canvas stage into components
- Moved board route helper utilities into a dedicated module

## Version 1.52 - 2026-01-06

### 🎯 Major Updates

#### ✅ Board Delete Frontend

- Added board delete actions in board settings and list menu
- Added trash/restore screen for deleted boards

## Version 1.51 - 2026-01-06

### 🎯 Major Updates

#### ✅ Board Delete Backend

- Added soft delete and restore endpoints for boards
- Added background cleanup for trashed boards after 30 days

## Version 1.50 - 2026-01-06

### 🎯 Major Updates

#### ✅ Public Board Toast

- Showed the workspace-public toast only once per board per browser
- Avoided clearing the toast state during initial board metadata loading

## Version 1.49 - 2026-01-06

### 🎯 Major Updates

#### ✅ Board Settings UI

- Added frontend board settings dialog for rename, visibility, ownership transfer, and archive actions
- Added archived-board screen with restore action
- Added board list row menu action to open board settings
- Prevented dashboard row navigation when dismissing the settings dialog

## Version 1.48 - 2026-01-06

### 🎯 Major Updates

#### ✅ Board Edit Backend

- Added board edit, archive, unarchive, and ownership transfer endpoints
- Documented archived board behavior and access errors

## Version 1.47 - 2026-01-06

### 🎯 Major Updates

#### ✅ Limit Modal Refresh

- Redesigned the plan limit modal with usage context and upgrade CTA

## Version 1.46 - 2026-01-06

### 🎯 Major Updates

#### ✅ Role Enforcement Alignment

- Restricted organization board creation to owners/admins only
- Enforced guest view-only access on organization boards

## Version 1.45 - 2026-01-06

### 🎯 Major Updates

#### ✅ Logout Redirect

- Redirect to login after logout from the profile header
- Guard profile route to navigate to login when auth state clears

## Version 1.44 - 2026-01-06

### 🎯 Major Updates

#### ✅ Personal Plan Enforcement

- Treated expired or missing subscriptions as Free tier for personal board limits
- Mirrored the active-plan check in the personal usage UI

## Version 1.43 - 2026-01-06

### 🎯 Major Updates

#### ✅ Limit Modal UX

- Show a limit-reached modal when clicking "Create new" at the board limit

## Version 1.42 - 2026-01-06

### 🎯 Major Updates

#### ✅ Personal Usage Stability

- Hardened personal workspace usage rendering against unexpected tier casing
- Guarded usage formatting against undefined values

## Version 1.41 - 2026-01-06

### 🎯 Major Updates

#### ✅ Personal Workspace Usage UI

- Added personal workspace board usage display in the dashboard header
- Disabled board creation when the personal plan limit is reached

## Version 1.40 - 2026-01-06

### 🎯 Major Updates

#### ✅ Personal Workspace Plan Limits

- Enforced board limits for personal workspaces based on the user's subscription tier
- Counted personal boards owned by the user when validating plan limits

## Version 1.39 - 2026-01-06

### 🎯 Major Updates

#### ✅ Public Toast Placement

- Centered the public-board toast near the top header line

## Version 1.37 - 2026-01-06

### 🎯 Major Updates

#### ✅ Default Workspace Visibility

- Defaulted `is_public` to true when omitted (applies to default workspace)
- Switched the public board message to a toast-style hint

## Version 1.36 - 2026-01-06

### 🎯 Major Updates

#### ✅ Workspace Board Visibility

- Backend defaults workspace boards to public visibility when `is_public` is omitted

## Version 1.35 - 2026-01-06

### 🎯 Major Updates

#### ✅ Board Visibility UX

- Removed the visibility selector from the create board dialog
- Added a Miro-style workspace public banner inside the board view

## Version 1.34 - 2026-01-06

### 🎯 Major Updates

#### ✅ Workspace Board Defaults

- Default new workspace boards to public visibility
- Show a workspace-public banner when viewing a public workspace board

## Version 1.33 - 2026-01-06

### 🎯 Major Updates

#### ✅ Canvas Auto-Fill Defaults

- Removed canvas settings section from board creation dialog
- Boards now default to fill the user's viewport and use the page's primary background color

#### ✅ Board View Reset

- Reset board zoom and position when opening a board to ensure full-screen fit

#### ✅ Zoom Clamp

- Prevented zooming out below 100% so the canvas always stays screen-filling

#### ✅ Zoom-Out Fullscreen

- Adjusted canvas bounds with zoom so zooming out keeps the canvas filling the viewport

#### ✅ Miro-Style Zoom

- Added eased zoom transitions and infinite grid/background coverage

#### ✅ Zoom Smoothing

- Smoothed zoom interpolation to avoid jitter on rapid wheel input

## Version 1.27 - 2026-01-06

### 🎯 Major Updates

#### ✅ Board Canvas Settings Applied

- Applied board canvas settings (background color, grid toggle, dimensions) in board view
- Added board detail endpoint for retrieving canvas settings
- Public boards now grant read-only access to authenticated users

## Version 1.26 - 2026-01-06

### 🎯 Major Updates

#### ✅ Board Creation Options

- Added visibility, canvas settings, and template-based creation to board creation flow
- Template selections now inherit template canvas state when provided

## Version 1.25 - 2026-01-06

### 🎯 Major Updates

#### ✅ Live Board Role Enforcement

- Broadcast board role changes over WebSocket and apply them instantly on clients
- Enforce edit permissions server-side per connection without refresh

## Version 1.24 - 2026-01-06

### 🎯 Major Updates

#### ✅ Presence Cleanup

- Remove awareness entries on WebSocket disconnect to prevent stale cursor counts
- Add periodic cursor sweep to prune stale presence without requiring remote changes
- Fix awareness update decoding to avoid compile-time inference errors

## Version 1.23 - 2026-01-06

### 🎯 Major Updates

#### ✅ Presence Stabilization

- Deduplicated cursors by user and added heartbeat to prevent ghost presence on refresh

## Version 1.22 - 2026-01-06

### 🎯 Major Updates

#### ✅ Workspace Role Guard

- Prevented members from changing their own workspace role

## Version 1.21 - 2026-01-06

### 🎯 Major Updates

#### ✅ Auth UX

- Added password placeholder on registration form

## Version 1.20 - 2026-01-06

### 🎯 Major Updates

#### ✅ Login UX

- Added password visibility toggle on the login form

## Version 1.19 - 2026-01-06

### 🎯 Major Updates

#### ✅ Board Invite UX Hint

- Added UI hint that workspace invite acceptance is required before board access

## Version 1.18 - 2026-01-06

### 🎯 Major Updates

#### ✅ Workspace Invite Gate

- Redirect board access to invitations when workspace invite is still pending

## Version 1.17 - 2026-01-06

### 🎯 Major Updates

#### ✅ Board Invite Org Sync

- Inviting a user to an org board auto-creates a guest workspace invite if needed
- Board access now requires accepting the workspace invite

## Version 1.16 - 2026-01-06

### 🎯 Major Updates

#### ✅ Organization Member Removal Cleanup

- Removing an organization member now removes their board memberships
- Boards with a sole owner are transferred to another organization owner
- Board list owner label now resolves to current board owners in the organization

## Version 1.15 - 2026-01-06

### 🎯 Major Updates

#### ✅ Organization Admin Board Access

- Organization owners/admins can open boards without being board members (read-only by default)

## Version 1.14 - 2026-01-06

### 🎯 Major Updates

#### ✅ Board Usage Clarity

- Documented organization filter for board list endpoint
- Clarified board usage display to distinguish accessible boards from total usage

## Version 1.13 - 2026-01-06

### 🎯 Major Updates

#### ✅ Enterprise Invite Flow

- Added invite token validation endpoint and auto-accept on invite-based registration

## Version 1.12 - 2026-01-06

### 🎯 Major Updates

#### ✅ Pre-Signup Invite Acceptance

- Auto-accept pre-signup invites after email verification (accepted_at set on verification)

## Version 1.11 - 2026-01-06

### 🎯 Major Updates

#### ✅ Invitation Flow UX

- Added dedicated `/invitations` route and account mismatch handling for invite links

## Version 1.10 - 2026-01-06

### 🎯 Major Updates

#### ✅ Error Message Hygiene

- Standardized API error message extraction to hide error codes in the UI

## Version 1.9 - 2026-01-06

### 🎯 Major Updates

#### ✅ Member Limit Counting

- Exclude workspace owners from member limit usage calculations

## Version 1.8 - 2026-01-06

### 🎯 Major Updates

#### ✅ Pricing & Member Limit UX

- Updated pricing page to align with tier limits and features
- Member invite limit now calculates queued invites before sending

## Version 1.7 - 2026-01-06

### 🎯 Major Updates

#### ✅ Tier Update Endpoint

- Added endpoint to update subscription tier and auto-recalculate limits

## Version 1.6 - 2026-01-06

### 🎯 Major Updates

#### ✅ Tier Limits Backfill

- Added migration to align existing organizations with tier-based limits

## Version 1.5 - 2026-01-06

### 🎯 Major Updates

#### ✅ Subscription Tier Auto-Mapping

- Map organization limits from subscription tier (members/boards/storage)
- Align API examples with tier-based limits

## Version 1.4 - 2026-01-06

### 🎯 Major Updates

#### ✅ Dashboard Usage Widget

- Added compact usage widget to the dashboard board list header

## Version 1.3 - 2026-01-06

### 🎯 Major Updates

#### ✅ Organization Usage UI

- Added workspace usage panel (members, boards, storage)
- Added 80% usage warning banner and member limit messaging
- Added board limit hints in create board dialog

## Version 1.2 - 2026-01-06

### 🎯 Major Updates

#### ✅ Organization Resource Limits

- Enforced organization member limits on invite operations
- Enforced board limits for organization-owned boards
- Added organization usage endpoint for warning thresholds

## Version 1.1 - 2026-01-04

### 🎯 Major Updates

#### ✅ API Documentation Enhancements

**New Endpoints Documented:**

**User Management:**
- `GET /users/me/profile-setup` - Check profile setup status
- `PUT /users/me/profile-setup` - Complete onboarding
- `GET /users/me/invitations` - List pending invitations (org + board)

**Organization Management (Complete Coverage):**
- `POST /organizations` - Create organization (creator becomes owner)
- `GET /organizations` - List user's organizations
- `GET /organizations/slug-availability` - Check slug availability
- `GET /organizations/{org_id}` - Get organization details
- `GET /organizations/{org_id}/members` - List organization members
- `GET /organizations/{org_id}/invites` - List pre-signup email invites
- `POST /organizations/{org_id}/members` - Invite members by email
- `PATCH /organizations/{org_id}/members/{member_id}` - Update member role
- `DELETE /organizations/{org_id}/members/{member_id}` - Remove member
- `POST /organizations/{org_id}/members/{member_id}/accept` - Accept invitation
- `DELETE /organizations/{org_id}/members/{member_id}/decline` - Decline invitation
- `POST /organizations/{org_id}/members/{member_id}/resend` - Resend invite email

**Board Member Management (Already Updated):**
- `GET /api/boards/{board_id}/members` - List board members
- `POST /api/boards/{board_id}/members` - Invite users to board
- `PATCH /api/boards/{board_id}/members/{member_id}` - Update board member role
- `DELETE /api/boards/{board_id}/members/{member_id}` - Remove board member

#### ✅ New Architecture Diagrams

**Organization Flows:**
- Organization creation flow
- Member invitation (existing users)
- Pre-signup invitation flow
- Accept/decline invitation flows
- Resend invitation flow
- Remove member flow
- Update member role flow
- List pre-signup invites flow

**Key Features Documented:**
- Email-based invitation system
- Pre-signup invite storage
- Automatic invite-to-membership conversion on signup
- SMTP integration requirements
- Rate limiting on resend operations

#### ✅ Schema Updates Documented

**New Tables:**
- `core.organization_invite` - Pre-signup organization invitations
  - Stores invites for emails without accounts
  - Automatically converted to membership on signup
  - 7-day expiration
  - Unique constraint per (organization_id, email)

**Extensions:**
- `pg_uuidv7` - UUIDv7 generation (time-ordered UUIDs)

### 📝 Documentation Structure Updates

```
docs/
├── README.md (updated with organization endpoints)
├── CHANGELOG.md (NEW - this file)
├── api/
│   └── API_DOCUMENTATION.md (UPDATED - complete org API coverage)
└── architecture/
    └── diagrams/
        ├── data-flow.md (existing - auth & boards)
        └── organization-flows.md (NEW - 10 detailed flow diagrams)
```

### 🔄 Breaking Changes

**None** - All updates are backward compatible additions.

### 🐛 Bug Fixes in Documentation

- Fixed endpoint paths (changed `/api/organizations` → `/organizations`)
- Added missing authentication requirements
- Clarified pre-signup vs existing user invitation flows
- Added SMTP configuration details
- Documented rate limiting on invite resend (max 3/hour)

### 📊 Coverage Metrics

**API Endpoints Documented:**
- Before: 15 endpoints
- After: 30+ endpoints
- Coverage: ~95% of implemented routes

**Sequence Diagrams:**
- Before: 6 diagrams (auth + boards)
- After: 16 diagrams (auth + boards + organizations)

### 🎨 Improvements

**Request/Response Examples:**
- All organization endpoints have complete examples
- Error responses documented with HTTP status codes
- Validation requirements clearly specified

**Notes & Behavior:**
- Documented dual invitation paths (existing users vs pre-signup)
- Clarified SMTP requirements
- Explained rate limiting and expiration policies
- Added permission requirements per endpoint

**Email Templates:**
- Organization invitation template
- Pre-signup invitation template

### 🚀 Next Steps

**Potential Future Documentation:**
- Board invitation flows (detailed diagrams)
- Onboarding/profile setup flow
- Organization settings management
- Subscription tier limits and enforcement
- Webhook documentation (when implemented)

---

## Version 1.0 - 2026-01-04 (Initial Release)

### Initial Documentation Created

**Architecture:**
- ✅ Architecture Overview (comprehensive)
- ✅ C4 Model Diagrams (Context, Container, Component)
- ✅ Data Flow Diagrams (Authentication, Boards, Real-time)
- ✅ Security Architecture
- ✅ ADRs (Rust/Axum, Yjs/CRDT)

**API:**
- ✅ Authentication endpoints
- ✅ User profile management
- ✅ Board CRUD operations
- ✅ WebSocket real-time protocol

**Deployment:**
- ✅ Deployment Guide (Local, Docker, AWS)
- ✅ Database migration strategies
- ✅ Monitoring & logging setup
- ✅ Backup & disaster recovery

**Total Pages:** ~50 pages of documentation
**Diagrams:** 6 sequence diagrams, 3 C4 diagrams
**Code Examples:** 50+ examples across Rust and TypeScript

---

## Maintenance Notes

### Update Triggers

Documentation should be updated when:

1. **New API endpoint added** → Update API_DOCUMENTATION.md
2. **Database schema changed** → Update schema.md + data flow diagrams
3. **Major architectural decision** → Create new ADR
4. **Security change** → Update SECURITY.md
5. **Deployment process change** → Update DEPLOYMENT_GUIDE.md

### Review Schedule

- **Quarterly Review**: Check all docs for accuracy (every 3 months)
- **Release Review**: Update docs with each major release
- **On-Demand**: Update immediately for breaking changes

### Contributors

Documentation maintained by the Engineering Team.

**Primary Maintainers:**
- Architecture: Tech Lead
- API Docs: Backend Team
- Deployment: DevOps Team
- Security: Security Team

---

**Last Updated:** 2026-01-23
**Next Review:** 2026-04-18
