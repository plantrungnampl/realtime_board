# Implement FR-RTC-01 Presence Awareness (WebSocket + Persistence)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan is governed by `.agent/PLANS.md` and must be maintained in accordance with that file.

## Purpose / Big Picture

Users on a board can see who is currently present, their avatar/color, and their status (online/idle/away) in real time. A board that reaches the 100-user concurrency limit responds with a queue or a clear “board is full” signal. Presence survives transient disconnects via heartbeat, and stale presence is cleaned up automatically. This change is visible by opening the same board in two browsers and watching the presence bar update as users join, idle, and leave.

## Progress

- [x] (2026-01-18T06:18Z) Drafted ExecPlan with context, decisions, and acceptance criteria.
- [x] (2026-01-18T06:56Z) Add database schema for presence and update documentation (`schema.md`).
- [x] (2026-01-18T06:56Z) Implement backend presence service + caching and integrate with WebSocket handler.
- [x] (2026-01-18T06:56Z) Implement frontend presence UI and event handling.
- [ ] (2026-01-18T06:18Z) Validate end-to-end presence behavior and document results.

## Surprises & Discoveries

- Observation: The WebSocket handler in `src/api/ws/boards.rs` only processes binary Yjs frames and does not handle JSON presence/heartbeat events.
  Evidence: The receive loop matches only `Message::Binary` and ignores `Message::Text`.
- Observation: Room presence tracking used a `DashSet<user_id>`, which drops to zero on multi-tab disconnects.
  Evidence: `Room.user` stored unique user IDs and was used to decide when to flush pending updates.

## Decision Log

- Decision: Store presence per `(board_id, session_id)` but dedupe UI by `user_id` to avoid double counts from multi-tab sessions.
  Rationale: Prevents a single user from consuming multiple slots while still tracking sessions accurately.
  Date/Author: 2026-01-18, Codex

- Decision: Normalize client status `active` to stored/broadcast `online`.
  Rationale: Aligns client updates with the canonical status domain used in persistence and UI.
  Date/Author: 2026-01-18, Codex

- Decision: Make `board:queued` the default response when the board is full, with `BOARD_FULL` only as a fallback when queue infrastructure is unavailable.
  Rationale: BR-BRD-03 requires queueing; fallback keeps the system usable if Redis/queue is down.
  Date/Author: 2026-01-18, Codex

- Decision: Implement the queue as an in-memory per-room FIFO with `Notify` gates, while keeping presence list caching in Redis.
  Rationale: Matches current single-node realtime architecture and avoids blocking on Redis queue support.
  Date/Author: 2026-01-18, Codex

- Decision: Track active sessions by `session_id` in `Room` to avoid premature cleanup when users open multiple tabs.
  Rationale: Presence is session-based and pending update flush should only occur when all sessions disconnect.
  Date/Author: 2026-01-18, Codex

## Outcomes & Retrospective

No implementation yet. This plan defines the end-to-end change required for presence awareness.

## Context and Orientation

The WebSocket endpoint for boards lives in `src/api/ws/boards.rs`. It currently synchronizes Yjs updates and awareness via binary messages and broadcasts through `src/realtime/room.rs`, which stores per-board `Room` state and a broadcast channel. There is no persistence or cache layer for presence in the codebase yet, and no Redis client in `src/app/state.rs`. The business design for presence is documented in `doc/realtime-collaborative-board-design.md`, and the WebSocket event catalog is in `doc/websocket-events-specification.md`. The board header UI is in `frontend/src/features/boards/components/BoardHeader.tsx`, and the board route logic is in `frontend/src/features/boards/boardRoute.logic.ts`.

Definitions used in this plan:

- Presence: the list of users currently connected to a board with status (online/idle/away) and identity (avatar/color).
- Awareness: Yjs-specific cursor/selection updates, already supported via binary messages.
- Heartbeat: periodic client signal (every 30s) used to keep presence alive; absence for 5 minutes means the user is removed.
- Queue: an optional waitlist for boards at capacity (100 users).

## Plan of Work

First, add persistence for presence. Create a SQL migration in `migrations/` to introduce `collab.presence` with fields `board_id`, `user_id`, `session_id`, `status`, `cursor_x`, `cursor_y`, `last_heartbeat_at`, `connected_at`, and `disconnected_at`, plus indexes for `board_id` and `disconnected_at`. If `collab` schema does not exist, create it in the same migration. Update `schema.md` to reflect the new table and the `presence_status` enum.

Next, implement backend models, repositories, and services. Add `src/models/presence.rs` for `PresenceStatus` and `PresenceRecord`. Add `src/repositories/presence.rs` for insert/update/list queries. Add `src/services/presence.rs` (or `src/usecases/presence.rs` if you prefer existing patterns) for business logic: join board presence, heartbeat updates, status updates, and disconnect cleanup. Implement deduplication by `user_id` when building the `current_users` list.

Add a cache layer. Introduce a Redis client (for example `redis` or `deadpool-redis`) in `Cargo.toml`, wire it into `src/app/state.rs`, and read `REDIS_URL` from the environment. Cache `presence:{board_id}` with TTL 60s and refresh on heartbeat. If Redis is unavailable, fall back to in-memory storage in the `Room` struct to keep the feature functional in development.

Integrate presence into WebSocket flow. In `src/api/ws/boards.rs`, extend the receive loop to parse `Message::Text` JSON events for `presence:update` and `heartbeat`. On join, check the number of active unique users; if the board is full and queueing is enabled, send `board:queued`, otherwise send `error` with code `BOARD_FULL`. If allowed, create a presence record, send `board:joined` with `current_users`, and broadcast `user:joined` to other clients. On heartbeat, update `last_heartbeat_at` and refresh cache TTL. On `presence:update`, update status and broadcast `presence:update` to the room. On disconnect, mark `disconnected_at`, remove from cache, and broadcast `user:left`.

Update the frontend to surface presence. In `frontend/src/features/boards/boardRoute.logic.ts`, add state for `currentUsers` and handlers for `board:joined`, `user:joined`, `presence:update`, and `user:left`. Replace the presence display in `BoardHeader.tsx` to use `currentUsers` (with avatar + status) instead of cursor-only data, while keeping cursor rendering in the canvas as-is. Use a deterministic color mapping for users who do not have a profile color.

Add or update documentation and tests. Ensure `doc/websocket-events-specification.md` stays aligned with new events and `docs/CHANGELOG.md` notes the update. Add unit tests for repository queries and presence status transitions where feasible. If WebSocket integration tests are not available, document manual verification steps clearly.

## Concrete Steps

1) Create the migration from repo root:

    sqlx migrate add create_presence_table

2) Edit the new migration file in `migrations/` to add `collab.presence`, indexes, and enum. Then run:

    sqlx migrate run

3) Update models and repositories:

    edit src/models/presence.rs
    edit src/repositories/presence.rs
    edit src/services/presence.rs

4) Wire Redis and presence service into `src/app/state.rs` and `src/api/ws/boards.rs`.

5) Update frontend state and UI:

    edit frontend/src/features/boards/boardRoute.logic.ts
    edit frontend/src/features/boards/components/BoardHeader.tsx

6) Run formatting and tests from repo root:

    cargo fmt
    cargo test
    cd frontend && npm run lint

## Validation and Acceptance

Start the backend with `cargo run` and the frontend with `cd frontend && npm run dev`. Open the same board in two browser sessions. You should see both users in the presence bar with distinct colors and avatars. After 60s of inactivity, a user transitions to idle (or away after 180s). Disconnect one session and confirm the other removes that user within 5 minutes (or immediately on clean disconnect). If 100 users are simulated, new connections should receive `board:queued` or a `BOARD_FULL` error, and the UI should show a “board is full” message.

## Idempotence and Recovery

The migration can be rerun safely if you use `IF NOT EXISTS` for schema creation and guard enum creation. If the migration needs rollback, drop the `collab.presence` table and enum in a down migration. WebSocket changes are additive and can be reverted by removing JSON handling without affecting Yjs binary sync.

## Artifacts and Notes

Example presence payload (server to client) for `board:joined`:

    {
      "type": "board:joined",
      "payload": {
        "board_id": "board_123",
        "session_id": "session_abc",
        "current_users": [
          {
            "user_id": "user_456",
            "display_name": "Jane Smith",
            "avatar_url": "...",
            "status": "online",
            "color": "#3b82f6"
          }
        ]
      }
    }

## Interfaces and Dependencies

Define or extend the following interfaces:

- In `src/models/presence.rs`, define:

    pub enum PresenceStatus { Online, Idle, Away }
    pub struct PresenceRecord { ... }

- In `src/repositories/presence.rs`, define:

    pub async fn insert_presence(...)
    pub async fn list_active_presence(...)
    pub async fn update_presence_status(...)
    pub async fn update_heartbeat(...)
    pub async fn mark_disconnected(...)

- In `src/services/presence.rs`, define a `PresenceService` with methods that wrap repository calls and apply dedupe + status normalization.

- In `src/api/ws/boards.rs`, add JSON message parsing for `presence:update` and `heartbeat`, and ensure `board:joined`, `user:joined`, `presence:update`, `user:left`, `board:queued`, and `error` are sent with the schemas in `doc/websocket-events-specification.md`.
