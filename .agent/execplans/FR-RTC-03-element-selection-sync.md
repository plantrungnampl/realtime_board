# Implement FR-RTC-03 Element Selection Sync (Frontend)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan must be maintained in accordance with `.agent/PLANS.md` in the repository root.

## Purpose / Big Picture

After this change, collaborators can see each other's selected elements and editing locks in real time. Selected elements show a color-coded outline and the selecting user’s name, and elements under active edits are soft-locked so other users cannot drag, resize, or delete them. You can see it working by opening the same board in two browsers: selecting or dragging an element in one tab highlights it in the other tab and blocks edits until the selection or edit ends.

## Progress

- [x] (2026-01-18T15:10Z) Capture current awareness/selection architecture and decide on awareness payload format.
- [x] (2026-01-18T15:15Z) Extend frontend awareness state + local update functions (selection + editing).
- [x] (2026-01-18T15:22Z) Propagate selection + lock info into canvas interactions and block edits on locked elements.
- [x] (2026-01-18T15:30Z) Render remote selection overlays and lock indicators in the canvas.
- [ ] (2026-01-18T15:32Z) Update docs changelog and validate behavior manually.

## Surprises & Discoveries

- None yet.

## Decision Log

- Decision: Use Yjs awareness (`yjs:awareness`) to carry selection and editing state; do not implement legacy `element:select` events.
  Rationale: Awareness is already broadcast by the WS layer and is the standard for cursor/selection state in Yjs.
  Date/Author: 2026-01-18 / Codex

## Outcomes & Retrospective

- Pending implementation.

## Context and Orientation

The realtime collaboration frontend lives under `frontend/src/features/boards`. The hook `frontend/src/features/boards/boardRoute.logic.ts` owns the Yjs document, awareness, and websocket lifecycle. Local canvas interactions (selection, drag, transform) live in `frontend/src/features/boards/boardCanvas.hooks.ts`, and canvas rendering is handled by `frontend/src/features/boards/components/BoardCanvasStage.tsx`. The board route component that wires everything together is `frontend/src/routes/board.$boardId.tsx`. The realtime protocols are documented in `doc/realtime-collaborative-board-design.md` and `doc/websocket-events-specification.md`, and all code changes must be reflected in `docs/CHANGELOG.md`.

In this plan:

- “Awareness” refers to Yjs awareness state, a shared map of per-client metadata that already exists in `useBoardRealtime`.
- “Selection presence” is a derived view of awareness containing per-user selection arrays and optional editing locks.
- “Soft lock” means the UI blocks drag/resize/delete for elements that another user is actively editing.

## Plan of Work

First, extend the awareness state type in `frontend/src/features/boards/boardRoute.logic.ts` to carry `selection`, `selection_updated_at`, and `editing`. Add helper functions to normalize selections, apply throttled updates (max 10 per second), and derive remote selection presence and lock data from awareness. Ensure stale selections (older than 60 seconds) are ignored.

Next, expose new values and callbacks from `useBoardRealtime`: a `selectionPresence` array for rendering, a `lockedElements` map for guarding edits, a `scheduleSelectionUpdate` function for local selection changes, and a `setEditingPresence` function for text edits. Update `scheduleDragPresence` to set `editing` during drag/resize and clear it on end.

Then update `frontend/src/features/boards/boardCanvas.hooks.ts` to accept the new callbacks and lock map. Add an effect to push selection changes through `scheduleSelectionUpdate`, and short-circuit drag/transform/delete operations when a target element is locked by another user.

Update `frontend/src/routes/board.$boardId.tsx` to wire the new data through: pass `selectionPresence` to `BoardCanvasStage`, pass lock data and selection callbacks to `useBoardCanvasInteractions`, and guard delete actions against locked elements.

Finally, add a remote selection overlay rendering path in `frontend/src/features/boards/components/BoardCanvasStage.tsx`. Use a bounding box overlay for each remote selection, color-coded per user, and add a small name tag near the selection. For lock indication, use a thicker outline when the selection entry includes `editing`.

Update `docs/CHANGELOG.md` with an implementation entry for FR-RTC-03. Validate by running the dev server and observing two clients selecting and editing the same element.

## Concrete Steps

1. Edit `frontend/src/features/boards/types.ts` to add the selection/lock types used by the canvas and realtime hooks.
2. Edit `frontend/src/features/boards/boardRoute.logic.ts`:
   - Extend `AwarenessState`.
   - Add selection throttle helpers.
   - Derive `selectionPresence` + `lockedElements`.
   - Expose selection + editing callbacks from `useBoardRealtime`.
3. Edit `frontend/src/features/boards/boardCanvas.hooks.ts` to:
   - Accept new props.
   - Push selection changes to awareness.
   - Block drag/transform for locked elements.
4. Edit `frontend/src/routes/board.$boardId.tsx` to:
   - Wire new realtime props.
   - Block delete for locked elements.
5. Edit `frontend/src/features/boards/components/BoardCanvasStage.tsx` to:
   - Render remote selection overlays with labels.
6. Update `docs/CHANGELOG.md` with a FR-RTC-03 implementation entry.

## Validation and Acceptance

Run the frontend and open the same board in two browser windows. In window A, select an element: window B should show a colored selection outline and the selector’s name. When window A drags or resizes the element, window B should display a lock-style outline and should not allow edits until the drag ends. If selection stops for more than 60 seconds, the remote highlight should disappear. Manual testing steps:

    cd frontend
    npm run dev

Acceptance is met when selection overlays and edit locks are visible across clients and edits are blocked for locked elements.

## Idempotence and Recovery

All edits are frontend-only and safe to re-apply. If a change is incorrect, revert the affected file(s) and re-run `npm run dev` to confirm the behavior returns to the previous baseline.

## Artifacts and Notes

None yet.

## Interfaces and Dependencies

This implementation relies on existing Yjs awareness in `frontend/src/features/boards/boardRoute.logic.ts` and the Konva canvas in `frontend/src/features/boards/components/BoardCanvasStage.tsx`. It introduces no new external dependencies. The new types should live in `frontend/src/features/boards/types.ts`:

    export type SelectionEditMode = "drag" | "resize" | "text";

    export type SelectionPresence = {
      user_id: string;
      user_name: string;
      avatar_url?: string | null;
      color: string;
      element_ids: string[];
      editing?: { element_id: string; mode: SelectionEditMode } | null;
    };

When finished, ensure the `useBoardRealtime` hook returns `selectionPresence`, `lockedElements`, `scheduleSelectionUpdate`, and `setEditingPresence`.
