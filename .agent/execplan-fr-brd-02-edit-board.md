# Implement FR-BRD-02 backend edit-board operations

This ExecPlan is a living document. The sections Progress, Surprises & Discoveries, Decision Log, and Outcomes & Retrospective must be kept up to date as work proceeds.

This plan must be maintained in accordance with .agent/PLANS.md.

## Purpose / Big Picture

Users need to edit board properties safely. After this change, an organization owner or admin can create and update board metadata, transfer ownership, and archive or unarchive boards through explicit backend endpoints. A board owner or admin can update name, description, and visibility, transfer board ownership to another member, and archive/unarchive a board. Archived boards will no longer appear in board listings and attempting to open an archived board will return a clear “board archived” response. This behavior can be validated by creating a board, archiving it, observing it disappear from list responses, and receiving a 410 response when requesting its detail endpoint.

## Progress

- [x] (2026-01-07 14:38Z) Draft ExecPlan and record baseline assumptions.
- [x] (2026-01-07 15:12Z) Implement schema/model changes for board archival status and wire through repository queries.
- [x] (2026-01-07 15:12Z) Add board edit/transfer/archive use cases and HTTP handlers, plus routing updates.
- [x] (2026-01-07 15:12Z) Update documentation (schema.md, docs/api/API_DOCUMENTATION.md, doc/realtime-collaborative-board-design.md, docs/CHANGELOG.md, docs/architecture/SECURITY.md if needed).
- [ ] Validate with manual API calls and update plan logs.

## Surprises & Discoveries

- None yet.

## Decision Log

- Decision: Use a nullable archived_at timestamp on board.board to represent archived state.
  Rationale: Soft delete already uses deleted_at; archived_at allows hiding boards without trash semantics.
  Date/Author: 2026-01-07 / Codex
- Decision: Return HTTP 410 for archived board access and expose a BOARD_ARCHIVED error code.
  Rationale: doc/error-codes-reference.md already defines BOARD_ARCHIVED and 410 is semantically correct.
  Date/Author: 2026-01-07 / Codex
- Decision: Transfer ownership demotes other owners to admin to keep exactly one owner.
  Rationale: Keeps ownership semantics aligned with org ownership transfer.
  Date/Author: 2026-01-07 / Codex

## Outcomes & Retrospective

- Backend support for edit, archive/unarchive, and ownership transfer is in place, with archived boards hidden and returning 410 on access. Documentation is updated. Manual validation remains.

## Context and Orientation

The backend is a Rust + Axum service. HTTP handlers live in src/api/http, usecases in src/usecases, repositories in src/repositories, and models in src/models. Board data lives in board.board (see schema.md). Board access is governed by board.board_member roles. The current endpoints only support board creation, listing, detail fetch, and board membership management; there is no board metadata update or archive endpoint. BoardService in src/usecases/boards.rs enforces access rules through require_board_role and resolve_board_access_role. AppError in src/error/app_error.rs maps domain errors to HTTP status codes.

In this plan, “archive” means setting archived_at on board.board. Archived boards are hidden from lists and treated as inaccessible (HTTP 410) until unarchived. “Transfer ownership” means ensuring exactly one board owner by demoting any other owners to admin, then assigning the new owner.

## Plan of Work

We will add an archived_at column in a migration and update schema.md to document it. The Board model in src/models/boards.rs will be extended with archived_at and serialized to clients. Repositories in src/repositories/boards.rs will gain update functions and will filter archived_at for list/detail lookups. Usecases in src/usecases/boards.rs will add new operations: update_board, transfer_board_ownership, archive_board, and unarchive_board. These will validate name/description, enforce board manager permissions, and return a 410 AppError when attempting to access an archived board outside of unarchive. HTTP handlers in src/api/http/boards.rs will remain thin and call the new usecase methods. Routes in src/app/router.rs will expose PATCH /api/boards/{board_id} for metadata updates, POST /api/boards/{board_id}/archive, POST /api/boards/{board_id}/unarchive, and POST /api/boards/{board_id}/transfer-ownership. Documentation in doc/realtime-collaborative-board-design.md, docs/api/API_DOCUMENTATION.md, schema.md, and docs/CHANGELOG.md will be updated to reflect these behaviors and permissions. If a new AppError variant is introduced for archived boards, docs/error-codes-reference.md will be aligned.

## Concrete Steps

1. Create a migration in migrations/ to add archived_at TIMESTAMPTZ NULL to board.board and backfill NULL. Update schema.md with the new column.

2. Update src/models/boards.rs to include archived_at: Option<DateTime<Utc>> on Board, and ensure serialization still works.

3. In src/repositories/boards.rs, add new functions:
   - update_board_metadata (name/description/is_public)
   - set_board_archived (set archived_at to now or null)
   - demote_other_board_owners
   - get_board_member_by_user_id
   - find_board_by_id_including_archived (to distinguish archived from missing)
   Also update list_boards_for_user, find_board_by_id, and load_board_organization_id to ignore archived boards (archived_at IS NULL).

4. In src/error/app_error.rs, add a variant for archived boards (e.g., BoardArchived) mapped to 410 Gone with error code BOARD_ARCHIVED.

5. In src/usecases/boards.rs, add:
   - update_board (owner/admin only, validates name/description and updates metadata)
   - archive_board and unarchive_board (owner/admin only)
   - transfer_board_ownership (owner only, demote other owners, promote target)
   - use find_board_by_id_including_archived and return BoardArchived when archived
   Update resolve_board_access_role to reject archived boards unless unarchiving.

6. In src/dto/boards.rs, add request structs for update and transfer:
   - UpdateBoardRequest { name: Option<String>, description: Option<String>, is_public: Option<bool> }
   - TransferBoardOwnershipRequest { new_owner_id: Uuid }

7. In src/api/http/boards.rs, add handlers for the new endpoints. Keep each handler small and delegate to BoardService. Update src/app/router.rs with new routes.

8. Update docs: doc/realtime-collaborative-board-design.md (FR-BRD-02 acceptance criteria details), docs/api/API_DOCUMENTATION.md (new endpoints, permissions, errors), schema.md, docs/CHANGELOG.md, and docs/architecture/SECURITY.md if needed. Align doc/error-codes-reference.md with BOARD_ARCHIVED usage.

## Validation and Acceptance

Start the server with cargo run. Use HTTP requests to verify:

- PATCH /api/boards/{id} updates name/description/visibility for owner/admin and returns 200 with updated data.
- POST /api/boards/{id}/archive sets archived_at and board disappears from GET /api/boards/list.
- GET /api/boards/{id} on archived board returns 410 with error code BOARD_ARCHIVED.
- POST /api/boards/{id}/unarchive restores board visibility.
- POST /api/boards/{id}/transfer-ownership transfers ownership, demotes old owners, and returns a success message.

If possible, run cargo test and ensure no failures. If no tests cover this, record manual curl transcripts in Artifacts and Notes.

## Idempotence and Recovery

The migration adds a nullable column and is safe to re-run once. If a step fails mid-migration, re-run cargo run after sqlx migrate run. Repository and usecase changes are additive; revert by removing the new endpoints and column if needed. Avoid deleting data by only setting archived_at and never touching deleted_at in this feature.

## Artifacts and Notes

Record short curl transcripts that show the 410 response for archived boards and a successful transfer ownership response, once implemented.

## Interfaces and Dependencies

- New DTOs in src/dto/boards.rs: UpdateBoardRequest, TransferBoardOwnershipRequest.
- New repository functions in src/repositories/boards.rs: update_board_metadata, set_board_archived, demote_other_board_owners, get_board_member_by_user_id, find_board_by_id_including_archived.
- New usecase methods in src/usecases/boards.rs: update_board, archive_board, unarchive_board, transfer_board_ownership.
- New handlers in src/api/http/boards.rs and routes in src/app/router.rs.
- AppError variant for archived boards in src/error/app_error.rs.

Plan note: Initial plan drafted on 2026-01-07; no implementation steps completed yet.

Plan update note: Marked the ExecPlan drafting step complete because the plan file now exists and captures baseline assumptions.

Plan update note: Marked schema/model/repository/usecase/handler/doc steps complete after implementing FR-BRD-02 backend edits; validation remains pending.
