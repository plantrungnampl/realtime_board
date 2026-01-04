# Real-time Board

Collaborative whiteboard with a Rust (Axum + SQLx) backend and a React (Vite) frontend.

## Recent updates

- Added organization member management UI at `/organizations/$orgId/members`.
- Workspace switcher now loads organizations from the API and includes member management + create actions.
- App routes under `/organizations` now hide the marketing header for focus.
- Board list now filters by the selected workspace and new boards inherit that workspace.
- The top bar “Invite members” button opens a dialog to invite users into the selected workspace.
- Invited users see pending invitations on the dashboard and can accept/decline.
- SMTP config enables real invite emails.
- Pre-signup invites are stored and attached once the invited email registers.
- Admins can see pre-signup email invites in the member list UI.
- Board visibility now follows board-level membership (board_member) for detailed permissions.
- Board share dialog lets owners/admins invite members and manage board roles.
- Backfilled board members for existing boards so board lists rely on board_member access.
- Viewer/commenter roles are enforced as read-only in the board UI and WebSocket updates.

## Docs

- Backend and frontend details live in `docs/`.
