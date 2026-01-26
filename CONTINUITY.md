Goal (incl. success criteria):
- Review backend performance and identify high-impact optimization targets.

Constraints/Assumptions:
- Must read docs/README.md and all docs/*.md before analysis (done).
- Follow AGENTS.md + frontend/AGENTS.md rules; use skills: context-compression, context-fundamentals, tool-design (always); for frontend work use vercel-react-best-practices + frontend + ui-ux-pro-max.
- No destructive file ops; no git push; avoid new deps without asking.

Key decisions:
- Remove reliance on Y.MapEvent instanceof (undefined at runtime); use keysChanged feature check.

State:
  - Done:
    - Updated useBoardRealtime to apply incremental element changes from Yjs events.
    - Added changelog entry for incremental updates performance fix.
    - Fixed observer error by replacing Y.MapEvent instanceof with keysChanged check.
    - Split cursor rendering into a dedicated layer and stabilized drag presence inputs to reduce PixiScene re-render churn.
    - Added changelog entry for cursor render isolation performance update.
    - Added web worker lib reference to connectorRouting.worker.ts.
    - Added changelog entry for worker typing fix.
    - Memoized background + grid rendering as a dedicated layer.
    - Added changelog entry for static background/grid performance update.
    - Moved selection outlines and transform handles into a memoized overlay layer.
    - Added changelog entry for selection/transform overlay performance update.
    - Coalesced pointer move and drag updates via requestAnimationFrame.
    - Added changelog entry for pointer update batching.
    - Fixed lint/build errors in BoardCanvasStage, useBoardRealtime, logger, and API client.
    - Lint now passes with warnings only; build succeeded (vite).
    - Cleared remaining lint warnings; lint now passes clean.
    - Re-ran build (vite) successfully; chunk-size warnings remain.
    - Completed initial backend performance review with prioritized findings.
    - Implemented projection dirty tracking to skip projection when no WS updates occurred.
    - Added changelog entry for projection dirty tracking.
    - Added snapshot maintenance gating + bounded concurrency.
    - Added changelog entry for snapshot maintenance optimization.
    - Added debug metrics logs for projection + snapshot ticks.
    - Added changelog entry for backend metrics logs.
    - Implemented batch upsert for projection to reduce query count.
    - Added changelog entry for batch projection upserts.
  - Now:
    - Backend projection batching implemented; pending validation if needed.
  - Next:
    - Validate behavior under WS updates if requested.

Open questions (UNCONFIRMED if needed):
- Do you want me to run backend tests or add metrics around snapshot/projection skips?

Working set (files/ids/commands):
- src/main.rs
- src/handles/
- src/services/
- src/models/
- docs/*.md
- CONTINUITY.md
