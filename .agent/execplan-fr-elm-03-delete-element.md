# Design and implement FR-ELM-03 Delete Element (backend + frontend + realtime)

This ExecPlan is a living document. The sections Progress, Surprises & Discoveries, Decision Log, and Outcomes & Retrospective must be kept up to date as work proceeds.

This ExecPlan must be maintained in accordance with `.agent/PLANS.md` from the repository root.

## Purpose / Big Picture

After this change, a user can remove one or more elements from a board and see the deletion reflected immediately for all collaborators. The deletion is soft (recoverable), uses optimistic locking so stale deletes do not overwrite newer edits, and is synchronized to the Yjs realtime document. A minimal Undo UI (toast/banner) appears after deletion so the user can restore the last delete action. A user can validate this by opening a board in two browser windows, deleting an element in one window, seeing it disappear in the other, and clicking Undo to restore it in both windows.

## Progress

- [x] (2026-01-09 01:05Z) Draft FR-ELM-03 design spec and confirm scope decisions (soft delete, restore + Undo UI, realtime broadcast, multi-delete confirmation dialog, no DELETE body).
- [x] (2026-01-11 08:11Z) Add backend delete/restore repository + usecase + handlers and wire realtime delete broadcast.
- [x] (2026-01-11 08:11Z) Add frontend delete/restore API helpers, selection state updates, and delete interactions (keyboard + multi-delete confirm).
- [x] (2026-01-11 08:11Z) Update docs for delete/restore endpoints and FR-ELM-03 notes.
- [ ] (2026-01-11 08:11Z) Validate end-to-end behavior and capture example curl transcripts.

## Surprises & Discoveries

- None yet.

## Decision Log

- Decision: Use soft delete on `board.element.deleted_at` and increment `version` on delete/restore.
  Rationale: The table already tracks `deleted_at`, and versioned updates are required to avoid conflicts.
  Date/Author: 2026-01-09 / Codex
- Decision: Provide a REST delete endpoint with `expected_version`, return conflict payloads for mismatches, and treat already-deleted rows as idempotent success.
  Rationale: Keeps optimistic locking consistent with edit behavior while avoiding conflict loops on repeated deletes.
  Date/Author: 2026-01-09 / Codex
- Decision: Broadcast delete/restore updates into Yjs rooms from the backend in case a client deletes/restores via REST without a local Yjs update.
  Rationale: Prevents stale Yjs state and ensures late joiners get correct presence of elements.
  Date/Author: 2026-01-09 / Codex
- Decision: Use a custom shadcn Dialog for multi-delete confirmation and a minimal Undo UI (toast/banner) for last-delete restore.
  Rationale: Matches the product UI expectations while keeping restore discoverable.
  Date/Author: 2026-01-09 / Codex
- Decision: Do not send a request body with DELETE; pass `expected_version` as a query parameter instead.
  Rationale: Aligns with HTTP semantics and user requirement while preserving optimistic locking.
  Date/Author: 2026-01-09 / Codex
- Decision: Require `expected_version` as a query parameter on restore as well.
  Rationale: Keeps optimistic locking consistent and allows Undo to restore the exact deletion version.
  Date/Author: 2026-01-09 / Codex
- Decision: Track pending deletes for elements created locally without a version and delete them after create resolves.
  Rationale: Prevents orphaned elements when users delete before create persistence completes.
  Date/Author: 2026-01-11 / Codex

## Outcomes & Retrospective

- Pending.

## Context and Orientation

Elements are stored in the realtime Yjs document under the key `elements` as a `Y.Map<BoardElement>` (see `frontend/src/features/boards/boardRoute.logic.ts`). Element persistence uses REST endpoints in `src/api/http/elements.rs` with data access in `src/repositories/elements.rs` and validation in `src/usecases/elements.rs`. The relational table `board.element` includes `deleted_at` (see `src/models/elements.rs`), but there is no delete endpoint or frontend deletion flow yet. Realtime updates are broadcast via `src/realtime/elements.rs` and persisted in update logs in `src/realtime/snapshot.rs`.

In this plan, “soft delete” means setting `deleted_at = NOW()` and incrementing `version`. “Restore” means clearing `deleted_at` and incrementing `version`. “Optimistic locking” means the client supplies `expected_version`, and the backend only applies the delete/restore if the version matches.

## Plan of Work

First, extend the backend to support delete and restore operations. The delete and restore endpoints must not accept request bodies; pass `expected_version` via query parameters instead. Add delete/restore response DTOs with `id`, `version`, and `deleted_at`. Implement repository helpers to soft delete and restore elements with version checks, and a lookup that includes deleted rows. In the usecase, enforce board edit permission, validate `expected_version`, and handle three cases: successful delete/restore, conflict (return latest element in a 409 payload), and idempotent already-deleted/already-restored success. Wire new HTTP handlers and routes for `DELETE /api/boards/{board_id}/elements/{element_id}?expected_version=...` and `POST /api/boards/{board_id}/elements/{element_id}/restore?expected_version=...`.

Second, update realtime handling to reflect delete and restore. Add a `broadcast_element_deleted` helper in `src/realtime/elements.rs` that removes the element key from the Yjs `elements` map and broadcasts an update (or stores an update log if no room is active). Reuse `broadcast_element_updated` for restore to reinsert the element into Yjs using the stored row. Call these helpers from the delete/restore handlers.

Third, implement frontend deletion flows. Add API helpers in `frontend/src/features/boards/api.ts` for delete and restore; the delete helper should use `expected_version` as a query parameter (no body). Extend `frontend/src/features/boards/hooks/useBoardElementMutations.ts` (or a new hook) with `deleteElement` and `restoreElement` methods that apply optimistic updates: remove the element locally, call the API, and reconcile conflicts with a retry using the latest version. For selection, replace the single `selectedElementId` in `frontend/src/features/boards/boardCanvas.hooks.ts` with a `selectedElementIds` array and support shift-click to toggle multiple selections. In `frontend/src/features/boards/components/BoardCanvasStage.tsx`, highlight all selected elements but only attach the transformer when exactly one element is selected. In `frontend/src/routes/board.$boardId.tsx`, handle the Delete/Backspace key to trigger deletion when editing is allowed; when multiple elements are selected, show a custom confirmation dialog using the shadcn `Dialog` components. For recoverability, add a minimal Undo UI (toast/banner) that restores the last delete action, including restoring all elements deleted in a single multi-delete operation.

Finally, update documentation. Add delete/restore endpoints to `docs/api/API_DOCUMENTATION.md`, update FR-ELM-03 notes in `doc/realtime-collaborative-board-design.md` if needed, and add a changelog entry to `docs/CHANGELOG.md`.

## Concrete Steps

1. Backend DTOs, repository, and usecase:
   - Edit `src/dto/elements.rs` to add `DeleteBoardElementResponse` and `RestoreBoardElementResponse`. Do not add a delete request body DTO; delete uses query params.
   - Edit `src/repositories/elements.rs` to add:
     - `find_element_by_id_including_deleted`
     - `soft_delete_element` (update `deleted_at`, `version`, `updated_at` with version check)
     - `restore_element` (clear `deleted_at`, increment version)
   - Edit `src/usecases/elements.rs` to add `ElementService::delete_element` and `ElementService::restore_element`.

2. Backend HTTP handlers and routes:
   - Edit `src/api/http/elements.rs` to add `delete_board_element_handle` and `restore_board_element_handle` with query param extraction for `expected_version` (no DELETE body).
   - Edit `src/app/router.rs` to register the new routes.

3. Realtime broadcast:
   - Edit `src/realtime/elements.rs` to add `broadcast_element_deleted` (remove key from Yjs map and broadcast update).
   - Call `broadcast_element_deleted` after successful delete and `broadcast_element_updated` after restore.

4. Frontend delete/restore API + UI:
   - Edit `frontend/src/features/boards/api.ts` to add `deleteBoardElement` (expected_version in query params) and `restoreBoardElement` (use query params for version if enforced).
   - Extend `frontend/src/features/boards/hooks/useBoardElementMutations.ts` with delete/restore helpers that handle conflicts and apply optimistic local removal/restoration.
   - Update `frontend/src/features/boards/boardCanvas.hooks.ts` to support multi-selection (`selectedElementIds`) and expose selection actions.
   - Update `frontend/src/features/boards/components/BoardCanvasStage.tsx` to render selection for multiple elements and attach the transformer only when one element is selected.
   - Update `frontend/src/routes/board.$boardId.tsx` to handle Delete/Backspace, show the shadcn Dialog for multi-delete confirmation, and show a minimal Undo UI that calls restore.

5. Documentation:
   - Update `docs/api/API_DOCUMENTATION.md` with delete/restore endpoints, payloads, and error cases.
   - Update `doc/realtime-collaborative-board-design.md` FR-ELM-03 section if behavior changes (undo/restore).
   - Add a changelog entry to `docs/CHANGELOG.md`.

## Validation and Acceptance

Run the backend with `cargo run` and the frontend with `cd frontend && npm run dev`. Open the same board in two windows. Select an element and press Delete; it should disappear in both windows and not reappear after refresh. Delete multiple selected elements and confirm the prompt appears before removal. Attempt to delete with a stale `expected_version` and confirm the server returns `409 Conflict` with the latest element payload. If restore is implemented, trigger restore (undo or API) and confirm the element reappears on all clients.

## Idempotence and Recovery

Delete and restore operations are idempotent: deleting an already-deleted element should return success without changing state, and restoring an already-active element should return the current element. If any step fails, rerun after fixing; no destructive data loss occurs because deletes are soft.

## Artifacts and Notes

Record short curl transcripts for delete and restore responses, including a conflict example, once implemented.

## Interfaces and Dependencies

Backend additions:
  - `crate::dto::elements::DeleteBoardElementResponse` with fields `id: Uuid`, `version: i32`, `deleted_at: DateTime<Utc>`, and optional `already_deleted: bool`.
  - `crate::dto::elements::RestoreBoardElementResponse` with fields `id: Uuid`, `version: i32`, `deleted_at: Option<DateTime<Utc>>`.
  - Repository functions in `src/repositories/elements.rs`: `find_element_by_id_including_deleted`, `soft_delete_element`, `restore_element`.
  - Usecases in `src/usecases/elements.rs`: `ElementService::delete_element`, `ElementService::restore_element`.
  - HTTP handlers in `src/api/http/elements.rs` and routes in `src/app/router.rs` for delete/restore using `expected_version` query params (no DELETE body).
  - Realtime helpers in `src/realtime/elements.rs`: `broadcast_element_deleted` and reuse `broadcast_element_updated` for restore.

Frontend additions:
  - `deleteBoardElement(boardId, elementId, expectedVersion)` using query params and `restoreBoardElement(...)` in `frontend/src/features/boards/api.ts`.
  - Delete/restore methods in `frontend/src/features/boards/hooks/useBoardElementMutations.ts` that reconcile conflicts and keep Yjs and DB in sync.
  - Multi-selection state in `frontend/src/features/boards/boardCanvas.hooks.ts` and selection rendering changes in `frontend/src/features/boards/components/BoardCanvasStage.tsx`.
  - Delete keyboard handling and confirmation in `frontend/src/routes/board.$boardId.tsx`.

Plan update note: Marked backend/frontend/docs milestones complete, added pending validation step, and recorded the pending-delete decision after implementing the feature.
