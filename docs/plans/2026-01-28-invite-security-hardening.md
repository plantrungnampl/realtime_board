# Invite Security Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Harden organization and board invite flows against abuse and token leakage, with measurable rate limits, safer token storage, and test coverage for validation logic.

**Architecture:** Add a dedicated invite rate limiter keyed by authenticated user with IP fallback, centralize invite email validation with a batch size cap, and replace plaintext pre-signup invite tokens with deterministic hashes stored in the database.

**Tech Stack:** Rust 2024, Axum 0.8, SQLx/Postgres, tower_governor, existing auth middleware, and a deterministic SHA-256 hash helper.

---

This ExecPlan is a living document. The sections Progress, Surprises & Discoveries, Decision Log, and Outcomes & Retrospective must be kept up to date as work proceeds.

This plan must be maintained in accordance with /Data/rust_project/Real-time_Board/.agent/PLANS.md.

## Purpose / Big Picture

After this change, invite endpoints are protected against spam and abuse, pre-signup invite tokens are no longer stored in plaintext, and large invite batches are rejected early. A reviewer can validate the change by observing rate limit responses on invite routes, confirming invite token hashes are stored instead of raw tokens, and running unit tests for invite validation and hashing.

## Progress

- [x] 2026-01-28 00:00Z Plan drafted for invite security hardening.
- [x] 2026-01-28 00:00Z Added invite rate limiter and applied to invite routes.
- [ ] Centralize invite email validation with batch size cap.
- [x] 2026-01-28 14:24Z Started Task 3 token hashing work: reviewed invite token usage in repos/usecases/migrations.
- [x] 2026-01-28 14:45Z Added invite token hashing helper + tests, migration for invite_token_hash, backfill tool, and repo/usecase updates to store/query hashes.
- [ ] Make invite email sending failure-tolerant and add logging.
- [x] 2026-01-28 00:00Z Added unit tests for invite rate limit key extraction.
- [ ] Add unit tests for invite validation and hashing.
- [x] 2026-01-28 00:00Z Updated docs and changelog for invite rate limiting.

## Surprises & Discoveries

- None yet.

## Decision Log

- Decision: Apply invite rate limiting per authenticated user with IP fallback using a custom tower_governor KeyExtractor.
  Rationale: Invite routes are authenticated; user-based keys reduce shared-IP throttling while still protecting unauthenticated validation paths.
  Date/Author: 2026-01-28 / Codex.

- Decision: Replace plaintext invite_token storage with SHA-256 hashes and drop reliance on invite_token index.
  Rationale: Prevents token reuse if the database is leaked while keeping deterministic lookup without storing secrets.
  Date/Author: 2026-01-28 / Codex.

- Decision: Enforce a single invite email batch size limit across org and board invites via a shared helper.
  Rationale: Avoids duplicate business rules and limits abuse via large payloads.
  Date/Author: 2026-01-28 / Codex.

- Decision: Treat invite email delivery as best-effort after DB commit (log failures, do not fail API).
  Rationale: Current flow commits invites before email; failing the request after commit causes confusing retries and conflicts.
  Date/Author: 2026-01-28 / Codex.

## Outcomes & Retrospective

- Pending.

## Context and Orientation

Invite functionality spans several layers:

- Routes live in /Data/rust_project/Real-time_Board/src/app/router.rs. Invite endpoints are currently under verified_routes without rate limiting.
- Authenticated user context is injected by /Data/rust_project/Real-time_Board/src/auth/middleware.rs as AuthUser in request extensions.
- Organization invite logic (pre-signup and member invites) is in /Data/rust_project/Real-time_Board/src/usecases/organizations/invites.rs.
- Board invite logic for existing users is in /Data/rust_project/Real-time_Board/src/usecases/boards.rs.
- Pre-signup invites are stored in core.organization_invite via /Data/rust_project/Real-time_Board/src/repositories/organizations.rs and the migration /Data/rust_project/Real-time_Board/migrations/20250104190000_add_organization_invite.sql.

Definitions used in this plan:

- Pre-signup invite: A record in core.organization_invite sent to an email address, redeemed during registration via a token.
- Member invite: A pending row in core.organization_member with invited_at and accepted_at for existing users.
- Board invite: A direct board membership addition for existing users, optionally coupled with a member invite for the organization.

## Plan of Work

Milestone 1 introduces a dedicated invite rate limiter. Implement a custom InviteKeyExtractor in src/app/router.rs (or a small local module) that uses AuthUser from request extensions when available, otherwise falls back to SmartIpKeyExtractor. Add a new build_invite_rate_limiter function that reads INVITE_RATE_LIMIT_PER_SECOND and INVITE_RATE_LIMIT_BURST from the environment with safe defaults. Apply this limiter only to invite and resend endpoints by grouping those routes into a dedicated Router with route_layer(invite_rate_limit) and merging it into verified_routes. Keep auth/validate endpoints under the existing auth rate limiter.

Milestone 2 centralizes invite email validation and enforces a batch size cap. Create a shared helper module at src/usecases/invites.rs that exposes collect_invite_emails_with_limit plus a default wrapper. Move is_valid_email and dedup/normalize logic there, delete the duplicate functions in src/usecases/boards.rs and src/usecases/organizations/helpers.rs, and update both use cases to call the shared helper. Add a constant DEFAULT_INVITE_EMAIL_LIMIT (25) and allow a per-request override through a function argument so tests can set smaller limits without touching global env.

Milestone 3 replaces plaintext invite tokens with hashes. Add a new migration to add invite_token_hash and index it, drop the NOT NULL constraint on invite_token, and backfill invite_token_hash for existing rows. Implement a small Rust one-off backfill tool (src/bin/backfill_invite_tokens.rs) that reads invite_token values, hashes them with SHA-256, updates invite_token_hash, and nulls invite_token for those rows. Update repository methods to store invite_token_hash instead of invite_token, and update lookups to use the hash. Adjust the OrganizationInviteRecord struct and SQL queries accordingly. Update schema.md to reflect the new column and the removed token index usage.

Milestone 4 makes invite email delivery best-effort. Update send_invite_emails and send_pre_signup_invites in src/usecases/organizations/invites.rs to catch and log email errors (with redacted email) without failing the API response after the transaction is committed. Consider adding a new BusinessEvent if logging needs to be structured; otherwise emit tracing::error logs.

Milestone 5 adds unit tests. Add tests in src/usecases/invites.rs for normalization, duplicate detection, invalid emails, and batch size limits. Add tests in src/auth/invite_tokens.rs (or wherever the hashing helper lives) to assert deterministic SHA-256 output and length. Add a small unit test for InviteKeyExtractor to ensure it uses AuthUser when present and falls back to IP when not.

## Concrete Steps

All commands should run from /Data/rust_project/Real-time_Board unless stated otherwise.

1. Create src/usecases/invites.rs with shared validation helpers and unit tests. Remove duplicate helpers from src/usecases/boards.rs and src/usecases/organizations/helpers.rs, updating call sites.
   Run: cargo test usecases::invites
   Expected: new invite validation tests pass.

2. Add InviteKeyExtractor and build_invite_rate_limiter. Apply the limiter to invite and resend routes via route_layer on a dedicated invite router.
   Run: cargo test invite_key_extractor
   Expected: new key extractor test passes.

3. Add invite token hashing helper and backfill tool, then update repository SQL to write/query invite_token_hash. Add a migration to introduce invite_token_hash and make invite_token nullable. Backfill existing data using the new tool.
   Run: cargo run --bin backfill_invite_tokens
   Expected: output logs total invites scanned and updated; invite_token is null for updated rows.

4. Update send_invite_emails and send_pre_signup_invites to log and continue on email failure.
   Run: cargo test invite_email
   Expected: tests still pass; no new failures.

5. Update docs: docs/CHANGELOG.md, docs/README.md, and schema.md with the new invite token storage and rate limit env vars.
   Run: cargo fmt

## Validation and Acceptance

- Rate limiting: hitting POST /organizations/{organization_id}/members repeatedly from the same user should return HTTP 429 after the configured burst. The limiter should reset after the configured window.
- Token storage: new rows in core.organization_invite must have invite_token_hash set and invite_token NULL. Validation should still accept the emailed token.
- Email sending: if the EmailService returns an error, the API should still respond with success while logging an error.
- Tests: cargo test should pass, including the new invite validation and hashing tests.

## Idempotence and Recovery

- The backfill tool should be safe to rerun; it must skip rows where invite_token_hash is already set.
- The migration should be additive and not delete rows. If a step fails, re-run after fixing; no irreversible data loss should occur.

## Artifacts and Notes

- Expected backfill log example (abbreviated):

    Backfill invite tokens: scanned=120 updated=120 skipped=0

- Expected 429 response example:

    HTTP/1.1 429 Too Many Requests
    x-ratelimit-after: 30

## Interfaces and Dependencies

- New helper module: src/usecases/invites.rs
  - pub fn collect_invite_emails_with_limit(email: Option<String>, emails: Option<Vec<String>>, limit: usize) -> Result<Vec<String>, AppError>
  - pub fn collect_invite_emails(email: Option<String>, emails: Option<Vec<String>>) -> Result<Vec<String>, AppError>
  - pub fn is_valid_email(email: &str) -> bool

- New hashing helper module: src/auth/invite_tokens.rs (or similar)
  - pub fn generate_invite_token() -> String
  - pub fn hash_invite_token(token: &str) -> String

- New binary tool: src/bin/backfill_invite_tokens.rs
  - Reads invite_token and writes invite_token_hash, then sets invite_token to NULL.

- New environment variables:
  - INVITE_RATE_LIMIT_PER_SECOND (default 1)
  - INVITE_RATE_LIMIT_BURST (default 5)

- New dependencies (requires explicit approval before implementation):
  - sha2 = "0.10" (SHA-256 hashing)
  - hex = "0.4" (hex encoding)

Note: If adding new dependencies is not acceptable, replace hashing with PostgreSQL md5() in SQL and update the plan accordingly.

## Plan Update Notes

- 2026-01-28: Updated Progress to reflect invite rate limiter implementation, key extractor tests, and documentation updates for Task 2.
