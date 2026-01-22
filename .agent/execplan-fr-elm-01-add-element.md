# Design and implement FR-ELM-01 Add Element (11 element types + drag-to-create + z-index + realtime)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This ExecPlan must be maintained in accordance with `.agent/PLANS.md` from the repository root.

## Purpose / Big Picture

Users should be able to add any of the 11 element types to a board by selecting a tool and dragging on the canvas. The element appears immediately, has sane defaults, is layered above older elements, and is broadcast in real time to all collaborators. This change makes the board usable beyond the current rectangle/circle/drawing/text-only state. Success is visible by opening two browsers on the same board, creating a new element, and seeing it appear in both sessions with expected size and stacking order.

## Progress

- [x] (2026-01-08 15:30Z) Draft full design and plan for Add Element (this document).
- [x] (2026-01-08 15:45Z) Implement backend element creation endpoint (models, DTOs, repository, usecase, route).
- [x] (2026-01-08 16:35Z) Implement frontend element model expansion (11 types, defaults, z-index ordering).
- [x] (2026-01-08 16:35Z) Update canvas tool UX and drag-to-create flows for all element types.
- [x] (2026-01-08 16:35Z) Update canvas rendering for new element placeholders.
- [x] (2026-01-08 16:10Z) Ensure realtime sync persists and broadcasts new elements using Yjs updates.
- [x] (2026-01-08 16:40Z) Update docs and provide validation steps.

## Surprises & Discoveries

- None yet.

## Decision Log

- Decision: Add a backend REST endpoint to create elements and persist them in `board.element` as a backend-first foundation.
  Rationale: The user requested backend-first implementation; this establishes validation, z-index assignment, and audit logging while frontend integration is developed.
  Date/Author: 2026-01-08 / Codex
- Decision: Maintain a `z_index` field on each element and compute it client-side as `max_z_index + 1` at creation time, while sorting by `(z_index, created_at, id)` for deterministic rendering.
  Rationale: This avoids introducing a second CRDT structure for ordering while still providing stable stacking behavior across clients; backend mirrors the same rule.
  Date/Author: 2026-01-08 / Codex

## Outcomes & Retrospective

- Pending. This will be filled after implementation and validation.

## Context and Orientation

Elements are stored in a Yjs document (`Y.Doc`) under the key `elements` as a `Y.Map<BoardElement>` in `frontend/src/features/boards/boardRoute.logic.ts`. Changes to this map are broadcast over WebSocket (`/ws/boards/{boardId}`) and persisted as update logs and snapshots on the backend (see `src/realtime/snapshot.rs` and `src/repositories/realtime.rs`). The backend now exposes a REST endpoint `POST /api/boards/{board_id}/elements` that inserts into `board.element` with validation and auto z-index.

Element rendering happens in `frontend/src/features/boards/components/BoardCanvasStage.tsx`. Element creation (drag-to-create) and mouse handling are in `frontend/src/features/boards/boardCanvas.hooks.ts` and `frontend/src/features/boards/boardRoute.logic.ts` via `createElementForTool`.

Element types exist in the database schema as the enum `board.element_type` (see `schema.md`), with 11 values: `shape`, `text`, `sticky_note`, `image`, `video`, `frame`, `connector`, `drawing`, `embed`, `document`, `component`. These should be mirrored in frontend types and defaults.

## Plan of Work

First, add backend element support by creating `src/models/elements.rs`, `src/dto/elements.rs`, `src/repositories/elements.rs`, and `src/usecases/elements.rs`, then wiring `src/api/http/elements.rs` and `src/app/router.rs` for `POST /api/boards/{board_id}/elements`. This validates dimensions/rotation, checks edit permissions, assigns `z_index = max + 1`, and inserts into `board.element`.

Second, expand the frontend element type system in `frontend/src/features/boards/types.ts` to cover all 11 element types. Introduce a shared `BoardElementBase` with fields needed for layering and identity: `id`, `board_id`, `element_type`, `position_x`, `position_y`, `width`, `height`, `rotation`, `z_index`, `created_by`, and `created_at`. For each element type, define a `properties` shape consistent with the schema comments in `schema.md`. Keep properties minimal but sufficient to render a placeholder.

Second, add a permissions-safe creation pipeline in `frontend/src/features/boards/boardRoute.logic.ts`. Implement `createElementForTool` variants for each tool, setting initial size, position, z-index, and type-specific defaults. For `image`, `video`, `embed`, `document`, and `component`, create a placeholder element with default size and empty content; the UI can prompt for a URL or asset after placement. For `connector`, create a placeholder with `startPoint` at the drag start and `endPoint` at the drag end; if the user clicks without drag, create a short line and allow editing later. For `frame`, use a larger default size and `clipContent: true`.

Third, manage z-index in the Yjs map. On element creation, compute `max_z_index` across the current elements in memory and set `z_index = max + 1`. When rendering, sort elements by `(z_index, created_at, id)` before mapping to Konva nodes in `BoardCanvasStage` so z-index is consistent even if duplicate values arise.

Fourth, extend the tool palette in `frontend/src/features/boards/boardRoute.logic.ts` and `frontend/src/features/boards/components/BoardToolbar.tsx` to include all element types. Use the existing tool pattern (tool id + icon + label). For element types without icons, pick a Lucide icon available in the repo. Ensure tools are disabled when `canEdit` is false.

Fifth, update `frontend/src/features/boards/boardCanvas.hooks.ts` to handle the new tools in pointer down/move/up. For draggable shapes and frames, reuse the existing drag-to-size behavior. For text and sticky notes, create on click and open the text editor overlay immediately. For drawing, keep the existing freehand behavior. For image/video/embed/document/component, place a default size on click and open a lightweight configuration prompt (for now, a modal or sidebar can be described and stubbed to avoid blocking).

Sixth, update `frontend/src/features/boards/components/BoardCanvasStage.tsx` to render new element types. Start with minimal visuals: sticky note as a rect with rounded corners and text, image/video/document/embed/component as a framed placeholder (rect + label), connector as a line/arrow, frame as a dashed rectangle with title.

Finally, align docs by adding a short section in `docs/api/API_DOCUMENTATION.md` under Realtime explaining the Yjs `elements` map schema and z-index behavior. If any backend changes are required (none anticipated for Add Element), document them as well.

## Concrete Steps

Run these commands from the repository root (`/Data/rust_project/Real-time_Board`) as needed.

1) Update backend element API and models.
   - Edit `src/models/elements.rs`, `src/dto/elements.rs`, `src/repositories/elements.rs`.
   - Edit `src/usecases/elements.rs`, `src/api/http/elements.rs`, `src/app/router.rs`.

2) Update frontend types and tool definitions.
   - Edit `frontend/src/features/boards/types.ts`.
   - Edit `frontend/src/features/boards/boardRoute.logic.ts`.

3) Update canvas behavior and rendering.
   - Edit `frontend/src/features/boards/boardCanvas.hooks.ts`.
   - Edit `frontend/src/features/boards/components/BoardCanvasStage.tsx`.

4) Update docs.
   - Edit `docs/api/API_DOCUMENTATION.md` with the new element schema notes.

5) Validate.
   - In `frontend/`, run `npm run lint` and `npm run build`.
   - In another terminal, run `npm run dev` to interactively verify.

Expected outcomes:
   - Selecting each tool and dragging on the canvas creates a new element.
   - New elements appear on top of older elements (by z-index).
   - A second browser connected to the same board sees the new element instantly.

## Validation and Acceptance

Start the backend with `cargo run`. To validate the backend endpoint, run a request:

    curl -X POST http://localhost:3000/api/boards/<board_id>/elements \
      -H "Authorization: Bearer <jwt>" \
      -H "Content-Type: application/json" \
      -d '{"element_type":"shape","position_x":10,"position_y":10,"width":100,"height":80,"rotation":0,"properties":{"shapeType":"rectangle"}}'

Expect a `201` response with `z_index` and timestamps.

Then start the frontend with `cd frontend && npm run dev`. Open the same board in two browser windows (or two users). For each of the 11 element tools, drag on the canvas to create an element. Verify:

1) The element appears with a default size and styling.
2) The element appears above previously created elements.
3) The element appears on the second client within a second.
4) Non-edit users cannot create elements (attempted creates are ignored).

If any tool creates no element, inspect the console for errors and confirm the tool id is handled in `createElementForTool`.

## Idempotence and Recovery

All changes are additive and safe to apply multiple times. If a tool behaves incorrectly, revert the specific tool handler without affecting others. If realtime sync fails, confirm the WebSocket connection is open and Yjs updates are emitted; the feature can fall back to local-only behavior for debugging.

## Artifacts and Notes

Example expected console-free behavior:
   - Dragging a frame creates a large rectangle with a dashed border.
   - Creating a sticky note opens a text editor prompt with a yellow background.
   - An image placeholder appears with a label “Image” until a URL/asset is provided.

## Interfaces and Dependencies

Frontend:
  - `frontend/src/features/boards/types.ts` must export the full `BoardElement` union covering all 11 types.
  - `frontend/src/features/boards/boardRoute.logic.ts` must map tool ids to element constructors.
  - `frontend/src/features/boards/boardCanvas.hooks.ts` must handle pointer flows for new tools.
  - `frontend/src/features/boards/components/BoardCanvasStage.tsx` must render new element visuals.

Backend:
  - `POST /api/boards/{board_id}/elements` is implemented in `src/api/http/elements.rs` and calls `ElementService::create_element`.
  - `ElementService` checks `BoardService::get_access_permissions` for `can_edit` and validates dimensions/rotation.
  - `elements` repository inserts into `board.element` and assigns `z_index`.

Docs:
  - `docs/api/API_DOCUMENTATION.md` should mention the `elements` map schema and z-index behavior.

Plan update note: Initial ExecPlan created to design and implement FR-ELM-01 based on current Yjs map architecture and schema element types.
Plan update note: Updated to include backend REST endpoint per backend-first request, and validation flow for element creation.
