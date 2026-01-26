Goal (incl. success criteria):
- Fix frontend connector routing algorithm issues and answer the new question about a .webm file problem.

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
    - Added projection/snapshot metrics logs.
    - cargo test passed (24 tests) with existing dead-code warnings.
    - Added env-based DB pool tuning (max/min/acquire timeout).
    - Added changelog entry for DB pool tuning.
    - Throttled WS message logs with debug-level sampling.
    - Added changelog entry for WS logging throttle.
    - Implemented chunked update replay during board state hydration.
    - Added changelog entry for chunked snapshot replay.
    - Added projection prefilter to skip param build when unchanged.
    - Added changelog entry for projection prefilter.
    - cargo test passed (24 tests) after snapshot/projection changes; existing dead-code warnings remain.
    - Added budgets for connector routing (node/iteration/time caps).
    - Added changelog entry for connector routing budgets.
    - Added routing budget debug logs gated by RTC_DEBUG_ROUTING.
    - Reduced routing margin for short connector distances.
    - Added changelog entry for routing telemetry and short-range margin.
    - Removed duplicate lock-route obstacle check to avoid repeated obstacle builds.
    - Added changelog entry for routing lock check cleanup.
    - Prefiltered obstacles per row/column when building routing graph.
    - Added changelog entry for routing edge obstacle prefilter.
    - Sampled routing time-budget check every 64 iterations to reduce overhead.
    - Added changelog entry for routing time budget sampling.
    - Normalized obstacle hashes to improve routing graph cache hits.
    - Added changelog entry for routing cache hash normalization.
    - Added optional realtime WS metrics sampling gated by RTC_DEBUG_REALTIME.
    - Added changelog entry for realtime metrics sampling.
    - Fixed WsMetrics type scope for realtime debug counters.
    - Added changelog entry for realtime metrics type scope fix.
  - Now:
    - Understand what is wrong with `/Data/ce25b650-2723-4084-8df1-3906a2bfc3c3.webm`.
  - Next:
    - Update docs/CHANGELOG.md if logic changes.
    - Validate FE build/lint if requested.

Open questions (UNCONFIRMED if needed):
- Do you want me to run frontend lint/build to verify routing changes after cleanup?

Working set (files/ids/commands):
- frontend/src/features/boards/boardCanvas/connectorRouting.ts
- frontend/src/features/boards/routing/orthogonalRouter.ts
- frontend/src/features/boards/routing/orthogonalRouter.ts
- frontend/src/features/boards/routing/connectorRouting.worker.ts
- frontend/src/features/boards/routing/useConnectorRoutingWorker.ts
- CONTINUITY.md
