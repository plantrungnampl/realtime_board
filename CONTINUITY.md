Goal (incl. success criteria):
- Diagnose and fix infinite PATCH requests when entering a board; stop request flood and ensure normal save/update cadence.

Constraints/Assumptions:
- Must read docs/README.md and all docs/*.md before analysis (done).
- Follow AGENTS.md + frontend/AGENTS.md rules; use skills: context-compression, context-fundamentals, tool-design (always); for frontend work use vercel-react-best-practices + frontend + ui-ux-pro-max.
- No destructive file ops; no git push without explicit user confirmation; avoid new deps without asking.

Key decisions:
- Remove reliance on Y.MapEvent instanceof (undefined at runtime); use keysChanged feature check.

State:
  - Done:
    - Prior work includes multiple frontend performance optimizations and routing fixes (see previous ledger entries).
    - Added element persist deduping to avoid redundant PATCH requests.
    - Stabilized locked element ID sets to avoid rerunning load-time routing on presence heartbeats.
    - Updated docs/CHANGELOG.md with the fix entry.
  - Now:
    - Validate whether PATCH flood is resolved and confirm trigger conditions.
  - Next:
    - Identify trigger loop, fix throttling/deduping logic, update docs/CHANGELOG.md if logic changes.
    - Validate FE build/lint if requested.
    - Push changes to user's GitHub after confirmation that fix is resolved.

Open questions (UNCONFIRMED if needed):
- Does the request loop happen on a fresh board with no edits, or only after interacting?
- Which branch/remote should be pushed, and should lint/build run before push?

Working set (files/ids/commands):
- frontend/src/features/boards/hooks/useBoardElementMutations.ts
- frontend/src/features/boards/boardRoute/hooks/useBoardRealtime.ts
- docs/CHANGELOG.md
- CONTINUITY.md
