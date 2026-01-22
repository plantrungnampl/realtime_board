# Design and implement FR-ELM-04 Move Element (frontend-heavy)

This ExecPlan is a living document. The sections Progress, Surprises & Discoveries, Decision Log, and Outcomes & Retrospective must be kept up to date as work proceeds.

This ExecPlan must be maintained in accordance with `.agent/PLANS.md` from the repository root.

## Purpose / Big Picture

After this change, a user can move elements confidently using drag or arrow keys, with snapping to the grid when enabled and alignment guides that help line up elements with their neighbors. Movement feels responsive locally, shows live drag presence to collaborators, and persists reliably through the existing element update endpoint. A user can validate this by dragging a shape near another shape and seeing alignment guides and snap behavior, then nudging the element with arrow keys and watching its position update across two browser windows.

## Progress

- [x] (2026-01-11 08:35Z) Draft FR-ELM-04 design spec and create ExecPlan.
- [x] (2026-01-11 10:10Z) Confirm snapping/alignment/keyboard behavior choices with stakeholders.
- [x] (2026-01-11 10:35Z) Implement drag snapping + alignment guides in canvas interactions.
- [x] (2026-01-11 10:45Z) Implement keyboard nudging with debounced persistence and optional grid snapping.
- [x] (2026-01-11 10:55Z) Update documentation for FR-ELM-04 move behavior.
- [ ] Validate behavior end-to-end (two-window realtime move test).

## Surprises & Discoveries

- None yet.

## Decision Log

- Decision: Use `canvas_settings.snapToGrid` and `gridEnabled` to control snapping, with Alt/Option to bypass snapping during drag.
  Rationale: Respects board settings while still allowing temporary precision moves.
  Date/Author: 2026-01-11 / Codex
- Decision: Alignment snapping uses element bounds (left/center/right and top/middle/bottom) with a small threshold and visual guide lines.
  Rationale: Provides predictable alignment behavior with minimal UI complexity.
  Date/Author: 2026-01-11 / Codex
- Decision: Arrow keys move all selected elements, not just a primary selection.
  Rationale: Matches user expectation for multi-select actions and keeps keyboard movement consistent with delete.
  Date/Author: 2026-01-11 / Codex
- Decision: Snapping uses closest-wins between grid and alignment guides, with a slight priority to alignment when distances are equal.
  Rationale: Ensures the most intuitive snap target while still honoring alignment when nearly identical.
  Date/Author: 2026-01-11 / Codex
- Decision: Connectors are movable via drag and keyboard by translating start/end points; no auto-attachment routing in this scope.
  Rationale: Keeps MVP low-risk while treating connectors as movable elements with explicit geometry.
  Date/Author: 2026-01-11 / Codex

## Outcomes & Retrospective

- Pending.

## Context and Orientation

Element movement is currently handled in `frontend/src/features/boards/boardCanvas.hooks.ts` with `handleElementDragMove` and `handleElementDragEnd`. These update local override state during drag and commit to the Yjs document and REST persistence on drag end. The render path lives in `frontend/src/features/boards/components/BoardCanvasStage.tsx` (Konva shapes and drag events). Board settings such as `gridEnabled`, `gridSize`, and `snapToGrid` are surfaced via `useBoardMetadata` and `canvasSettings` in `frontend/src/features/boards/boardRoute.logic.ts`. Realtime presence for dragging is already sent via `scheduleDragPresence` and rendered as remote overrides in `BoardCanvasStage`.

In this plan, “snap to grid” means rounding positions to the nearest grid line when the setting is enabled. “Alignment guides” are temporary lines shown when the moving element’s edges/centers are close to other elements, and snapping adjusts the position to match those guides. “Arrow key nudge” means moving selected elements by small steps and persisting those changes after a brief idle delay.

## Plan of Work

First, extend canvas interactions to compute snapping and alignment during drag. Add helper functions in `frontend/src/features/boards/boardCanvas.hooks.ts` to compute element bounds, grid-snapped positions, and alignment guides. Update `handleElementDragMove` to apply snapping (grid and alignment) before setting local overrides and drag presence, and store the current guides in state so the stage can render them. Clear guides on drag end.

Second, render alignment guides in `frontend/src/features/boards/components/BoardCanvasStage.tsx` by accepting a new `snapGuides` prop and drawing Konva `Line` elements in world coordinates. The guides should appear above the grid and elements while dragging, and disappear otherwise.

Third, implement arrow key nudging in `frontend/src/routes/board.$boardId.tsx`. Use the existing global keydown handler to detect arrow keys, ignore inputs/text editors, and compute a delta based on `canvasSettings`. Update all selected elements in Yjs and debounce persistence via `persistElement` so repeated nudges do not flood the API. Apply grid snapping to the nudge step when enabled, using closest-wins between grid and alignment when both apply. Ensure connectors are moved by offsetting `properties.start` and `properties.end` plus recalculating `position_x`/`position_y` bounds.

Finally, update documentation to reflect the move behavior and validate the UX with a two-window realtime test.

## Concrete Steps

1. Add snapping + alignment helpers in `frontend/src/features/boards/boardCanvas.hooks.ts`:
   - Define types for `SnapGuide` and `SnapGuides` (horizontal/vertical line positions and spans).
   - Implement `getElementBounds(element)` to compute bounding boxes for rect-like shapes, text, drawings, and connectors.
   - Implement `applyGridSnap(position, gridSize)` and `applyAlignmentSnap(position, bounds, otherBounds, threshold)`.
   - Track `snapGuides` state in the hook, update it during drag, and clear it on drag end.
   - Accept `gridSize`, `gridEnabled`, and `snapToGrid` in the hook options.

2. Render guides in `frontend/src/features/boards/components/BoardCanvasStage.tsx`:
   - Add a `snapGuides` prop and draw lines when present.
   - Use a visible accent color (e.g., the selection stroke color) and a thin width scaled by `stageScale`.

3. Add arrow key nudging in `frontend/src/routes/board.$boardId.tsx`:
   - Extend `handleGlobalKeyDown` to handle arrow keys.
   - Compute step size: 1px (Shift = 10px), or `gridSize` when snapping is enabled.
   - Update selected elements in Yjs with `startHistoryEntry` and schedule a debounced persistence.
   - Ensure connectors shift `properties.start/end` and recompute `position_x/position_y` and bounds.

4. Update documentation:
   - Expand FR-ELM-04 notes in `doc/realtime-collaborative-board-design.md` with snapping, alignment, and keyboard rules.
   - Add a changelog entry in `docs/CHANGELOG.md` describing the FR-ELM-04 move design.

## Validation and Acceptance

Run the frontend (`cd frontend && npm run dev`) and open the same board in two windows. Drag a rectangle near another rectangle and confirm alignment guides appear and the element snaps to alignment and grid when enabled. Hold Alt/Option to bypass snapping during drag. Use arrow keys to nudge a selected element and verify the move persists after a short delay. Confirm the second window receives the move updates in realtime.

## Idempotence and Recovery

Snapping and alignment are frontend-only; no data migrations are required. Changes are safe to reapply by reloading the page and repeating the tests. If a step fails, revert only the affected file and retry.

## Artifacts and Notes

Record a short GIF or screenshot showing alignment guides and grid snapping after implementation.

## Interfaces and Dependencies

Key files and functions:
  - `frontend/src/features/boards/boardCanvas.hooks.ts`: add snapping helpers, `snapGuides` state, and update `handleElementDragMove`/`handleElementDragEnd`.
  - `frontend/src/features/boards/components/BoardCanvasStage.tsx`: render alignment guide lines based on `snapGuides`.
  - `frontend/src/routes/board.$boardId.tsx`: arrow key nudging, debounced persistence.
  - Uses existing `persistElement` mutation and Yjs updates; no new backend endpoints required.
