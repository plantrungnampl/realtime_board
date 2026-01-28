Goal (incl. success criteria):
- Fix invite email validation: enforce limit during normalization (short-circuit), add `collect_invite_emails_with_limit` wrapper and default wrapper without Option, update call sites, adjust tests, run tests, and commit fix.

Constraints/Assumptions:
- Must read docs/README.md and docs/*.md before analysis.
- Follow AGENTS.md rules; use skills: context-compression, context-fundamentals, tool-design (always) + using-superpowers + rust-axum-backend + security-review + TDD skills.
- No git push without explicit user confirmation.
- Use AppError for validation errors.
- Invite limit error message: `Invite email limit exceeded (max {limit})`.

Key decisions:
- Enforce limit inside normalization loop; default wrapper without Option plus `collect_invite_emails_with_limit`.

State:
  - Done:
    - Loaded required skills for this turn.
    - Read CONTINUITY.md at turn start.
    - Updated invite tests for new wrapper API and added early-limit coverage.
    - Implemented `collect_invite_emails_with_limit` wrapper and limit short-circuit during normalization.
    - Updated board/org invite call sites to new wrapper signature.
    - Ran `cargo test usecases::invites` (passes; existing warnings remain).
  - Now:
    - Commit changes (new commit) after review.
  - Next:
    - Await user instructions (no git push without approval).

Open questions (UNCONFIRMED if needed):
- None.

Working set (files/ids/commands):
- CONTINUITY.md
- src/usecases/invites.rs
- src/usecases/boards.rs
- src/usecases/organizations/invites.rs
