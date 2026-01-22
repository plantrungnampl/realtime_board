# Implement FR-BRD-03 backend delete-board operations

This ExecPlan is a living document. The sections Progress, Surprises & Discoveries, Decision Log, and Outcomes & Retrospective must be kept up to date as work proceeds.

This plan must be maintained in accordance with .agent/PLANS.md.

## Purpose / Big Picture

Users need a safe way to delete boards without losing data instantly. After this change, board owners can move a board to the trash (soft delete), restore it within a 30-day retention window, and the system will permanently purge trashed boards after the retention period. This behavior can be verified by deleting a board, observing it disappear from list responses, restoring it via the restore endpoint, and confirming the purge job removes older trashed boards.

## Progress

- [x] (2026-01-07 16:45Z) Draft ExecPlan and capture baseline context.
- [x] (2026-01-07 17:05Z) Implement repository and usecase support for soft delete, restore, and purge of deleted boards.
- [x] (2026-01-07 17:05Z) Add HTTP handlers and routes for delete/restore endpoints plus background cleanup task.
- [x] (2026-01-07 17:05Z) Update documentation (design spec, API docs, changelog, error codes if needed).
- [ ] Validate with manual API calls and update plan logs.

## Surprises & Discoveries

- None yet.

## Decision Log

- Decision: Use board.board.deleted_at for soft delete and enforce 30-day retention in a periodic cleanup task.
  Rationale: deleted_at already exists and aligns with the schema’s soft-delete model; background cleanup keeps lists fast and consistent.
  Date/Author: 2026-01-07 / Codex

## Outcomes & Retrospective

- Backend delete/restore endpoints and retention cleanup are in place, with 410 handling for deleted boards. Manual validation remains.

## Context and Orientation

The backend is a Rust + Axum service. HTTP handlers live in src/api/http, usecases in src/usecases, repositories in src/repositories, and models in src/models. Board data lives in board.board (see schema.md) with deleted_at already present. Access control uses board.board_member roles and usecase helpers in src/usecases/boards.rs such as require_board_role and ensure_board_owner. Board lists already exclude deleted_at rows, but there is no delete/restore endpoint or retention cleanup.

For this plan, “soft delete” means setting deleted_at to CURRENT_TIMESTAMP. “Restore” means clearing deleted_at. “Permanent delete” means deleting the board row (cascading to related data) after 30 days.

## Plan of Work

Add repository helpers to mark a board deleted, restore it, fetch boards including deleted rows, and purge stale deleted boards. Extend AppError with a BoardDeleted variant mapped to HTTP 410. Update usecases to enforce owner-only deletion and restoration, return BoardDeleted for access to deleted boards, and expose a purge method used by a background cleanup task. Add Axum handlers/routes for DELETE /api/boards/{board_id} and POST /api/boards/{board_id}/restore. Update ws handler to return 410 for deleted boards. Update docs (doc/realtime-collaborative-board-design.md, docs/api/API_DOCUMENTATION.md, docs/CHANGELOG.md, and doc/error-codes-reference.md if needed).

## Concrete Steps

1. Add repository functions in src/repositories/boards.rs:
   - find_board_by_id_including_deleted (no deleted_at filter)
   - mark_board_deleted (set deleted_at)
   - restore_board (clear deleted_at)
   - purge_deleted_boards (hard delete rows older than retention)

2. Extend src/error/app_error.rs with BoardDeleted mapped to HTTP 410 and code BOARD_DELETED.

3. Update src/usecases/boards.rs:
   - Ensure access checks call ensure_board_not_deleted for normal operations.
   - Add delete_board (owner only, idempotent)
   - Add restore_board (owner only, within retention window)
   - Add purge_deleted_boards (call repository purge)

4. Add HTTP handlers in src/api/http/boards.rs for delete/restore and update src/app/router.rs to expose the endpoints.

5. Add a background cleanup task (e.g., in src/services/maintenance.rs) that calls BoardService::purge_deleted_boards on an interval, and spawn it in src/app/run.rs.

6. Update docs: doc/realtime-collaborative-board-design.md (FR-BRD-03 details), docs/api/API_DOCUMENTATION.md (new endpoints, errors), docs/CHANGELOG.md, and doc/error-codes-reference.md if the new error code needs to be surfaced.

## Validation and Acceptance

Start the server with cargo run. Use HTTP requests to verify:
- DELETE /api/boards/{id} returns success for owners and hides the board from list.
- GET /api/boards/{id} for a deleted board returns 410 with BOARD_DELETED.
- POST /api/boards/{id}/restore restores the board within 30 days.
- Purge job deletes boards older than 30 days (can be validated by simulating old deleted_at in the DB).

If possible, run cargo test and ensure no failures. Record manual curl transcripts in Artifacts and Notes.

## Idempotence and Recovery

Soft delete and restore operations are idempotent. Purge removes only rows past the retention cutoff. If a step fails, rerun after fixing; no destructive changes occur until purge executes. Avoid deleting data outside the retention window.

## Artifacts and Notes

Record brief curl transcripts for delete and restore endpoints plus a note about purge behavior.

## Interfaces and Dependencies

- Repository additions in src/repositories/boards.rs: find_board_by_id_including_deleted, mark_board_deleted, restore_board, purge_deleted_boards.
- New AppError variant in src/error/app_error.rs.
- Usecase additions in src/usecases/boards.rs: delete_board, restore_board, purge_deleted_boards.
- New HTTP handlers in src/api/http/boards.rs and routes in src/app/router.rs.
- Background task spawned from src/app/run.rs.

Plan note: Initial plan drafted on 2026-01-07 for FR-BRD-03 backend work.

Plan update note: Marked backend implementation and documentation steps complete after adding delete/restore endpoints, cleanup job, and doc updates; validation remains pending.
