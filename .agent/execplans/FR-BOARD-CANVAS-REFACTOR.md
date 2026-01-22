# Refactor boardCanvas.hooks.ts into focused modules

This ExecPlan is a living document. The sections Progress, Surprises & Discoveries, Decision Log, and Outcomes & Retrospective must be kept up to date as work proceeds.

PLANS.md lives at .agent/PLANS.md and this plan must be maintained in accordance with it.

## Purpose / Big Picture

The board canvas hook currently mixes input handling, connector routing, element normalization, and viewport grid math in a single large file. The goal is to split the file into smaller, clearly scoped modules without changing behavior so the canvas code is easier to read, test, and maintain. Users should see identical canvas behavior before and after this refactor.

## Progress

- [x] (2026-01-21 23:05Z) Created boardCanvas helper modules for element utilities, connector routing, and viewport hook.
- [x] (2026-01-21 23:10Z) Updated boardCanvas.hooks.ts to import the new helper modules and re-export the viewport hook.
- [x] (2026-01-21 23:25Z) Extracted zoom, hit-testing, and transform handlers into dedicated boardCanvas hooks.
- [x] (2026-01-21 23:25Z) Updated docs/CHANGELOG.md with board canvas refactor entries.
- [x] (2026-01-21 23:45Z) Reviewed imports and ran bun build; build succeeded with chunk size warning.
- [x] (2026-01-21 23:55Z) Ran bun lint and resolved hook/dep warnings across canvas and related hooks.

## Surprises & Discoveries

- Observation: Build warns about chunks over 500 kB after minification.
  Evidence: bun run build output warns about chunk size limit.

## Decision Log

- Decision: Keep useBoardViewport available through boardCanvas.hooks.ts via re-export to avoid updating imports outside the canvas area.
  Rationale: Minimizes churn and keeps external API stable while still splitting implementation.
  Date/Author: 2026-01-21 / Codex

## Outcomes & Retrospective

- Pending completion. Will summarize after validation.

## Context and Orientation

The canvas interactions live in frontend/src/features/boards/boardCanvas.hooks.ts. It handles pointer interactions (draw/move/select), text editing overlay updates, connector routing updates, and zoom/pan state. The routing logic depends on element bounds and the orthogonal router in frontend/src/features/boards/routing/orthogonalRouter.ts. The viewport grid rendering is a small helper that uses stage scale/position and grid settings.

New helper modules are placed under frontend/src/features/boards/boardCanvas/:

- elementUtils.ts: element normalization helpers and shape classification.
- connectorRouting.ts: connector routing logic and orthogonal point normalization.
- useBoardViewport.ts: grid line calculation for the viewport.

## Plan of Work

First, extract element-related helpers (shape classification, normalization, discard checks) into elementUtils.ts. Next, extract connector routing logic and point normalization into connectorRouting.ts, keeping the public function signature compatible with the current call sites. Then move the viewport grid hook into useBoardViewport.ts and re-export it from boardCanvas.hooks.ts to preserve existing imports. Finally, clean up boardCanvas.hooks.ts (imports and dependencies), update docs/CHANGELOG.md, and validate with lint or a TypeScript check.

## Concrete Steps

Work from the repository root:

1) Create frontend/src/features/boards/boardCanvas/elementUtils.ts with helpers used by boardCanvas.hooks.ts.
2) Create frontend/src/features/boards/boardCanvas/connectorRouting.ts that exports applyConnectorRouting, arePointsEqual, isNonOrthogonalPoints, and normalizeOrthogonalPoints.
3) Move useBoardViewport into frontend/src/features/boards/boardCanvas/useBoardViewport.ts and re-export from boardCanvas.hooks.ts.
4) Update frontend/src/features/boards/boardCanvas.hooks.ts to import the new helpers and remove the inlined versions.
5) Update docs/CHANGELOG.md with a refactor entry.

## Validation and Acceptance

Run frontend lint or typecheck from frontend/ if time permits:

  cd frontend
  npm run lint

Acceptance is visual and behavioral: opening a board should show identical canvas interactions (draw/move/select, connector routing updates, zoom, grid rendering) and there should be no new console errors.

## Idempotence and Recovery

All steps are additive and safe to repeat. If behavior regresses, revert the new helper modules and inline the previous functions back into boardCanvas.hooks.ts.

## Artifacts and Notes

Key files modified or added:

- frontend/src/features/boards/boardCanvas.hooks.ts
- frontend/src/features/boards/boardCanvas/elementUtils.ts
- frontend/src/features/boards/boardCanvas/connectorRouting.ts
- frontend/src/features/boards/boardCanvas/useBoardViewport.ts
- docs/CHANGELOG.md

## Interfaces and Dependencies

- elementUtils.ts exports:
  - isRectLikeElement(element: BoardElement): boolean
  - shouldDiscardElement(element: BoardElement): boolean
  - normalizeRotation(value: number): number
  - normalizeRectElement(element: BoardElement): BoardElement
  - normalizeConnectorBounds(element: BoardElement): BoardElement
  - cloneBoardElement<T extends BoardElement>(element: T, overrides: Partial<T>): T

- connectorRouting.ts exports:
  - arePointsEqual(left?: number[], right?: number[], epsilon?: number): boolean
  - normalizeOrthogonalPoints(points?: number[]): number[]
  - isNonOrthogonalPoints(points?: number[]): boolean
  - applyConnectorRouting(connector: BoardElement, snapshot: BoardElement[], elementIndex: Map<string, BoardElement>): BoardElement

- useBoardViewport.ts exports:
  - useBoardViewport(options: { dimensions; stageHeight; stageScale; stagePosition; gridEnabled; gridSize }): { gridLines; worldRect }

Update 2026-01-21: Marked docs update complete and consolidated validation progress in the plan.

Update 2026-01-21: Added zoom, hit-test, and transform handler hook splits; changelog updated.

Update 2026-01-21: Marked build validation complete and noted chunk size warning.
Update 2026-01-21: Fixed lint warnings after refactor and recorded lint pass.
