# Interaction & UX Enhancements (Smart Guides, Floating Toolbar, Quick Create)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `.agent/PLANS.md` and must be maintained in accordance with that file.

## Purpose / Big Picture

After this change, the board feels dramatically faster to use. When dragging shapes, smart alignment guides appear and objects snap smoothly into alignment (center/edge). When a user selects an element, a floating toolbar appears just above it to adjust fill/stroke quickly. And for rapid diagramming, plus handles appear on the selected shape to create a new connected shape in one click.

## Progress

- [x] (2026-01-20T02:05Z) Improve smart guides visibility and magnetic snapping behavior.
- [x] (2026-01-20T02:20Z) Add a floating selection toolbar for quick style edits.
- [x] (2026-01-20T02:35Z) Add quick-create (+) handles to spawn a new shape with a connector.
- [x] (2026-01-20T02:45Z) Update docs and verify UX behavior notes.

## Surprises & Discoveries

- Observation: Smart guide logic already exists (alignment + snap guides) but uses a low threshold and a single color.
  Evidence: `frontend/src/features/boards/elementMove.utils.ts` and `frontend/src/features/boards/components/BoardCanvasStage.tsx`.

## Decision Log

- Decision: Use creator id as the default “owned by me/others” filter until owner id is exposed in list responses.
  Rationale: No owner id is currently returned in list response payloads.
  Date/Author: 2026-01-20 (Codex).

- Decision: Quick-create defaults to rectangle shapes and connects edge-to-edge based on the clicked direction.
  Rationale: Consistent with diagramming workflows and avoids introducing new element types.
  Date/Author: 2026-01-20 (Codex).

## Outcomes & Retrospective

- Implemented snapping visibility improvements, floating selection toolbar, and quick-create connectors. Tests not run in this session.

## Context and Orientation

Smart guide snapping is implemented in `frontend/src/features/boards/elementMove.utils.ts` and rendered in `frontend/src/features/boards/components/BoardCanvasStage.tsx`. Board interactions and selection state live in `frontend/src/features/boards/boardCanvas.hooks.ts` and `frontend/src/routes/board.$boardId.tsx`. New UI overlays should be placed inside the board route’s canvas container, which is already `position: relative`.

## Plan of Work

First, tune snapping: pass a screen-space alignment threshold based on zoom, and render guide lines with stronger, distinct colors for vertical vs horizontal guides.

Next, implement a floating toolbar component that anchors to the selected element’s screen bounds. It exposes quick fill/stroke/stroke-width controls. The toolbar calls a new helper in the board route to apply style patches to selected elements and persist them.

Finally, implement quick-create handles: a small set of plus buttons around the selected element that create a new rectangle and a connector between the selected element and the new one. Update selection to the new element for rapid chaining.

## Concrete Steps

1. Update snapping
   - In `frontend/src/features/boards/boardCanvas.hooks.ts`, pass an alignment threshold scaled by `stageScale` to `resolveSnapPosition`.
   - In `frontend/src/features/boards/components/BoardCanvasStage.tsx`, render guides in distinct colors and increase stroke visibility.

2. Floating toolbar
   - Add `frontend/src/features/boards/components/BoardSelectionToolbar.tsx`.
   - In `frontend/src/routes/board.$boardId.tsx`, compute selected element bounds (world → screen), render the toolbar when a single editable element is selected, and apply style updates via `updateElement` + `persistElement`.

3. Quick-create handles
   - Add `frontend/src/features/boards/components/BoardQuickCreateHandles.tsx`.
   - In `frontend/src/routes/board.$boardId.tsx`, compute handle positions around the selected element and wire handlers to create a new rectangle and connector.

4. Update docs
   - Add changelog entries to `docs/CHANGELOG.md`.

## Validation and Acceptance

- Drag a shape near another: alignment guides appear and the moving shape snaps at center/edges.
- Select a shape: floating toolbar appears above it and color changes persist after reload.
- Click a plus handle: a new shape appears in that direction with a connector automatically drawn.

## Idempotence and Recovery

Changes are additive and safe to reapply. If a step fails, re-open the affected file and re-apply the edit. No database migrations are required.

## Artifacts and Notes

No artifacts yet.

## Interfaces and Dependencies

- `elementMove.utils.ts`: snapping logic (`resolveSnapPosition`)
- `boardCanvas.hooks.ts`: interaction handler integration
- `BoardCanvasStage.tsx`: guide rendering
- `board.$boardId.tsx`: selection state, overlay placement, persistence callbacks
- New overlay components: `BoardSelectionToolbar.tsx`, `BoardQuickCreateHandles.tsx`
