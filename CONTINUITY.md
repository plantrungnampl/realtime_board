Goal (incl. success criteria):
- Fix auth/login 500 due to rate limiter IP extraction; success = login returns 200/401 (not 500).

Constraints/Assumptions:
- Follow AGENTS instructions; maintain ledger each turn and provide Ledger Snapshot in replies.
- Use skills: context-compression, context-fundamentals, tool-design, and using-superpowers.
- No destructive commands; no git push.
- Must start analysis by reading docs/README.md and docs/CHANGELOG.md (done this turn).

Key decisions:
- Comment replies not supported yet; create sets `parent_id` to None.

State:
  - Done:
  - Reviewed FR-CMT-01 requirements and current backend comment implementation.
  - Identified missing FE, pagination, notifications, audit events, and tests.
  - Implemented comment pagination, mention notifications, business events, frontend comment UI, and updated docs.
  - Ran `cargo fmt` and `cargo test comments` (warnings only).
  - Added Python __pycache__ ignore rules in `.gitignore`.
  - Updated docs changelog with tooling note.
  - Verified docker backend container binary is dated Jan 24 (older than current code).
  - Rebuilt backend container via `docker compose up -d --build backend`.
  - Verified endpoints now exist: comments returns 401 without auth; telemetry returns 415 without body.
  - Adjusted comment panel padding to reduce indentation and align header/list/composer.
  - Updated docs changelog with comment panel alignment note.
  - Updated WS URL to derive from env/API base (removed hardcoded localhost).
  - Updated docs changelog with WS URL note.
  - Identified login 500 response body "Unable To Extract Key!" likely from governor key extraction.
  - Enabled `ConnectInfo` in Axum serve to provide client IP for rate limiting.
  - Updated docs changelog with auth rate limit fix note.
  - Rebuilt backend container; login now returns 401 for invalid credentials (no 500).
  - Now:
  - Ask user to retry login with real credentials after rebuild.
  - Next:
  - If login still 500, inspect rate limiter errors or JWT/DB config.

Open questions (UNCONFIRMED if needed):
- Should mention notifications trigger any outbound email/push now, or only create notification records?
- Should existing __pycache__ files be deleted after adding ignore?
- Which specific element looks “thụt” (list items, header, or composer)?
- What is your current `VITE_API_URL` (or are you running backend on 3002 only)?

Working set (files/ids/commands):
- doc/realtime-collaborative-board-design.md
- docs/README.md
- docs/CHANGELOG.md
- docs/api/API_DOCUMENTATION.md
- doc/api-endpoints-specification.md
- doc/audit-log-system.md
- migrations/20260128160000_add_comment_table.sql
- migrations/20260129130000_add_notification_table.sql
- src/models/comments.rs
- src/dto/comments.rs
- src/repositories/comments.rs
- src/repositories/notifications.rs
- src/usecases/comments.rs
- src/api/http/comments.rs
- src/app/router.rs
- schema.md
- .agent/execplan-fr-cmt-01-add-comment.md
- frontend/src/features/boards/comments/components/BoardCommentsPanel.tsx
- frontend/src/features/boards/boardRoute/hooks/useBoardRealtime.ts
- frontend/src/features/boards/comments/hooks/useBoardComments.ts
- frontend/src/features/boards/comments/utils.ts
- frontend/src/features/boards/boardRoute/tools.ts
- frontend/src/features/boards/components/BoardHeader.tsx
- frontend/src/features/boards/components/BoardToolbar.tsx
- frontend/src/routes/board.$boardId.tsx
- .gitignore
- docs/CHANGELOG.md
- src/app/router.rs
- docker-compose.yml
- frontend/src/features/boards/comments/components/BoardCommentsPanel.tsx
