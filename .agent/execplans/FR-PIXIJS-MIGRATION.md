# PixiJS Canvas Migration (Konva → PixiJS)

This ExecPlan is a living document. The sections Progress, Surprises & Discoveries, Decision Log, and Outcomes & Retrospective must be kept up to date as work proceeds.

This plan is governed by /.agent/PLANS.md and must be maintained accordingly.

## Purpose / Big Picture

Replace the current Konva-based canvas renderer with PixiJS while preserving all board interactions (select, drag, resize, rotate, connectors with orthogonal routing, text editing, snap guides, zoom/pan, presence cursors, and quick-create). After this change, the board works the same from a user’s perspective, but rendering and interaction are handled by PixiJS and Konva is fully removed from the codebase. A user can open a board and perform all edits without noticing any missing behavior.

## Progress

- [x] 2026-01-22 13:30Z: Read docs/README.md and PLANS.md, identified PixiJS integration constraints.
- [x] 2026-01-22 14:10Z: Add PixiJS and transformer dependencies; remove Konva dependencies once Pixi renderer is wired.
- [x] 2026-01-22 14:30Z: Replace BoardCanvasStage with Pixi-based renderer (grid, background, elements, connectors).
- [x] 2026-01-22 14:30Z: Implement pointer interactions with Pixi federated events (select, drag, draw, pan).
- [x] 2026-01-22 14:35Z: Implement resize/rotate with Pixi transformer controls.
- [x] 2026-01-22 14:40Z: Remove Konva imports/usages and update docs/changelog.
- [ ] 2026-01-22 14:45Z: Validate parity and run build (lint done; build pending).

## Surprises & Discoveries

- Observation: Pixi React v8 requires explicit component registration via extend, and pointer events use federated events with eventMode on display objects.
  Evidence: Pixi React docs and PixiJS events docs.

## Decision Log

- Decision: Use @pixi/react with PixiJS v8 and @pixi-essentials/transformer for transform handles instead of custom resize/rotate math.  
  Rationale: Keeps interaction parity without reinventing complex transforms and supports rotation + scaling out of the box.  
  Date/Author: 2026-01-22 / Codex
- Decision: Target @pixi/react v8 to align with React 19 and the new JSX/extend API.  
  Rationale: Pixi React v7 advertises React 17/18 support; v8 provides React 19 support and new integration path.  
  Date/Author: 2026-01-22 / Codex

## Outcomes & Retrospective

Pending. Will be updated after milestones complete.

## Context and Orientation

The board canvas is currently rendered with Konva in frontend/src/features/boards/components/BoardCanvasStage.tsx. Interaction logic lives in frontend/src/features/boards/boardCanvas.hooks.ts and frontend/src/features/boards/boardCanvas/useElementTransformHandlers.ts. The board route passes these handlers into BoardCanvasStage via frontend/src/routes/board.$boardId.tsx. The canvas supports shapes, text, drawings, connectors, selection overlays, snap guides, presence cursors, zoom/pan, and text editor overlay. All of these must continue to work after the migration.

PixiJS integration uses @pixi/react, which requires registering Pixi display objects via extend. Interaction uses Pixi’s federated pointer events; display objects must have eventMode set to static/dynamic to receive events. Transformation handles are provided via @pixi-essentials/transformer, which adds a Transformer display object for resize/rotate. The transformer must be above the target in the scene graph to intercept input.

## Plan of Work

First, add PixiJS dependencies and transformer utilities while leaving the Konva renderer intact. Then create a Pixi-based BoardCanvasStage replacement that renders the same visuals and uses the existing interaction hooks. Replace Konva event wiring with Pixi federated pointer events, including middle mouse panning in Select tool. Add a transformer overlay for the primary selected element using @pixi-essentials/transformer to support resize/rotate with modifier behavior (keep ratio, centered scaling). Once the Pixi renderer is complete and wired, remove Konva usage, delete Konva components, and clean up dependencies. Update docs/CHANGELOG.md and any docs referencing Konva. Finally, validate the app by running lint/build and doing a manual interaction pass.

## Concrete Steps

Work from /Data/rust_project/Real-time_Board.

1) Add dependencies in frontend/package.json:
   - Add pixi.js and @pixi/react.
   - Add @pixi-essentials/transformer.
   - Keep Konva until Pixi renderer is wired.

2) Create a Pixi renderer component:
   - Replace frontend/src/features/boards/components/BoardCanvasStage.tsx with a Pixi implementation or create a new BoardPixiStage and swap usage in board.$boardId.tsx.
   - Register Pixi components with extend (Container, Graphics, Text, etc.).
   - Render background, grid, elements, ghost, snap guides, and cursors.
   - Use stageScale and stagePosition to apply view transforms.

3) Wire interaction events:
   - Replace KonvaEventObject usage with Pixi FederatedPointerEvent.
   - Use eventMode='static' for interactive objects.
   - Ensure stage-level pointer handlers call the existing boardCanvas.hooks handlers.

4) Add transformer overlay:
   - Instantiate @pixi-essentials/transformer, attach to selected element display object.
   - Configure rotateEnabled, scaleEnabled, keepRatio, centeredScaling consistent with existing modifier rules.
   - Map transformer drag events to handleElementTransform/End.

5) Remove Konva:
   - Delete Konva imports and Konva-specific code paths.
   - Remove konva and react-konva from dependencies.

6) Update docs:
   - docs/CHANGELOG.md: add PixiJS migration entry.
   - docs/README.md or other docs mentioning Konva.

7) Validate:
   - Run frontend lint/build.
   - Manual QA: select/drag/resize/rotate, connectors, text edit, quick-create, zoom/pan, presence cursors.

## Validation and Acceptance

Acceptance is met when a user can open a board, create shapes/text/connectors, select and transform elements (resize/rotate), pan/zoom the canvas, and see presence cursors with no errors or missing interactions. Lint/build should pass:

  cd /Data/rust_project/Real-time_Board/frontend
  npm run lint
  npm run build

Manual validation checklist:
 - Drag shapes and connectors; endpoints follow.
 - Resize/rotate selected shapes; handles behave as before.
 - Text editing overlay positions correctly during zoom/pan.
 - Middle mouse pan works in Select tool only.

## Idempotence and Recovery

Dependency changes can be re-run safely with npm install. If Pixi renderer fails to mount, temporarily re-enable Konva rendering by restoring BoardCanvasStage until the Pixi component renders correctly. Do not delete Konva until Pixi parity is confirmed.

## Artifacts and Notes

Keep changes localized to board canvas and interaction hooks. Document any new constraints from PixiJS or transformer library in docs/CHANGELOG.md.

## Interfaces and Dependencies

Dependencies:
- pixi.js (v8) and @pixi/react (React 19 compatible).
- @pixi-essentials/transformer for resize/rotate handles.

Key interfaces:
- BoardCanvasStage props must remain stable for BoardCanvasShell integration.
- Pixi transformer must attach to the selected element display object and emit transform updates that call handleElementTransform/End.
