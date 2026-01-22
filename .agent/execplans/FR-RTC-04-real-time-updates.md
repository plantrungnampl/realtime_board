# FR-RTC-04 Real-time Updates: Offline Queue + Sync UX

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Follow `/Data/rust_project/Real-time_Board/.agent/PLANS.md` exactly. This document must remain fully self-contained and updated as changes are made.

## Purpose / Big Picture

Users should be able to keep editing a board when the network drops and see clear feedback about whether changes are saved locally or synced to the server. After this change, a user can go offline, keep drawing, refresh the page, and still see their changes; once the connection is back, the board syncs without losing edits. The UI exposes a simple sync status in the board header so users know if they are connected, syncing, or offline.

## Progress

- [x] (2026-01-19 14:05Z) Create ExecPlan and capture baseline context for FR-RTC-04.
- [x] (2026-01-19 14:16Z) Implement IndexedDB persistence and sync-status tracking in `frontend/src/features/boards/boardRoute/hooks/useBoardRealtime.ts`.
- [x] (2026-01-19 14:16Z) Surface sync status in `frontend/src/features/boards/components/BoardHeader.tsx` and wire it in `frontend/src/routes/board.$boardId.tsx` with i18n strings.
- [x] (2026-01-19 14:16Z) Update documentation (`docs/CHANGELOG.md`) and add any new i18n strings in `frontend/src/i18n.ts`.
- [ ] Validate the feature locally (manual steps) and update this plan with outcomes.

## Surprises & Discoveries

- None yet.

## Decision Log

- Decision: Use `y-indexeddb` to persist the Yjs document and enable offline edits to survive reloads.
  Rationale: Yjs docs recommend IndexedDB persistence for offline editing; it is a minimal, provider-agnostic change that works with the existing custom WebSocket protocol.
  Date/Author: 2026-01-19 (Codex)

- Decision: Track sync status with lightweight client state derived from WebSocket connection and pending updates.
  Rationale: The current protocol does not provide server acknowledgements; the UI should remain simple and avoid heavy per-update renders while still communicating offline/online/syncing states.
  Date/Author: 2026-01-19 (Codex)

- Decision: Use a board-scoped IndexedDB document name (`board:<boardId>`) and add lightweight reconnection with exponential backoff.
  Rationale: Board-scoped persistence keeps offline data isolated per board, while simple reconnect logic restores realtime updates without a manual refresh.
  Date/Author: 2026-01-19 (Codex)

## Outcomes & Retrospective

- Pending.

## Context and Orientation

The real-time board uses Yjs on the frontend and a custom WebSocket protocol on the backend.

Frontend key files:

- `frontend/src/features/boards/boardRoute/hooks/useBoardRealtime.ts`: Initializes `Y.Doc`, manages WebSocket sync, awareness, element state, and undo history.
- `frontend/src/features/boards/components/BoardHeader.tsx`: Renders board header (title, status, presence, settings).
- `frontend/src/routes/board.$boardId.tsx`: Board page route that composes the header, toolbar, canvas, and realtime hook.
- `frontend/src/i18n.ts`: Translation strings for UI text.
- `frontend/package.json`: Dependencies list; new libraries must be added here.

Backend reference (no changes planned in this plan unless needed):

- `src/api/ws/boards.rs`: WebSocket handler for real-time updates and awareness.

Terminology:

- “Yjs document” (`Y.Doc`): the shared CRDT document that contains board elements.
- “IndexedDB persistence”: browser storage used to cache Yjs updates so offline edits survive reloads.
- “Sync status”: UI state describing whether the client is connected, syncing, or offline.

## Plan of Work

First, add local persistence to the realtime hook so the Yjs document is backed by IndexedDB. Use `y-indexeddb` and create an `IndexeddbPersistence` instance with a stable document name derived from the board id (e.g., `board:<boardId>`). Listen for the provider’s `synced` event to know when local content has loaded. Make sure the persistence provider is cleaned up when the hook unmounts or the board changes.

Second, track a minimal sync status in the realtime hook. Add state that tracks:

- connection state: connecting | online | offline | reconnecting
- whether there are pending local updates that haven’t been sent
- whether local cache is ready
- the last local edit timestamp (optional, but useful for status text)

Update this state when:

- WebSocket opens/closes/errors
- the browser emits online/offline events
- local updates are queued because the socket is not open
- queued updates are flushed

Avoid render storms: throttle status updates to at most 4 per second (250 ms) and only update React state when the derived status changes.

Third, surface the sync status in the UI by extending `BoardHeader` to accept a new status label and an optional status tone (success/warn/neutral). Use `board.$boardId.tsx` to compute the label from the hook’s sync status and translation keys. Replace the hardcoded “Last saved just now” text with a translated, dynamic status string.

Fourth, add translations for the new status labels in `frontend/src/i18n.ts` for both English and Vietnamese.

Finally, update `docs/CHANGELOG.md` with a new entry describing the offline persistence and sync status indicator, and record any known limitations (e.g., no server-side latency measurement yet).

## Concrete Steps

1) Add dependency:

   - Edit `frontend/package.json` and add `y-indexeddb` under `dependencies`.

2) Implement persistence + sync status in the realtime hook:

   - File: `frontend/src/features/boards/boardRoute/hooks/useBoardRealtime.ts`
   - Import `IndexeddbPersistence` from `y-indexeddb`.
   - Create `persistenceRef` and initialize it after `Y.Doc` creation.
   - Attach a `synced` listener to mark local cache ready.
   - Add `syncStatus` state plus a throttled updater.
   - Update WebSocket lifecycle handlers to set connection state and attempt reconnects with a short backoff.
   - Ensure cleanup destroys persistence and cancels timers/listeners.

3) Wire sync status into the header:

   - File: `frontend/src/features/boards/components/BoardHeader.tsx`
   - Add new props: `syncLabel` (string) and `syncTone` (e.g., "neutral" | "ok" | "warn").
   - Render a small status dot + label in the subtitle line instead of the static text.

4) Compute labels in the board route:

   - File: `frontend/src/routes/board.$boardId.tsx`
   - Extend the destructured return from `useBoardRealtime` to include `syncStatus`.
   - Compute a `syncLabel` using `t("board.sync...")` keys.
   - Pass `syncLabel` and `syncTone` into `BoardHeader`.

5) Add translations:

   - File: `frontend/src/i18n.ts`
   - Add keys such as `board.syncConnecting`, `board.syncReconnecting`, `board.syncOffline`, `board.syncSyncing`, `board.syncSaved`, and `board.syncLoadingLocal` for EN/VI.

6) Documentation:

   - File: `docs/CHANGELOG.md`
   - Add a new version entry for 2026-01-19 describing offline persistence and sync status.

## Validation and Acceptance

Manual validation (no automated tests are currently configured):

1) Start backend and frontend.

   - Backend: run from repo root `cargo run` (assumes Postgres is up).
   - Frontend: run from `frontend/` with `npm run dev`.

2) Open a board and draw an element. Confirm the header status shows “All changes saved”.

3) Simulate offline:

   - In browser devtools, toggle “Offline” network.
   - Make a change on the board.
   - Confirm the header shows “Offline · Changes saved locally”.

4) Refresh the page while offline. The same board should still show the change (loaded from IndexedDB).

5) Re-enable network. The header should move to “Syncing…” briefly then “All changes saved”.

Acceptance criteria are met when offline edits persist across reloads, sync after reconnect, and the header status reflects connection state accurately.

## Idempotence and Recovery

- These changes are additive and can be re-applied safely.
- If IndexedDB is unavailable (private mode restrictions), the hook should fall back to in-memory behavior and continue syncing over WebSocket.
- If reconnect logic misbehaves, disable it by removing the reconnection timer block; the rest of the system still works with manual refresh.

## Artifacts and Notes

Expected example of new header text states:

  - “Restoring local changes…” (during IndexedDB load)
  - “Connecting…” (initial socket connect)
  - “Offline · Changes saved locally” (network down)
  - “Syncing…” (pending updates after reconnect)
  - “All changes saved” (steady state)

## Interfaces and Dependencies

Dependencies:

- `y-indexeddb` (frontend dependency) to persist Yjs document updates to IndexedDB.

New types to introduce (frontend, local):

- `type BoardSyncStatus = { connection: "connecting" | "online" | "offline" | "reconnecting"; pendingUpdates: boolean; localCacheReady: boolean; lastLocalChangeAt: number | null }`

No backend interface changes are required in this plan.

---

Plan updated: 2026-01-19 14:16Z (implementation + doc wiring complete; validation pending).
