# Implement FR-BRD-06 backend board access control (RBAC + custom permissions + audit log)

This ExecPlan is a living document. The sections Progress, Surprises & Discoveries, Decision Log, and Outcomes & Retrospective must be kept up to date as work proceeds.

This plan must be maintained in accordance with .agent/PLANS.md.

## Purpose / Big Picture

Board access control is currently role-based with coarse checks (owner/admin/editor can edit). FR-BRD-06 requires enforcing permissions by role, supporting custom per-member overrides, and auditing permission changes. After this backend change, board operations, member management, and realtime updates will respect effective permissions derived from role + custom overrides, and permission changes will be logged to the audit log for traceability.

## Progress

- [x] (2026-01-08 11:20Z) Draft ExecPlan and record baseline assumptions.
- [x] (2026-01-08 13:40Z) Implement backend permission model and effective-permission resolution.
- [x] (2026-01-08 13:40Z) Wire permission checks across API and realtime entry points.
- [x] (2026-01-08 13:40Z) Add audit logging for board_member permission changes.
- [x] (2026-01-08 13:45Z) Update docs (schema/API/changelog) and add unit tests.
- [x] (2026-01-08 14:15Z) Implement frontend permissions display and custom override controls.

## Surprises & Discoveries

- None yet.

## Decision Log

- Decision: Use existing `board.board_member.custom_permissions` JSONB column as the override store.
  Rationale: Schema already provides a place for per-member overrides without adding new tables.
  Date/Author: 2026-01-08 / Codex
- Decision: Add explicit permission evaluation functions in backend rather than rely on ad-hoc role checks.
  Rationale: Centralized evaluation avoids drifting behavior between REST and WebSocket paths.
  Date/Author: 2026-01-08 / Codex

## Outcomes & Retrospective

- Pending.

## Context and Orientation

Board roles are defined in `src/models/boards.rs` as `BoardRole` (Owner/Admin/Editor/Commenter/Viewer). Current backend enforcement uses helper functions in `src/usecases/boards.rs` (e.g., `ensure_board_manager`, `require_board_role`) and WebSocket updates rely on a boolean `can_edit` in `src/api/ws/boards.rs`. The `board.board_member` table already includes a `custom_permissions` JSONB column (see `schema.md`) but the application does not currently read or apply it. Audit logging exists in `audit.event_log` with a generic trigger for `board.board`, but there is no audit trigger for `board.board_member`.

FR-BRD-06 requires: role permissions enforced, custom permissions support, and audit log for permission changes.

## Plan of Work

First, define a permission model in the backend. Introduce a `BoardPermissions` struct (booleans for view/edit/comment/manage members/manage board) and a `BoardPermissionOverrides` struct with `Option<bool>` fields. Add a method on `BoardRole` (or a helper in `usecases::boards`) to return default permissions. Implement `apply_overrides` to combine defaults with overrides.

Second, extend repository queries and DTOs to carry `custom_permissions` where needed. Update `board_repo::list_board_members` and `board_repo::get_board_member_by_id` to include the JSONB column. Update `BoardMemberResponse` and request payloads to allow `custom_permissions` and return both `role` and `effective_permissions` for UI display.

Third, centralize permission checks. Replace direct role checks in `usecases/boards.rs` with `require_board_permission` that resolves the effective permissions (role + overrides + org guest rule) and validates access to specific actions. Use this for board member management endpoints and board metadata changes. Update WebSocket handling to compute `can_edit` from effective permissions instead of role-only.

Fourth, add audit logging for permission changes. Add a trigger on `board.board_member` to call `audit.log_changes()` so updates to role or custom_permissions are recorded. Ensure the application sets `app.current_user_id` in the DB session/transaction (using `SET LOCAL` per request or per transaction) so audit entries have the correct actor. If session variables are not currently set anywhere, add middleware or repository helpers to set it in transactions that mutate board member records.

Finally, document the new behavior in `docs/api/API_DOCUMENTATION.md`, update `schema.md` if fields change semantics, and add a `docs/CHANGELOG.md` entry. Add unit tests for permission resolution (role defaults + overrides + guest restriction).

## Concrete Steps

1. In `src/models/boards.rs` (or a new module under `src/usecases/boards/permissions.rs`), define:
   - `BoardPermissions { can_view, can_edit, can_comment, can_manage_members, can_manage_board }`
   - `BoardPermissionOverrides` with `Option<bool>` fields
   - `BoardPermissions::from_role(BoardRole)` and `apply_overrides`.

2. In `src/repositories/boards.rs`:
   - Extend `BoardMemberRow` and `BoardMemberRecord` to include `custom_permissions`.
   - Update SQL queries to select `custom_permissions`.

3. In `src/dto/boards.rs`:
   - Extend `BoardMemberResponse` to include `custom_permissions` and `effective_permissions`.
   - Extend `UpdateBoardMemberRoleRequest` (or introduce a new request) to accept optional `custom_permissions`.

4. In `src/usecases/boards.rs`:
   - Add `resolve_board_permissions` (role + org guest rule + overrides).
   - Add `require_board_permission` helper for actions (view/edit/comment/manage members/manage board).
   - Replace usages of `ensure_board_manager` and role checks where applicable.

5. In `src/api/ws/boards.rs`:
   - Replace role-based `can_edit` with `resolve_board_permissions(...).can_edit`.
   - Ensure permission changes are propagated if roles/overrides are updated mid-session.

6. In `schema.md` and migrations:
   - Add audit trigger on `board.board_member` for insert/update/delete.
   - Ensure `custom_permissions` JSON shape is documented.

7. Add tests:
   - Permission resolution defaults.
   - Override precedence (true/false/None).
   - Guest org restriction forces viewer/edit=false.

8. Update docs: `docs/api/API_DOCUMENTATION.md` and `docs/CHANGELOG.md`.

## Validation and Acceptance

- Updating a board member role or custom permissions should record an entry in `audit.event_log`.
- Users with Viewer or Commenter roles should not be able to submit real-time updates (server drops updates).
- Owners/Admins should retain full manage permissions.
- Guests in organization boards should remain viewer-only even if a higher role or override is set.

Run `cargo test` and manually exercise:
  - `PATCH /api/boards/{board_id}/members/{member_id}` with role and custom permissions
  - WebSocket connection with viewer role to confirm updates are rejected

## Idempotence and Recovery

The changes are additive. If permission evaluation introduces issues, revert to role-only checks by disabling `apply_overrides` and removing `custom_permissions` usage while keeping schema intact.

## Artifacts and Notes

Capture a short example of `audit.event_log` entries after updating a board member to confirm the audit trail.

## Interfaces and Dependencies

- `BoardPermissions` and `BoardPermissionOverrides` structs in backend models/usecases.
- Updated board member DTOs to carry permissions.
- Trigger on `board.board_member` using `audit.log_changes()`.

Plan note: Initial plan drafted on 2026-01-08; implementation has not started yet.
