# FR-CMT-01 Add Comment (Boards/Elements)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan is maintained in accordance with `/Data/rust_project/Real-time_Board/.agent/PLANS.md`.

## Purpose / Big Picture

After this change, authenticated board members with comment permission can create comments on a board canvas or on a specific element, with rich text payload support, mention lists, and a 5,000-character limit, and see them in the UI. The backend supports cursor pagination and records mention notifications. A developer can verify success by running the API, posting a comment to `/api/boards/{board_id}/comments`, receiving a `201 Created` response with the stored comment, and viewing the comment list + pagination in the board UI.

## Progress

- [x] (2026-01-28 00:00Z) Create database migration for `collab.comment` and `collab.comment_status`.
- [x] (2026-01-28 00:00Z) Add comment models, DTOs, repositories, and use case service.
- [x] (2026-01-28 00:00Z) Add REST handlers and router wiring for list/create comment endpoints.
- [x] (2026-01-28 00:00Z) Update documentation (schema, API docs, changelog).
- [x] (2026-01-28 00:00Z) Add validation tests for comment length and mention limits.
- [x] (2026-01-29 00:00Z) Add cursor pagination to comment list responses.
- [x] (2026-01-29 00:00Z) Add mention notification persistence + audit-style business event logging.
- [x] (2026-01-29 00:00Z) Add frontend comments panel and comment tool integration.
- [x] (2026-01-29 00:00Z) Update docs for pagination + mention notifications and refresh changelog.

## Surprises & Discoveries

- The element lookup requires `board_id` to avoid cross-board comments.

## Decision Log

- Decision: Implement only list + create endpoints for FR-CMT-01, keeping replies/reactions for later FR-CMT-02/05.
  Rationale: FR-CMT-01 scope is comment creation and visibility; reply-specific behaviors (reply_count updates) are deferred to FR-CMT-02.
  Date/Author: 2026-01-28 / Codex.

- Decision: Accept `content_html` as an optional field, store raw HTML alongside plain text `content`.
  Rationale: Enables rich text without introducing new editor dependencies; frontend is responsible for sanitizing HTML before submission.
  Date/Author: 2026-01-28 / Codex.

- Decision: Use `created_at|comment_id` cursor format with newest-first ordering for comment pagination.
  Rationale: Provides stable pagination without new dependencies; simple to parse and explain in docs.
  Date/Author: 2026-01-29 / Codex.

- Decision: Derive mention IDs by parsing `@username` on the frontend and filter to board members on the backend.
  Rationale: Keeps mention behavior consistent with product language while enforcing access control server-side.
  Date/Author: 2026-01-29 / Codex.

## Outcomes & Retrospective

- Implemented FR-CMT-01 list/create endpoints plus pagination, mention notifications, and frontend comment UI.
- Tests: `cargo test comments` passed (existing warnings about unused code remain).

## Context and Orientation

Backend entrypoints live in `src/app/router.rs` and HTTP handlers in `src/api/http/`. Business logic lives in `src/usecases/`, repositories in `src/repositories/`, and data models in `src/models/`. The data schema reference is in `schema.md`. The FR-CMT requirements are in `doc/realtime-collaborative-board-design.md` and include: board-level comments with position, element comments, rich text support, mentions, and a 5,000-character limit.

## Plan of Work

First, extend comment listing to support cursor pagination (`limit`, `cursor`) with a stable cursor format and a pagination object in responses. Update DTOs, repository query, and usecase normalization.

Second, add mention notification persistence: create `collab.notification` migration (if missing), add a notifications repository for batch inserts, and wire comment creation to insert `comment_mention` notifications within the same transaction.

Third, add business event logging for `COLLAB_COMMENT_CREATE` and `COLLAB_MENTION` to align with audit log expectations.

Fourth, implement the frontend comment panel: add comment API client methods, types, React Query hooks (with pagination), a comment tool for pinning comments on the canvas, and a comments panel UI with a composer and list.

Fifth, update docs: `docs/api/API_DOCUMENTATION.md` and `doc/api-endpoints-specification.md` to reflect pagination, `docs/CHANGELOG.md` to record the new capabilities, and update any doc references as needed.

Finally, expand tests for cursor parsing and position validation (backend).

## Concrete Steps

Run all commands from `/Data/rust_project/Real-time_Board`.

1. Add comment pagination support (DTOs + repository + usecase).
2. Add notification migration + repository and wire mention inserts into comment creation.
3. Add BusinessEvent variants for comment creation/mentions.
4. Implement frontend comments panel + comment tool wiring.
5. Update docs + changelog for pagination + mentions.
6. Run `cargo test` (targeted) and frontend lint/typecheck if feasible.

## Validation and Acceptance

- `POST /api/boards/{board_id}/comments` with valid payload returns `201 Created` and a comment object.
- Invalid payloads (empty content, >5000 chars, >20 mentions, missing position for board comment) return `422` with validation errors.
- `GET /api/boards/{board_id}/comments` returns the created comment, respects optional filters, and provides pagination metadata.
- Mentioned users receive notification rows in `collab.notification` (notification_type = `comment_mention`).
- UI: toggle comments panel, click on board/element in comment mode, submit comment, see it in list.
- `cargo test` passes, including the new comment validation tests.

## Idempotence and Recovery

The migration uses `IF NOT EXISTS` guards where possible and is safe to re-run in development. If a step fails, re-run after fixing; no destructive data changes are involved.

## Artifacts and Notes

Expected create request example:

    POST /api/boards/{board_id}/comments
    {
      "content": "Looks good",
      "content_html": "<p>Looks good</p>",
      "position_x": 120.5,
      "position_y": 300.25,
      "mentions": ["uuid-1", "uuid-2"]
    }

Expected response excerpt:

    { "id": "uuid", "content": "Looks good", "mentions": ["uuid-1", "uuid-2"] }

## Plan Update Notes

- 2026-01-29: Expanded scope to include pagination, mention notifications, business event logging, and frontend UI integration to fully deliver FR-CMT-01 end-to-end.

## Interfaces and Dependencies

- `src/models/comments.rs`:
  - `pub enum CommentStatus` (sqlx type `collab.comment_status`)
  - `pub struct Comment` (maps to `collab.comment`)

- `src/dto/comments.rs`:
  - `CreateCommentRequest { content: String, content_html: Option<String>, element_id: Option<Uuid>, position_x: Option<f64>, position_y: Option<f64>, mentions: Option<Vec<Uuid>> }`
  - `ListCommentsQuery { element_id: Option<Uuid>, parent_id: Option<Uuid>, status: Option<CommentStatus> }`
  - `CommentResponse`, `CommentListResponse`

- `src/repositories/comments.rs`:
  - `create_comment(tx, params) -> CommentRow`
  - `list_comments(pool, board_id, filters) -> Vec<CommentRow>`
  - `filter_mentions(pool, board_id, user_ids) -> Vec<Uuid>`

- `src/usecases/comments.rs`:
  - `CommentService::create_comment(pool, board_id, user_id, req)`
  - `CommentService::list_comments(pool, board_id, user_id, query)`

- `src/api/http/comments.rs`:
  - `list_comments_handle`
  - `create_comment_handle`

- `src/app/router.rs`:
  - add routes under verified auth layer.
