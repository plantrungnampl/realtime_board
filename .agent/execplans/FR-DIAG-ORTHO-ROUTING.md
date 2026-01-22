# Implement Quick Diagramming with Orthogonal Routing + Obstacle Avoidance (Live)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan must be maintained in accordance with `.agent/PLANS.md`.

## Purpose / Big Picture

Users should be able to create diagrams quickly: clicking a “+” handle spawns a new node and an orthogonal connector that routes around other shapes. When nodes move or resize, connectors re-route live to avoid obstacles. Each connector has a per-edge toggle between “Straight” and “Orthogonal.” The result should feel similar to Miro/FigJam: fast flow for diagramming, clean right-angle wires, and instant feedback while dragging.

## Progress

- [x] (2026-01-20 15:15Z) Captured requirements and selected a routing approach (orthogonal A* with obstacle avoidance, live updates, per-connector toggle).
- [x] (2026-01-20 15:55Z) Defined connector data model additions (routing mode, points, bindings) in frontend types.
- [x] (2026-01-20 16:05Z) Implemented orthogonal routing utilities (graph build, obstacle checks, A* search, turn penalties).
- [x] (2026-01-20 16:20Z) Integrated routing into canvas rendering (connector points, bounds, selection overlays).
- [x] (2026-01-20 16:35Z) Integrated live routing updates during drag/resize + persist on drag end.
- [x] (2026-01-20 16:45Z) Added per-connector routing toggle in selection toolbar (i18n included).
- [x] (2026-01-20 16:50Z) Updated quick-create connector defaults to orthogonal + bindings.
- [x] (2026-01-20 17:00Z) Updated documentation (docs/CHANGELOG.md).
- [ ] Run manual validation scenario and optionally lint.

## Surprises & Discoveries

- Observation: Moving routing helpers above `clearLocalOverride` triggered a runtime TDZ error in React hooks.
  Evidence: Browser console `ReferenceError: Cannot access 'clearLocalOverride' before initialization` during board render.
  Resolution: Reordered hook declarations so `clearLocalOverride` is defined before it is referenced in `updateBoundConnectors`.

## Decision Log

- Decision: Use rectilinear (orthogonal) routing with obstacle avoidance via a sparse grid + A* search, with a light bend-penalty for cleaner paths.
  Rationale: Matches Miro/FigJam feel, supports live updates with manageable performance by limiting graph size to nearby obstacles.
  Date/Author: 2026-01-20 / Codex
- Decision: Obstacles include rect-like elements + Text; exclude Connector/Drawing from obstacle set.
  Rationale: Rect-like and text are the objects users expect wires to avoid; connectors/drawings would cause cycles and excessive routing cost.
  Date/Author: 2026-01-20 / Codex
- Decision: Per-connector routing toggle stored in connector properties; default to orthogonal for quick-create, straight for manual connector tool.
  Rationale: Users control style per edge; preserves current connector behavior for existing items.
  Date/Author: 2026-01-20 / Codex

## Outcomes & Retrospective

- Pending.

## Context and Orientation

This feature is frontend-only and lives in the React/Konva canvas implementation. The board uses CRDT (Yjs) for element state; do not introduce backend dual-writes. Key files:

- `frontend/src/features/boards/types.ts`: Type definitions for board elements, including `ConnectorElement`.
- `frontend/src/features/boards/components/BoardCanvasStage.tsx`: Konva rendering for elements; currently draws connectors as a single segment from start → end.
- `frontend/src/features/boards/boardCanvas.hooks.ts`: Interaction logic (drag/resize, local overrides, snap guides, selection).
- `frontend/src/features/boards/elementMove.utils.ts`: Geometry helpers including element bounds.
- `frontend/src/features/boards/boardRoute/elements.ts`: Element factory for new connectors.
- `frontend/src/features/boards/components/BoardSelectionToolbar.tsx`: Floating toolbar near selection.
- `frontend/src/routes/board.$boardId.tsx`: Board UI wiring (selection/toolbar/quick-create).
- `frontend/src/features/boards/realtime/elementCrdt.ts`: CRDT patch helpers for element properties.

Definitions used in this plan:

- “Orthogonal routing”: a path composed of horizontal/vertical segments only.
- “Obstacle avoidance”: the path must not intersect rectangular bounds of other elements (with padding).
- “Bindings”: connector endpoints attached to elements so the connector moves with the element.
- “Live update”: route re-computed during drag/resize, not just on drop.

## Plan of Work

First, extend connector data to store routing metadata, optional polyline points, and optional bindings to elements. Then implement routing utilities that take start/end anchor points and a set of rectangular obstacles, build a sparse orthogonal graph, and run A* to return a polyline. Next, update rendering and bounds to use polyline points when available. Then wire live routing into the interaction layer: when a bound element moves or resizes, recompute routes for connected connectors, update local overrides for visual smoothness, and persist connector updates at drag end. Add a per-connector routing toggle to the floating selection toolbar and ensure quick-create connectors default to orthogonal routing with bindings. Finally, update documentation and validate behavior in the UI.

## Concrete Steps

1) Update connector types and CRDT property handling.
   - Edit `frontend/src/features/boards/types.ts` to extend `ConnectorElement.properties` with optional routing metadata and points. Proposed shape:
     - `points?: number[]` storing [x1, y1, x2, y2, ...] in board coordinates.
     - `routing?: { mode: "straight" | "orthogonal"; lock?: boolean }`.
     - `bindings?: { start?: { elementId: string; side: "top" | "right" | "bottom" | "left" }; end?: { elementId: string; side: "top" | "right" | "bottom" | "left" } }`.
   - In `frontend/src/features/boards/realtime/elementCrdt.ts`, ensure `properties` patching allows new keys (no schema stripping). The existing record-normalization should accept these optional properties; add tests or small guards if needed.

2) Implement routing utilities.
   - Create `frontend/src/features/boards/routing/orthogonalRouter.ts`.
   - Export a function `routeOrthogonalPath(start, end, obstacles, options)` returning `{ points: number[]; bounds: { left; top; right; bottom } }`.
   - Obstacles are rectangles `{ left; top; right; bottom }` with padding (e.g. 12 px).
   - Build candidate X/Y lines from: start/end coords, obstacle edges ± padding. Deduplicate and sort.
   - Build nodes at X/Y intersections not inside obstacles; connect adjacent nodes horizontally/vertically when the segment does not intersect any obstacle.
   - Use A* with Manhattan heuristic and add a small bend penalty (e.g. +20 per direction change) to favor fewer turns.
   - If no path found, fall back to a simple 2‑segment orthogonal path or straight line.
   - Keep graph size bounded by considering obstacles within an expanded bounding box around start/end (e.g. margin 300 px).

3) Integrate routing into element geometry helpers.
   - Update `frontend/src/features/boards/elementMove.utils.ts` to compute connector bounds from `points` when present, else from start/end.
   - Update `translateElement` for connectors to offset all points and start/end consistently.
   - Update `frontend/src/features/boards/components/BoardCanvasStage.tsx` to render connectors using `points` when present. Convert to points relative to start for the Konva Group, or render absolute points with a non-translated group; keep drag behavior consistent.
   - Update connector bounds in `BoardCanvasStage.tsx` selection overlay to use points for hit/selection bounds.

4) Add routing + bindings in canvas interaction logic.
   - In `frontend/src/features/boards/boardCanvas.hooks.ts`, create helpers to:
     - Resolve connector anchor positions from bindings (midpoint of the chosen side of the bound element).
     - Build obstacle list from render elements (rect-like + text), excluding the connector itself and the two bound elements.
     - Compute a routed polyline when `routing.mode === "orthogonal"`.
   - During element drag/resize: for any connectors bound to that element, recompute route (throttled via requestAnimationFrame or 32–50ms debounce) and update local overrides for those connectors.
   - On drag/resize end: persist updated connector start/end/points and bounds to Yjs using `updateElement` + `persistElement`.
   - Ensure the routing computation uses board coordinates (not stage coords) so it remains stable under zoom.

5) Add per-connector routing toggle UI.
   - Extend `frontend/src/features/boards/components/BoardSelectionToolbar.tsx` to optionally render a routing toggle when the selected element is a connector.
   - The toggle should allow switching between Straight and Orthogonal; on change, update connector properties and re-route immediately (orthogonal) or clear points (straight).
   - Add i18n strings in `frontend/src/i18n.ts` for labels/tooltips.

6) Update quick-create behavior to use bindings + orthogonal routing by default.
   - In `frontend/src/routes/board.$boardId.tsx`, when creating the connector for quick-create, set `properties.routing.mode = "orthogonal"` and define `bindings.start` (selected element side) and `bindings.end` (new element side).
   - After creating the new element, compute the initial route and persist the connector with points and bounds.

7) Documentation updates.
   - Update `docs/CHANGELOG.md` with a new version entry describing quick diagramming + orthogonal routing.
   - If needed, add a short note in `doc/realtime-collaborative-board-design.md` under functional requirements describing orthogonal routing and per-edge toggle.

## Validation and Acceptance

Manual validation (frontend):

1) Start frontend dev server from repo root:
   - `cd frontend && npm run dev`
2) Open a board and create two shapes. Use quick-create “+” to spawn a new node.
   - Expected: a connector appears with right-angle segments, avoiding other shapes.
3) Drag one shape around other obstacles.
   - Expected: connector re-routes live and does not overlap obstacles.
4) Select the connector and toggle Straight vs Orthogonal.
   - Expected: Straight shows a single segment; Orthogonal shows right-angle path.
5) Resize a bound shape.
   - Expected: connector re-routes live to the new anchor points.

Optional checks:
- `cd frontend && npm run lint` should pass.

## Idempotence and Recovery

Changes are additive and safe to apply repeatedly. If routing performance is poor or a bug is found, the toggle can be switched to Straight to bypass routing while debugging. If a step fails, revert only the last touched file and re-apply; no data migrations are required.

## Artifacts and Notes

Keep any routing debug output (if temporarily added) removed before finalizing. If you add a debug flag for routing visualization, document it here and keep it disabled by default.

## Interfaces and Dependencies

Types to exist at end:

- In `frontend/src/features/boards/types.ts`:
  - `ConnectorElement.properties.points?: number[]`
  - `ConnectorElement.properties.routing?: { mode: "straight" | "orthogonal"; lock?: boolean }`
  - `ConnectorElement.properties.bindings?: { start?: { elementId: string; side: "top" | "right" | "bottom" | "left" }; end?: { elementId: string; side: "top" | "right" | "bottom" | "left" } }`

Routing API:

- In `frontend/src/features/boards/routing/orthogonalRouter.ts`:
  - `export function routeOrthogonalPath(start: Point, end: Point, obstacles: Rect[], options?: { padding?: number; margin?: number; bendPenalty?: number }): { points: number[]; bounds: Rect }`

Canvas integration:

- `BoardCanvasStage.tsx` must render connector polylines based on `points` if present.
- `elementMove.utils.ts` must compute bounds and translation using connector points.
- `boardCanvas.hooks.ts` must recompute routed connectors during drag/resize and persist on end.

---

Plan update note: Marked routing implementation tasks as complete and noted remaining validation + doc checks (2026-01-20).
