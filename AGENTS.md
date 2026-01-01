# Repository Guidelines

## Project Structure & Module Organization

- `src/`: Rust backend (Axum + SQLx + WebSockets).
  - `src/main.rs`: app bootstrap, routes, CORS, server on `:3000`.
  - `src/handles/`: HTTP/WebSocket handlers (routing layer).
  - `src/services/`: business logic, auth middleware, JWT helpers.
  - `src/models/`: database models/queries.
  - `src/error/`: shared error types and API error mapping.
- `frontend/`: React + TypeScript + Vite client (served separately in dev).
  - `frontend/src/routes/`: TanStack Router route components.
  - `frontend/src/components/`: UI components.
  - `frontend/src/lib/api.ts`: API client helpers.
- Docs: `schema.md` and `system_prototype.md` describe schema/architecture.

## Build, Test, and Development Commands

- Backend:
  - `docker compose up -d db` (start Postgres; see `docker-compose.yml`)
  - `cargo run` (run API on `http://localhost:3000`)
  - `cargo test` (run Rust tests)
  - `cargo fmt` / `cargo clippy -- -D warnings` (format + lint)
- Frontend:
  - `cd frontend && npm ci` (install pinned deps)
  - `cd frontend && npm run dev` (run UI on `http://localhost:5173`)
  - `cd frontend && npm run lint` / `npm run build`

## Coding Style & Naming Conventions

- Rust: rely on `rustfmt`; use `snake_case` for functions/modules, `PascalCase` for types, and `SCREAMING_SNAKE_CASE` for env vars.
- Frontend: use `PascalCase` for components, `camelCase` for values, and `useX` for hooks; keep route files under `frontend/src/routes/`.

## Testing Guidelines

- Rust: prefer unit tests in the same module (`#[cfg(test)]`) and async tests via `#[tokio::test]` when needed.
- Frontend: no dedicated test runner is configured; add tests only if introducing complex UI logic.

## Commit & Pull Request Guidelines

- Git history is minimal (only an initial commit); use Conventional Commit-style subjects where possible (`feat:`, `fix:`, `chore:`).
- PRs: include a short summary, how to test (commands/URLs), and screenshots for UI changes; mention any schema/API changes and update `schema.md` when applicable.

## Configuration & Security

- Local config uses `.env` (e.g., `DATABASE_URL`, `JWT_SECRET`); avoid committing real secrets and rotate them if exposed.
- `frontend/AGENTS.md` contains additional, more specific contributor instructions for the client subtree.
