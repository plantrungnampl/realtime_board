# Design and implement FR-ELM-02 Edit Element (backend + frontend)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This ExecPlan must be maintained in accordance with `.agent/PLANS.md` from the repository root.

## Purpose / Big Picture

After this change, a user can modify an existing board element (position, size, rotation, style, and type-specific properties) and see those edits update in real time for other collaborators. Edits are validated on the backend with optimistic locking to prevent stale updates from silently overwriting newer ones. The user can prove the feature works by opening the same board in two browsers, editing an element (move, resize, update style), seeing both views update immediately, and observing that conflicting edits return a version conflict response.

## Progress

- [x] (2026-01-08 17:05Z) Draft FR-ELM-02 design spec and confirm scope with the user.
- [x] (2026-01-08 17:20Z) Implement backend edit endpoint with version checks and validation.
- [x] (2026-01-08 17:55Z) Implement frontend edit persistence flows with conflict alerts.
- [ ] Update docs and validate end-to-end behavior (completed: API docs + changelog; remaining: validation).

## Surprises & Discoveries

- None yet.

## Decision Log

- Decision: Use a REST `PATCH /api/boards/{board_id}/elements/{element_id}` endpoint to persist edits with an expected version check, while realtime updates continue to flow through Yjs.
  Rationale: This keeps undo/redo based on Yjs updates intact while ensuring the database record is updated with optimistic locking.
  Date/Author: 2026-01-08 / Codex
- Decision: Keep structural fields (z-index/layer/parent) out of the generic edit endpoint.
  Rationale: Structural mutations need stricter invariants and batch operations, so they should live in dedicated endpoints.
  Date/Author: 2026-01-08 / Codex

## Outcomes & Retrospective

- Pending.

## Context and Orientation

Elements are stored in the realtime Yjs document under the key `elements` as a `Y.Map<BoardElement>` in `frontend/src/features/boards/boardRoute.logic.ts`. Local edits are applied to the Yjs map and broadcast over WebSocket in `frontend/src/features/boards/realtime/protocol.ts`, with persistence of CRDT updates handled on the backend in `src/realtime/snapshot.rs`. The backend also stores a canonical `board.element` row for each element (created via `POST /api/boards/{board_id}/elements` in `src/api/http/elements.rs`). This plan adds an edit endpoint to update those rows with version checks and exposes a frontend persistence flow that saves the final state after an edit interaction.

The relevant backend modules are `src/models/elements.rs` (element model), `src/dto/elements.rs` (request/response DTOs), `src/repositories/elements.rs` (SQL access), `src/usecases/elements.rs` (validation + permissions), and `src/api/http/elements.rs` (handlers). Frontend element logic lives in `frontend/src/features/boards/boardRoute.logic.ts`, `frontend/src/features/boards/boardCanvas.hooks.ts`, and `frontend/src/features/boards/components/BoardCanvasStage.tsx`.

In this plan, “optimistic locking” means the client sends the element’s last known `version` in the edit request. The server only updates the row if the version matches; otherwise it returns HTTP 409 Conflict with the latest element payload.

## Plan of Work

First, define a new edit DTO in `src/dto/elements.rs` that includes an `expected_version` plus optional fields for position, size, rotation, style, properties, metadata, layer/parent ids, and z-index. Add a response type that mirrors `BoardElementResponse` but includes the updated `version` and timestamps. Ensure the DTO supports partial updates; for JSON fields, treat `null` as “no change” and use JSON merge (`style = style || $style`) for object patches.

Second, implement the repository update in `src/repositories/elements.rs` as an `update_element` function. It should issue a SQL `UPDATE` with a `WHERE id = $1 AND board_id = $2 AND version = $3` clause, increment `version` by 1, update `updated_at`, and return the updated row. If no row is updated, fetch the latest element to return for conflict handling.

Third, add an `ElementService::update_element` in `src/usecases/elements.rs`. Validate edit permissions via `BoardService::get_access_permissions`, validate position/size/rotation the same way creation does, and call the repository update. On version mismatch, return `AppError::Conflict` with a message and the latest element data in the response payload.

Fourth, wire the handler in `src/api/http/elements.rs` and route in `src/app/router.rs` for `PATCH /api/boards/{board_id}/elements/{element_id}`. Return HTTP 200 with the updated element or HTTP 409 when the version check fails.

Fifth, add a frontend API helper in `frontend/src/features/boards/api.ts` for `updateBoardElement`, and create a small mutation helper in `frontend/src/features/boards/hooks/useBoardElementMutations.ts` that accepts an element object and sends the patch with `expected_version`. On success, update the element version in the Yjs map. On conflict, show a toast and reconcile by applying the server’s element to the Yjs map using a “remote” origin so undo/redo remains consistent.

Sixth, update canvas interaction code in `frontend/src/features/boards/boardCanvas.hooks.ts` to call the persistence mutation at the end of edit interactions (mouse up for move/resize/connector changes). For text and sticky note edits, call the mutation in `commitTextEditor`. For style/property edits that happen in UI controls, call the mutation after the update is applied to the Yjs map. Keep real-time updates flowing via Yjs as they do today.

Finally, update documentation in `docs/api/API_DOCUMENTATION.md` to include the edit endpoint and add a changelog entry in `docs/CHANGELOG.md`. Validate by running the app and verifying edits are visible across two browser sessions, and that conflicting edits return a 409 response.

## Concrete Steps

1. Edit backend DTOs and add the update repository function.
   - Files: `src/dto/elements.rs`, `src/repositories/elements.rs`.

2. Add usecase and handler wiring.
   - Files: `src/usecases/elements.rs`, `src/api/http/elements.rs`, `src/app/router.rs`.

3. Add frontend API helper and mutation hook.
   - Files: `frontend/src/features/boards/api.ts`, `frontend/src/features/boards/hooks/useBoardElementMutations.ts` (new).

4. Integrate persistence calls into canvas interactions and text editor commits.
   - Files: `frontend/src/features/boards/boardCanvas.hooks.ts`, `frontend/src/features/boards/boardRoute.logic.ts`.

5. Update docs and validate.
   - Files: `docs/api/API_DOCUMENTATION.md`, `docs/CHANGELOG.md`.

## Validation and Acceptance

Start the backend with `cargo run` and the frontend with `cd frontend && npm run dev`. Open the same board in two browser windows. Move, resize, and edit text of an element. Both windows should update within a second. To validate optimistic locking, send a manual `PATCH` request with a stale `expected_version` and confirm the server returns `409 Conflict` with the latest element. Then refresh the board and confirm the element matches the server state.

## Idempotence and Recovery

All steps are additive. If a backend update fails midway, rerun the same commands after fixing errors; the route and DTO additions are safe to apply multiple times. If a frontend change introduces a regression, revert only the relevant file in the feature module and retry.

## Artifacts and Notes

Expected conflict response example (schematic):
  HTTP/1.1 409 Conflict
  {
    "error": { "code": "CONFLICT", "message": "Element version mismatch" },
    "data": { "...": "latest element payload" }
  }

## Interfaces and Dependencies

Backend additions:
  - `crate::dto::elements::UpdateBoardElementRequest` with fields:
    expected_version: i32
    position_x, position_y, width, height, rotation: Option<f64>
    style, properties, metadata: Option<serde_json::Value>
    z_index: Option<i32>
    layer_id, parent_id: Option<Uuid>
  - `crate::repositories::elements::update_element(pool, board_id, element_id, expected_version, patch) -> Result<BoardElement, AppError>`
  - `crate::usecases::elements::ElementService::update_element(...) -> Result<BoardElementResponse, AppError>`

Frontend additions:
  - `updateBoardElement(boardId, elementId, payload)` in `frontend/src/features/boards/api.ts`
  - `useBoardElementMutations` hook to persist edits and reconcile conflicts
  - Canvas interaction updates to call persistence on mouse up / text commit.

Plan update note: Initial ExecPlan created for FR-ELM-02 Edit Element based on current Yjs-driven collaboration and backend element persistence model.
