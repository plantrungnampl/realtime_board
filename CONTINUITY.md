Goal (incl. success criteria):
- Implement shared invite email validation helpers with batch size cap and unit tests; remove duplicate helpers from board/org invite flows; update call sites; tests cover normalization, duplicates, invalid email, empty list, and batch size exceeded.

Constraints/Assumptions:
- Must read docs/README.md and all docs/*.md before analysis.
- Follow AGENTS.md rules; use skills: context-compression, context-fundamentals, tool-design (always) + using-superpowers + rust-axum-backend + security-review + TDD skills.
- No git push without explicit user confirmation.
- Use AppError for validation errors.
- Default invite email limit is 25 with per-call override for tests.

Key decisions:
- Invite limit error message must be: `Invite email limit exceeded (max {limit})`.

State:
  - Done:
    - Loaded skill guides (using-superpowers, context-compression, context-fundamentals, tool-design, rust-axum-backend, security-review, TDD).
    - Refreshed CONTINUITY.md for current task.
    - Read docs/README.md and docs/*.md (top-level).
    - Read doc/Rust_Style_Guide.md.
    - Added `src/usecases/invites.rs` with tests and shared helper implementation.
    - Added `pub(crate) mod invites;` in `src/usecases/mod.rs`.
    - Ran `cargo test normalizes_and_lowercases_emails` (failed at stub before implementation).
    - Wired board/org invite flows to shared helper; removed duplicate helper functions.
    - Updated docs/CHANGELOG.md with invite validation consolidation entry.
    - Ran `cargo test usecases::invites` (passes; existing warnings remain).
  - Now:
    - Self-review changes and prepare commit.
  - Next:
    - Commit changes (Conventional Commit) after review.

Open questions (UNCONFIRMED if needed):
- None.

Working set (files/ids/commands):
- CONTINUITY.md
- docs/README.md
- docs/*.md
- src/usecases/boards.rs
- src/usecases/organizations/helpers.rs
- src/usecases/organizations/invites.rs
- src/usecases/invites.rs (new)
- src/usecases/mod.rs
