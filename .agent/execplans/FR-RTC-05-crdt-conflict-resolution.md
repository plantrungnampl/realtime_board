# FR-RTC-05 CRDT Conflict Resolution (CRDT Authoritative + DB Projection)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Follow `/Data/rust_project/Real-time_Board/.agent/PLANS.md` exactly. This document must remain fully self-contained and updated as changes are made.

## Purpose / Big Picture

Users can edit the same board concurrently without manual conflict resolution. Changes from multiple users merge deterministically and the final board state is the same for every client. The server’s database is a projection of the CRDT document, so persistence never overwrites CRDT merges; instead, it materializes the merged state. After this change, concurrent edits to different fields on the same element preserve both edits, and the board still loads correctly after reconnect or refresh.

## Progress

- [x] (2026-01-19 14:30Z) Create ExecPlan and capture current CRDT + persistence architecture.
- [x] (2026-01-19) Backend: field-level CRDT element maps + snapshot build updates.
- [x] (2026-01-19) Backend: REST element mutations apply CRDT updates (no optimistic-lock conflicts).
- [x] (2026-01-19) Backend: CRDT → DB projection worker with upsert guards + on-demand projection.
- [x] (2026-01-19) Frontend: refactor Yjs element maps + remove conflict UI.
- [ ] Verify with manual concurrency scenarios.

## Surprises & Discoveries

- None yet.

## Decision Log

- Decision: Use field-level CRDT maps (`Y.Map` / `yrs::MapRef`) instead of storing whole elements as a single JSON blob.
  Rationale: Whole-object updates are last-write-wins and lose concurrent field edits. Field-level maps preserve user intent across concurrent edits.
  Date/Author: 2026-01-19 (Codex)

- Decision: Make the CRDT document authoritative; database state becomes a projection.
  Rationale: Avoids optimistic-lock conflicts that require manual resolution and aligns with FR-RTC-05 acceptance criteria.
  Date/Author: 2026-01-19 (Codex)

- Decision: Run projection on a short interval (2s) and project immediately when updates are applied without an active room.
  Rationale: Keeps DB close to CRDT state even when no websocket room is loaded.
  Date/Author: 2026-01-19 (Codex)

## Outcomes & Retrospective

- Pending.

## Context and Orientation

Current realtime flow:

- Frontend uses Yjs (`frontend/src/features/boards/boardRoute/hooks/useBoardRealtime.ts`) with a `Y.Map` named `elements` storing full element objects. This is last-write-wins at the object level and does not preserve concurrent edits to different fields.
- Backend uses Yrs (`src/realtime/room.rs`, `src/realtime/elements.rs`, `src/api/ws/boards.rs`) to apply Yjs updates and broadcast them. It also persists element changes via REST endpoints (`src/usecases/elements.rs`) with optimistic locking and conflict payloads.
- Persistence currently writes directly to the `board.element` table (see `src/models/elements.rs` and `src/repositories/elements.rs`).

We must refactor both frontend and backend to use a field-level CRDT structure, and change persistence to project from the CRDT document instead of enforcing optimistic locks.

## Plan of Work

### Milestone 1 — CRDT Data Model Refactor (Frontend + Backend)

Refactor the CRDT structure so each element is a nested map with per-field keys. This ensures concurrent edits to different fields are merged deterministically.

Frontend changes:

- Introduce a CRDT helper module (e.g., `frontend/src/features/boards/realtime/elementCrdt.ts`) with:
  - `createElementMap(doc: Y.Doc, element: BoardElement): Y.Map<any>`
  - `patchElementMap(map: Y.Map<any>, patch: Partial<BoardElement>): void`
  - `materializeElement(map: Y.Map<any>): BoardElement | null`
- Update `useBoardRealtime.ts` to:
  - Store `Y.Map<Y.Map>` rather than `Y.Map<BoardElement>`.
  - Apply updates by patching fields in the nested map instead of replacing whole objects.
  - Map updates from `Y.Map` to `BoardElement` for rendering.
  - Handle deleted elements by a `deleted_at` field (string | null) instead of removing entries.

Backend changes:

- Create `src/realtime/element_crdt.rs` to convert between `BoardElementResponse` and `yrs::MapRef` nested structures:
  - `apply_element_patch(doc, element_id, patch)`
  - `materialize_element(map_ref) -> BoardElement`
- Update `src/realtime/elements.rs` to insert/update nested `MapRef` fields (no `Any` JSON blobs).

### Milestone 2 — REST Endpoints Apply CRDT Updates (No Conflicts)

Remove manual conflict resolution by routing REST element changes through the CRDT document.

- In `src/usecases/elements.rs`, replace direct DB writes with CRDT mutations:
  - Validate permissions + payload as before.
  - Apply element changes to the room’s CRDT doc using `element_crdt` helpers.
  - Return materialized element from the CRDT doc, not a DB write result.
- Conflict payloads should no longer be returned for CRDT-managed fields; expected_version is accepted but not enforced for conflict checks.
- Update frontend `useBoardElementMutations.ts` to stop showing conflict alerts and to trust CRDT-updated state.

### Milestone 3 — CRDT → DB Projection Worker

Make the database a projection of CRDT state.

- Add `src/realtime/projection.rs`:
  - Periodically materialize each room’s CRDT doc into `BoardElement` structs.
  - Upsert elements into `board.element` (and soft-delete when `deleted_at` is set or missing).
  - Use `ON CONFLICT(id) DO UPDATE` with `IS DISTINCT FROM` guards to avoid unnecessary version bumps.
- Trigger projection on a cadence (e.g., every 2–5 seconds) or after a threshold of pending updates.
- Ensure snapshot logic (`src/realtime/snapshot.rs`) and update logs remain intact.

### Milestone 4 — Documentation & Validation

- Update `doc/realtime-collaborative-board-design.md` to reflect the CRDT authoritative model and DB projection.
- Update `docs/CHANGELOG.md` with a new entry describing the CRDT conflict resolution overhaul.
- Validate with manual multi-client edits:
  - Concurrent edits to different fields (e.g., move + text edit) preserve both changes.
  - Offline edits merge after reconnect.
  - Board reloads show the merged state from DB projection.

## Concrete Steps

1) Add frontend CRDT helpers and refactor `useBoardRealtime.ts`.
2) Update backend CRDT mutation helpers and replace JSON blob storage with nested maps.
3) Modify REST element endpoints to apply CRDT patches instead of optimistic-lock DB updates.
4) Implement projection worker and DB upsert logic.
5) Update docs and perform manual validation.

## Validation and Acceptance

Manual scenarios:

- Two clients edit the same element: one changes `position_x` while the other edits text; after sync both changes are present.
- Client A edits while offline, reconnects, and changes merge with client B’s edits.
- Refresh the board after sync; DB projection yields the same merged state as CRDT.

Acceptance is met when no manual conflict resolution is required and merges are deterministic.

## Idempotence and Recovery

- CRDT updates are idempotent; duplicate updates should not corrupt state.
- Projection can be retried safely; it only brings DB closer to CRDT state.
- If projection fails, CRDT state remains authoritative and will be retried on the next cycle.

## Artifacts and Notes

- Track projected elements count and update durations in logs for observability.
- Keep a migration note in docs if API behavior changes (conflict responses removed).

## Interfaces and Dependencies

Frontend:

- New helper module: `frontend/src/features/boards/realtime/elementCrdt.ts`.
- Update `useBoardRealtime.ts` and `useBoardElementMutations.ts` to route through field-level maps.

Backend:

- New module: `src/realtime/element_crdt.rs` for map conversion.
- New module: `src/realtime/projection.rs` for CRDT → DB projection.
- Update `src/realtime/elements.rs` and `src/usecases/elements.rs`.

---

Plan updated: 2026-01-19 14:30Z (initial plan creation).
