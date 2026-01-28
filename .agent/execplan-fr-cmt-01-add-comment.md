# FR-CMT-01 Add Comment (Boards/Elements)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan is maintained in accordance with `/Data/rust_project/Real-time_Board/.agent/PLANS.md`.

## Purpose / Big Picture

After this change, authenticated board members with comment permission can create comments on a board canvas or on a specific element, with rich text payload support, mention lists, and a 5,000-character limit. The system stores comments in the database and exposes REST endpoints to create and list comments. A developer can verify success by running the API, posting a comment to `/api/boards/{board_id}/comments`, and receiving a `201 Created` response with the stored comment.

## Progress

- [x] (2026-01-28 00:00Z) Create database migration for `collab.comment` and `collab.comment_status`.
- [x] (2026-01-28 00:00Z) Add comment models, DTOs, repositories, and use case service.
- [x] (2026-01-28 00:00Z) Add REST handlers and router wiring for list/create comment endpoints.
- [x] (2026-01-28 00:00Z) Update documentation (schema, API docs, changelog).
- [x] (2026-01-28 00:00Z) Add validation tests for comment length and mention limits.

## Surprises & Discoveries

- The element lookup requires `board_id` to avoid cross-board comments.

## Decision Log

- Decision: Implement only list + create endpoints for FR-CMT-01, keeping replies/reactions for later FR-CMT-02/05.
  Rationale: FR-CMT-01 scope is comment creation and visibility; reply-specific behaviors (reply_count updates) are deferred to FR-CMT-02.
  Date/Author: 2026-01-28 / Codex.

- Decision: Accept `content_html` as an optional field, store raw HTML alongside plain text `content`.
  Rationale: Enables rich text without introducing new editor dependencies; frontend is responsible for sanitizing HTML before submission.
  Date/Author: 2026-01-28 / Codex.

## Outcomes & Retrospective

- Implemented FR-CMT-01 list/create comment endpoints, schema, and validation tests.
- Tests: `cargo test comment` passed (warnings about unused code remain from existing modules).

## Context and Orientation

Backend entrypoints live in `src/app/router.rs` and HTTP handlers in `src/api/http/`. Business logic lives in `src/usecases/`, repositories in `src/repositories/`, and data models in `src/models/`. The data schema reference is in `schema.md`. The FR-CMT requirements are in `doc/realtime-collaborative-board-design.md` and include: board-level comments with position, element comments, rich text support, mentions, and a 5,000-character limit.

## Plan of Work

First, add a migration to create `collab.comment_status` (if missing) and `collab.comment`, following the schema reference. Include indexes for board, element, parent, status, mentions, and created time. Add a constraint that board-level comments must include position coordinates.

Second, introduce `src/models/comments.rs` with a `CommentStatus` enum and `Comment` struct. Add `src/dto/comments.rs` with request/response shapes: `CreateCommentRequest`, `CommentResponse`, `CommentListResponse`, and `ListCommentsQuery` (element_id/parent_id/status filters). Wire these modules into `src/models/mod.rs` and `src/dto/mod.rs`.

Third, add `src/repositories/comments.rs` to insert and list comments, and a helper to filter mention user IDs to board-accessible users (board members + org owner/admin members for org boards). The `create_comment` repository method should return a `CommentRow` joined with `core.user` to include author info.

Fourth, add `src/usecases/comments.rs` with `CommentService::create_comment` and `CommentService::list_comments`. Validate content length (1–5000 chars), mention count (<=20), and enforce position for board-level comments. If `element_id` is provided, ensure it exists on the same board and is not deleted. Use board permission checks from `usecases::boards` (Comment for create, View for list).

Fifth, add HTTP handlers in `src/api/http/comments.rs` (or extend `boards.rs`) and register routes in `src/app/router.rs` under verified routes:
- `GET /api/boards/{board_id}/comments`
- `POST /api/boards/{board_id}/comments`

Sixth, update docs: `schema.md` (if any deviations), `docs/api/API_DOCUMENTATION.md` to document comment endpoints, `doc/api-endpoints-specification.md` for spec alignment, and `docs/CHANGELOG.md` with a new entry.

Finally, add unit tests for validation helpers (length and mention limits) in `src/usecases/comments.rs`.

## Concrete Steps

Run all commands from `/Data/rust_project/Real-time_Board`.

1. Create migration file `migrations/20260128160000_add_comment_table.sql` with `collab.comment_status` and `collab.comment`.
2. Add comment models and DTOs, then wire into module indexes.
3. Add comment repository and use case with validation helpers.
4. Add REST handlers and update router.
5. Update docs and changelog.
6. Run `cargo test` (or targeted tests) to confirm validation tests pass.

## Validation and Acceptance

- `POST /api/boards/{board_id}/comments` with valid payload returns `201 Created` and a comment object.
- Invalid payloads (empty content, >5000 chars, >20 mentions, missing position for board comment) return `422` with validation errors.
- `GET /api/boards/{board_id}/comments` returns the created comment and respects optional filters.
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
