# Refactor board.$boardId Route Into Smaller Components

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This ExecPlan follows /.agent/PLANS.md in the repository root and must be maintained accordingly.

## Purpose / Big Picture

The board route file has grown large enough that reasoning about UI structure and state flow is costly. After this refactor, the board page should behave identically, but the JSX and UI-only elements will be split into smaller components so future changes are safer and faster. The outcome is visible by loading a board and verifying the header, canvas, quick-create, delete dialog, and toasts all still work as before with no visual regressions.

## Progress

- [x] 2026-01-21 14:05Z — Created ExecPlan and reviewed docs/README.md + frontend/AGENTS.md requirements.
- [x] 2026-01-21 14:28Z — Identify split boundaries in frontend/src/routes/board.$boardId.tsx and list new component files.
- [x] 2026-01-21 14:28Z — Extract BoardDeleteDialog component and wire into board.$boardId.tsx.
- [x] 2026-01-21 14:28Z — Extract UndoDeleteToast component into features/boards/components and update imports.
- [x] 2026-01-21 14:28Z — Extract BoardCanvasShell component that encapsulates toolbar + overlays + stage.
- [x] 2026-01-21 14:28Z — Update board.$boardId.tsx to use new components, remove duplicated JSX.
- [x] 2026-01-21 14:28Z — Update docs/CHANGELOG.md to reflect refactor.
- [x] 2026-01-21 14:45Z — Move board status screen selection into boardRoute/boardStatus.tsx and hotkeys into boardRoute/hooks/useBoardHotkeys.ts.
- [x] 2026-01-21 14:45Z — Move clamp helper to boardRoute.utils and workspace-invite error check to boardRoute/errors.ts.
- [x] 2026-01-21 14:45Z — Update docs/CHANGELOG.md with helper split entry.
- [x] 2026-01-21 15:05Z — Extract quick-create ghost/handler logic into boardRoute/hooks/useQuickCreate.ts.
- [x] 2026-01-21 15:05Z — Extract delete/undo selection flow into boardRoute/hooks/useDeleteSelection.ts.
- [x] 2026-01-21 15:05Z — Update docs/CHANGELOG.md with additional refactor entry.
- [x] 2026-01-21 15:30Z — Extract selection UI state into boardRoute/hooks/useSelectionUi.ts.
- [x] 2026-01-21 15:30Z — Extract presence/sync UI helpers into boardRoute/hooks/usePresenceUi.ts.
- [x] 2026-01-21 15:30Z — Move shared selection/obstacle sets into boardRoute/constants.ts and update docs/CHANGELOG.md.

## Surprises & Discoveries

- Observation: None yet.
  Evidence: N/A

## Decision Log

- Decision: Split UI-only JSX into new components under frontend/src/features/boards/components.
  Rationale: Keeps route focused on data/state wiring while UI blocks stay isolated and easier to review.
  Date/Author: 2026-01-21 / Codex
- Decision: Create BoardCanvasShell, BoardDeleteDialog, and UndoDeleteToast as the initial split units.
  Rationale: These blocks were the largest JSX sections in the route and can be extracted without changing state ownership.
  Date/Author: 2026-01-21 / Codex
- Decision: Move status screen selection logic and hotkeys to boardRoute helpers to keep route focused on wiring.
  Rationale: Keeps view selection and keyboard behavior in reusable, testable modules.
  Date/Author: 2026-01-21 / Codex
- Decision: Encapsulate quick-create preview/creation and delete/undo flows in hooks.
  Rationale: These blocks are large, cohesive, and benefit from isolated state management.
  Date/Author: 2026-01-21 / Codex
- Decision: Centralize selection/presence UI derivations in hooks and move shared constants to a dedicated module.
  Rationale: Keeps route wiring lean and makes UI derivations reusable/testable.
  Date/Author: 2026-01-21 / Codex

## Outcomes & Retrospective

- Refactor complete; board.$boardId.tsx now delegates UI blocks to smaller components with no behavior changes.

## Context and Orientation

The board page is defined in frontend/src/routes/board.$boardId.tsx and currently contains data loading, interaction hooks, and a large JSX tree for dialogs and the canvas surface. The refactor must preserve behavior, props, and styling. Components already live in frontend/src/features/boards/components; new UI-only components should be created there to keep feature scope local. Route-level hooks (state, mutations, effects) must remain in the route file to avoid behavioral changes.

Key files:
- frontend/src/routes/board.$boardId.tsx — main route component to split.
- frontend/src/features/boards/components/BoardCanvasStage.tsx — canvas render surface (already separate).
- frontend/src/features/boards/components/BoardToolbar.tsx, BoardSelectionToolbar.tsx, BoardQuickCreateHandles.tsx, BoardTextEditorOverlay.tsx, BoardPublicToast.tsx — UI pieces used inside the route.

## Plan of Work

First, identify the JSX blocks that can be extracted without changing logic: the delete confirmation dialog, the undo-delete toast, and the entire canvas area (toolbar + selection toolbar + quick-create + text editor + toast + stage). Create new components for these blocks in frontend/src/features/boards/components. Each component will accept explicit props so the route remains the single source of state. After extracting, replace the route JSX with the new components, and remove any now-unused local helper components. Finally, update docs/CHANGELOG.md to record the refactor.

## Concrete Steps

1) Create frontend/src/features/boards/components/BoardDeleteDialog.tsx with props for open state, pending count, and confirm handler. Move the Dialog JSX from board.$boardId.tsx into this component.
2) Create frontend/src/features/boards/components/UndoDeleteToast.tsx and move the toast JSX there. Keep styling identical.
3) Create frontend/src/features/boards/components/BoardCanvasShell.tsx that renders the toolbar, selection toolbar, quick-create handles, text editor overlay, public toast, undo toast, and BoardCanvasStage. Define a prop type that matches the required inputs and pass them through.
4) Update frontend/src/routes/board.$boardId.tsx to import and use these components, removing the original inline JSX. Ensure all callbacks and props are wired directly to preserve behavior.
5) Run TypeScript check or lint only if needed, but at minimum ensure the file compiles with updated imports and types.
6) Update docs/CHANGELOG.md noting the refactor.

## Validation and Acceptance

- Start the frontend dev server (cd frontend && npm run dev) and open a board.
- Confirm: header renders, delete dialog opens and deletes elements, undo toast appears, quick-create and ghost preview still show, canvas interactions unchanged.
- No console errors related to missing props or components.

## Idempotence and Recovery

These edits are safe and additive. If a new component causes issues, revert the route JSX to the original block and remove the new component file. No data migrations or backend changes are involved.

## Artifacts and Notes

- Expected diff excerpts should show JSX moved out of frontend/src/routes/board.$boardId.tsx into new component files, with identical class names and props.

## Interfaces and Dependencies

Use existing component APIs. New components should accept props in plain TypeScript interfaces, not new context or state. No new dependencies are required.

At the bottom of this document, append a short note when changes are made, stating what was updated and why.

Update 2026-01-21: Marked refactor steps complete, recorded component split decision, and updated outcomes after implementing the new components.
Update 2026-01-21: Added hook extractions for quick-create and delete/undo flows and updated progress/decision logs.
Update 2026-01-21: Added selection/presence UI hook extractions and shared constants module.

Update 2026-01-21: Split board access, restoration, public toast, and connector routing into boardRoute hooks.
