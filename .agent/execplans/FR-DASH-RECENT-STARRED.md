# Implement Recent and Starred Boards (Dashboard)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `.agent/PLANS.md` and must be maintained in accordance with that file.

## Purpose / Big Picture

After this change, users can switch between Home, Recent, and Starred views in the dashboard. Recent boards show the last boards they opened, and Starred boards show favorites they have marked. The UI uses the existing board list screen while the backend persists last access time and favorite flags. The result is observable by toggling a star on a board, reloading the list, and seeing it under Starred, and by opening a board, returning to the dashboard, and seeing it appear under Recent.

## Progress

- [x] (2026-01-20T01:10Z) Create backend fields in list responses and persist last_accessed_at on board open; add favorite toggle endpoint.
- [x] (2026-01-20T01:25Z) Update frontend dashboard navigation and board list filtering/sorting for Home/Recent/Starred, including favorite toggle.
- [x] (2026-01-20T01:35Z) Update documentation (API docs + changelog) and verify behavior notes.

## Surprises & Discoveries

- Observation: None yet.
  Evidence: N/A.

## Decision Log

- Decision: Use `last_accessed_at` from `board.board_member` to drive Recent and update it on `GET /api/boards/{board_id}`.
  Rationale: Board detail is already fetched on board open; it is the most reliable access signal without adding new endpoints.
  Date/Author: 2026-01-20 (Codex).

- Decision: Favorites are toggled via `POST /api/boards/{board_id}/favorite` and stored only for existing board members.
  Rationale: Avoids auto-creating memberships for org admins and preserves member counts/permissions.
  Date/Author: 2026-01-20 (Codex).

- Decision: Recent view filters to boards with a non-null `last_accessed_at` and sorts by last access time.
  Rationale: Keeps “Recent” aligned with actual user opens and avoids mixing with generic update timestamps.
  Date/Author: 2026-01-20 (Codex).

## Outcomes & Retrospective

- Implemented backend persistence for `last_accessed_at` and favorite toggles, added UI filtering for Recent/Starred, and updated API docs/changelog. Validation steps documented; tests not executed in this session.

## Context and Orientation

Backend board list lives in `src/repositories/boards.rs` and is surfaced through `src/usecases/boards.rs` and `src/api/http/boards.rs` with routes wired in `src/app/router.rs`. Board list responses use `BoardResponse` in `src/dto/boards.rs`. The board detail endpoint is used by the board route and is a good spot to update `last_accessed_at` when a user opens a board.

Frontend dashboard layout is `frontend/src/routes/dashboard.tsx` and uses `frontend/src/components/dashboard/Sidebar.tsx` and `frontend/src/components/dashboard/BoardList.tsx`. Board list data comes from `frontend/src/features/boards/api.ts` and is typed in `frontend/src/features/boards/types.ts`. The UI will use a search param `view` to switch between Home, Recent, and Starred without adding new routes.

## Plan of Work

Update the board list query to return `is_favorite` and `last_accessed_at` from the board member join, then update the response DTOs and frontend types to match. Add a repository method to update `last_accessed_at` and call it in `BoardService::get_board_detail`. Add a favorite toggle handler and service method that flips `board_member.is_favorite` for existing members and returns the new value. Wire the new endpoint into the router.

On the frontend, introduce a dashboard view state (Home/Recent/Starred) using the dashboard route search param. Pass the view to Sidebar to render active state and navigate by setting `view` in the URL. Update BoardList to filter/sort based on the view, show the correct “last opened” timestamp, and allow toggling favorites with a mutation that updates the cached board list.

Finally, update API docs (`docs/api/API_DOCUMENTATION.md`) and the changelog (`docs/CHANGELOG.md`) to reflect the new fields and endpoint, then note the acceptance steps.

## Concrete Steps

From the repo root:

1. Edit `src/dto/boards.rs` to add `is_favorite` and `last_accessed_at` to `BoardResponse`.
2. Edit `src/repositories/boards.rs`:
   - Extend the list query to select `bm.is_favorite` and `bm.last_accessed_at`.
   - Add `touch_board_last_accessed` and `toggle_board_favorite` helpers.
3. Edit `src/usecases/boards.rs`:
   - Call `touch_board_last_accessed` in `get_board_detail` (ignore missing membership).
   - Add `toggle_board_favorite` use case to enforce access and return the new state.
4. Edit `src/api/http/boards.rs` and `src/app/router.rs` to add `/api/boards/{board_id}/favorite`.
5. Edit frontend types in `frontend/src/features/boards/types.ts` to include `is_favorite` and `last_accessed_at`.
6. Edit `frontend/src/features/boards/api.ts` to add `toggleBoardFavorite`.
7. Edit `frontend/src/routes/dashboard.tsx` and `frontend/src/components/dashboard/Sidebar.tsx` to wire the `view` search param and active navigation.
8. Edit `frontend/src/components/dashboard/BoardList.tsx` to filter/sort by view and toggle favorites.
9. Update `docs/api/API_DOCUMENTATION.md` and `docs/CHANGELOG.md`.

## Validation and Acceptance

- Start backend: `cargo run` and frontend: `cd frontend && npm run dev`.
- Open dashboard and switch between Home/Recent/Starred.
- Open a board, return to dashboard, and confirm it appears under Recent with a recent timestamp.
- Click the star icon for a board and confirm it appears under Starred. Click again to unstar.

## Idempotence and Recovery

These changes are safe to apply repeatedly. If a step fails, re-open the target file and re-apply the edit. Database schema changes are not required because the fields already exist in `board.board_member`.

## Artifacts and Notes

No artifacts yet.

## Interfaces and Dependencies

- Backend: `BoardResponse` (dto), `board_repo::list_boards_for_user`, `board_repo::touch_board_last_accessed`, `board_repo::toggle_board_favorite`, `BoardService::get_board_detail`, `BoardService::toggle_board_favorite`, `boards_http::toggle_board_favorite_handle`.
- Frontend: `getBoardsList`, `toggleBoardFavorite`, `BoardList` filtering logic, Dashboard `view` search param.
