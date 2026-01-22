# Refactor organization members frontend route and backend usecases

This ExecPlan is a living document. The sections Progress, Surprises & Discoveries, Decision Log, and Outcomes & Retrospective must be kept up to date as work proceeds.

This plan must be maintained in accordance with .agent/PLANS.md.

## Purpose / Big Picture

Organization member management is currently concentrated in two large files, which makes the code hard to navigate and risky to change. After this refactor, the frontend organization members route will use dedicated components for the usage header, invite flow, and member list, plus extracted mutation hooks, while the backend organization usecase file will be split into domain modules for members, invites, and usage/subscription. The user-visible behavior should remain unchanged, and the refactor can be validated by loading the organization members page, inviting users, and exercising member role changes and email invite actions without any regressions.

## Progress

- [x] (2026-01-08 09:30Z) Draft ExecPlan and capture baseline assumptions.
- [x] (2026-01-08 10:05Z) Refactor frontend route by extracting InviteMembersCard, UsageHeader, MemberList, and mutation hooks.
- [x] (2026-01-08 10:15Z) Split backend usecases/organizations into members, invites, and usage/subscription modules.
- [x] (2026-01-08 10:18Z) Update documentation in docs/CHANGELOG.md.
- [ ] Validate behavior with manual verification or tests.

## Surprises & Discoveries

- None yet.

## Decision Log

- Decision: Create new frontend components under frontend/src/features/organizations/components and hooks under frontend/src/features/organizations/hooks.
  Rationale: Matches existing feature-first structure and keeps route files lean.
  Date/Author: 2026-01-08 / Codex
- Decision: Split backend usecase logic into modules under src/usecases/organizations/ with shared helpers in a dedicated helpers module.
  Rationale: Keeps OrganizationService intact while grouping domain logic and reusing helper functions safely.
  Date/Author: 2026-01-08 / Codex

## Outcomes & Retrospective

- Pending.

## Context and Orientation

Frontend organization membership UI is defined in frontend/src/routes/organizations.$orgId.members.tsx, which currently handles data fetching, invite forms, usage display, and member list rendering in one file. Organization-related API calls are defined in frontend/src/features/organizations/api.ts. The backend organization business logic is centralized in src/usecases/organizations.rs, which provides OrganizationService methods for member management, invites, and usage/subscription handling.

The refactor will introduce dedicated UI components for the usage header, invite card, and member list, and new hooks for API mutations. The backend will move OrganizationService impl blocks into submodules while preserving the public API (OrganizationService type and exported helper functions such as max_boards_for_tier and send_invite_emails).

## Plan of Work

First, refactor the frontend route. Extract the usage header, invite card, and member list sections into separate component files under frontend/src/features/organizations/components, passing explicit props for data, permissions, and event callbacks. Move API mutation logic (invite, role update, remove member, resend invite, email invite resend/cancel) into dedicated hooks under frontend/src/features/organizations/hooks, keeping error handling and in-flight state there. Update the route file to compose these components/hooks and keep only orchestration and state.

Next, refactor the backend usecase file by introducing a module directory src/usecases/organizations/. Create mod.rs to define OrganizationService and shared exports. Move member-related methods into members.rs, invite-related methods into invites.rs, and usage/subscription logic into usage.rs and subscription.rs (or a combined module). Extract shared helper functions (slug normalization, role checks, email helpers, usage calculations) into helpers.rs or the appropriate module, ensuring public items remain available where needed. Update src/usecases/mod.rs and any imports that reference usecases::organizations to account for the new module layout.

Finally, update docs/CHANGELOG.md with a short note about the refactor, and run/describe validation steps.

## Concrete Steps

1. Create new frontend component files:
   - frontend/src/features/organizations/components/UsageHeader.tsx
   - frontend/src/features/organizations/components/InviteMembersCard.tsx
   - frontend/src/features/organizations/components/MemberList.tsx
   Each component should take typed props for data, permissions, and event handlers and render the UI currently in the route.

2. Create new frontend hooks:
   - frontend/src/features/organizations/hooks/useOrganizationMemberMutations.ts
   - frontend/src/features/organizations/hooks/useOrganizationInviteMutations.ts
   These should wrap the API calls in api.ts and expose async handlers plus loading/error state.

3. Update frontend/src/routes/organizations.$orgId.members.tsx to:
   - Use the new hooks for mutations.
   - Render the new components with props.
   - Keep only route-level state and orchestration logic.

4. Split backend usecase file:
   - Move OrganizationService methods into modules: members.rs, invites.rs, usage.rs, subscription.rs.
   - Create src/usecases/organizations/mod.rs to host OrganizationService struct and shared exports.
   - Move helper functions (slug, role checks, usage calculations, email helpers) into helpers.rs (or keep in mod.rs if shared).
   - Update src/usecases/mod.rs and any module paths for tests or exports.

5. Update docs/CHANGELOG.md with a short entry about the refactor.

6. Validate:
   - Start frontend (npm run dev) and open /organizations/$orgId/members to confirm usage, invites, and member list behaviors.
   - Run cargo test or targeted tests if applicable.

## Validation and Acceptance

The organization members page should render usage cards, invite inputs, and member list unchanged. Inviting members, resending invites, and removing members should work as before. The backend should compile with the new module layout, and all existing tests should pass. If running locally, start the server with cargo run and verify the API endpoints for member and invite operations still respond successfully.

## Idempotence and Recovery

These refactors are code-only. If a step fails, revert the last file edits and rerun. Module changes can be undone by restoring the original organizations.rs layout.

## Artifacts and Notes

Add any relevant command transcripts or key diffs here once changes are made.

## Interfaces and Dependencies

- New frontend components: InviteMembersCard, UsageHeader, MemberList in frontend/src/features/organizations/components/.
- New frontend hooks for API mutations in frontend/src/features/organizations/hooks/.
- Backend usecase modules: src/usecases/organizations/mod.rs, members.rs, invites.rs, usage.rs, subscription.rs (plus helpers if needed).
- OrganizationService remains the primary API in usecases::organizations, and helper exports (max_boards_for_tier, send_invite_emails) must remain accessible to existing callers (e.g., src/usecases/boards.rs).

Plan note: Initial plan drafted on 2026-01-08; implementation has not started yet.

Plan update note: Marked frontend/backend refactor and docs update complete after extracting new components/hooks and splitting usecase modules.
