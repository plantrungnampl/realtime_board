Goal (incl. success criteria):
- Fix Postgres deadlock on PATCH /api/boards/{board_id}/elements/{element_id}, DB enum mismatch for presence status, client dimension clamping, transparent-fill rendering/dragging for new shapes, correct straight connector routing, connector cache cleanup, and adaptive connector routing window. Provide review of connector quick-create behavior.

Constraints/Assumptions:
- Must read docs/README.md and docs/*.md before analysis; update docs when code changes.
- No package.json or tsconfig.json edits; no new dependencies without asking.
- User prefers Bun for frontend commands.

Key decisions:
- Enforce per-board element write serialization in DB trigger; keep app-level no-op projection skip.

State:
  - Done:
  - Implemented Phase 4/5/7 logging/tracing work; docs updated.
  - Added advisory lock + stable ordering + deadlock retry in CRDT projection.
  - Added transaction-based projection defaults query helper.
  - Updated docs changelog for deadlock mitigation.
  - Added projection no-op skip (version/updated_at/deleted_at) and centralized element lock helper.
  - Added DB trigger to lock element writes per board; updated schema + migration.
  - Added migration to ensure collab.presence_status includes 'away'.
  - Reduced projection normalization warnings for connector/drawing elements.
  - Clamp element dimensions to >= 1 in frontend realtime updates.
  - Removed fill inheritance for quick-create shapes; default fill stays transparent.
  - Fixed transparent fill rendering to avoid accidental blue.
  - Ensured transparent-filled shapes still have hit area for dragging.
  - Enabled true straight connector routing and rendering.
  - Pruned connector auto-anchor cache when connectors are removed.
  - Expanded routing search margin adaptively to avoid distant obstacles.
  - Reviewed quick-create connector binding/routing behavior.
  - Delivered connector quick-create review (plus handles).
  - Added obstacle avoidance for straight connectors (fallback to orthogonal when blocked).
  - Prevented straight connectors from cutting through bound elements when checking obstacles.
  - Moved connector routing pathfinding to a Web Worker for live updates (main-thread relief).
  - Added quadtree-based spatial index to reduce obstacle scans for connector routing.
  - Applied spatial index to live, commit, and initial routing passes.
  - Extended worker routing to quick-create, commit, and initial routing passes.
  - Now:
  - Await user validation for worker routing (live + quick-create + commit) and spatial index.
  - Next:
  - Apply migrations, restart backend, and retest concurrent PATCH and projection warnings.
  - Confirm transparent fill rendering after frontend restart.
  - If review finds issues, apply fixes and update docs.
  - Await user direction on connector routing fixes.

Open questions (UNCONFIRMED if needed):
- Is the running backend updated to latest code? (UNCONFIRMED)
- None.

Working set (files/ids/commands):
- CONTINUITY.md
- src/realtime/projection.rs
- src/repositories/elements.rs
- docs/CHANGELOG.md
- src/usecases/boards.rs
- schema.md
- migrations/20260125110000_lock_element_board_writes.sql
- migrations/20260125111000_add_presence_status_away.sql
- frontend/src/features/boards/boardRoute/hooks/useBoardRealtime.ts
- frontend/src/features/boards/boardRoute/hooks/useQuickCreate.ts
- frontend/src/features/boards/components/BoardCanvasStage.tsx
- frontend/src/features/boards/boardCanvas/connectorRouting.ts
- frontend/src/features/boards/boardCanvas.hooks.ts
- frontend/src/features/boards/routing/orthogonalRouter.ts
