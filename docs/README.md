# Real-time Collaborative Whiteboard - Documentation

## Welcome

This directory contains comprehensive architecture and technical documentation for the Real-time Collaborative Whiteboard project.

---

## Documentation Structure

```
docs/
├── README.md (this file)
├── architecture/
│   ├── ARCHITECTURE_OVERVIEW.md          # System architecture overview
│   ├── SECURITY.md                        # Security architecture
│   ├── c4-model/                          # C4 model diagrams
│   │   ├── 01-context-diagram.md
│   │   ├── 02-container-diagram.md
│   │   └── 03-component-diagram.md
│   ├── diagrams/
│   │   └── data-flow.md                   # Data flow diagrams
│   └── adrs/                              # Architecture Decision Records
│       ├── README.md
│       ├── 001-use-rust-axum-backend.md
│       └── 002-use-yjs-for-crdt.md
├── api/
│   └── API_DOCUMENTATION.md               # API reference
└── deployment/
    └── DEPLOYMENT_GUIDE.md                # Deployment guide
```

---

## Quick Start

### For Developers

1. **Understanding the System**:
   - Start with [Architecture Overview](./architecture/ARCHITECTURE_OVERVIEW.md)
   - Review [C4 Context Diagram](./architecture/c4-model/01-context-diagram.md) for high-level view

2. **API Integration**:
   - Read [API Documentation](./api/API_DOCUMENTATION.md)
   - Check [Data Flow Diagrams](./architecture/diagrams/data-flow.md) for request patterns
   - Organization endpoints:
    - `GET /organizations` (list orgs for current user)
    - `POST /organizations` (creator becomes owner)
    - `GET /organizations/slug-availability` (slug check)
    - `POST /organizations/{org_id}/members` (invite members)
    - `GET /organizations/{org_id}/members` (list members)
    - `GET /organizations/{org_id}/usage` (resource usage + warnings)
    - `PATCH /organizations/{org_id}/subscription` (update tier + limits)
    - `GET /organizations/invites/validate` (validate pre-signup invite token)
    - `GET /organizations/{org_id}/invites` (list pre-signup invites)
    - `POST /organizations/{org_id}/invites/{invite_id}/resend` (resend email invite)
    - `DELETE /organizations/{org_id}/invites/{invite_id}` (cancel email invite)
    - `PATCH /organizations/{org_id}/members/{member_id}` (update member role)
    - `DELETE /organizations/{org_id}/members/{member_id}` (remove member)
    - `POST /organizations/{org_id}/members/{member_id}/resend` (resend invite)
    - `GET /users/me/invitations` (list pending invites)
    - `POST /organizations/{org_id}/members/{member_id}/accept` (accept invite)
    - `DELETE /organizations/{org_id}/members/{member_id}/decline` (decline invite)
   - Board member endpoints:
    - `GET /api/boards/{board_id}/members` (list board members)
    - `POST /api/boards/{board_id}/members` (invite existing users)
    - `PATCH /api/boards/{board_id}/members/{member_id}` (update member role)
    - `DELETE /api/boards/{board_id}/members/{member_id}` (remove board member)
   - Invites send real email when SMTP is configured (`SMTP_HOST`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`).
   - Invites to emails without accounts are stored and attached on invite-based registration.
   - Boards list respects board membership; org owners/admins can access all org boards after accepting the workspace invite.

3. **Frontend Routes**:
   - Organization creation UI: `/organizations/new`
   - Organization member management UI: `/organizations/$orgId/members`
   - Pending invitations surface on `/dashboard` and `/invitations`
   - Board sharing dialog: `Share` button on `/board/$boardId`

4. **Security**:
   - Review [Security Architecture](./architecture/SECURITY.md)
   - Understand authentication and authorization flows

### For DevOps/SRE

1. **Deployment**:
   - Follow [Deployment Guide](./deployment/DEPLOYMENT_GUIDE.md)
   - Review infrastructure requirements and scaling strategies

2. **Monitoring**:
   - Configure logging (see Deployment Guide)
   - Set up health checks and alerts

### For Architects

1. **Design Decisions**:
   - Browse [Architecture Decision Records (ADRs)](./architecture/adrs/)
   - Understand rationale behind technology choices

2. **System Design**:
   - Study [Container Diagram](./architecture/c4-model/02-container-diagram.md)
   - Review [Component Diagram](./architecture/c4-model/03-component-diagram.md)

---

## Key Documents

| Document | Description | Audience |
|----------|-------------|----------|
| [Architecture Overview](./architecture/ARCHITECTURE_OVERVIEW.md) | Comprehensive system architecture, patterns, and design | All |
| [C4 Model Diagrams](./architecture/c4-model/) | Visual architecture documentation (Context, Container, Component) | Architects, Developers |
| [Data Flow Diagrams](./architecture/diagrams/data-flow.md) | Sequence diagrams and data flow patterns | Developers |
| [API Documentation](./api/API_DOCUMENTATION.md) | Complete API reference with examples | Frontend Developers, Integrators |
| [Security Architecture](./architecture/SECURITY.md) | Security controls, threat model, compliance | Security Team, Developers |
| [ADRs](./architecture/adrs/) | Architecture decisions and rationale | Architects, Tech Leads |
| [Deployment Guide](./deployment/DEPLOYMENT_GUIDE.md) | Deployment instructions for all environments | DevOps, SRE |

---

## Technology Stack Summary

### Backend
- **Language**: Rust 1.75+
- **Framework**: Axum 0.8 (web server)
- **Runtime**: Tokio (async)
- **Database**: PostgreSQL 17 (with PostGIS)
- **ORM**: SQLx 0.8 (compile-time SQL verification)
- **CRDT**: Yrs (Rust port of Yjs)
- **Authentication**: JWT (jsonwebtoken) + Argon2 (password hashing)

### Frontend
- **Framework**: React 19
- **Build Tool**: Vite 7
- **Routing**: TanStack Router (file-based)
- **State Management**: Zustand (client state), TanStack Query (server state)
- **CRDT**: Yjs (JavaScript)
- **Real-time**: y-websocket (WebSocket provider for Yjs)
- **Canvas**: PixiJS + @pixi/react
- **Styling**: Tailwind CSS 4
- **UI Components**: Radix UI primitives

### Infrastructure
- **Containers**: Docker + Docker Compose
- **Database Admin**: pgAdmin 4
- **Cloud**: AWS (ECS/Fargate, RDS, S3, CloudFront)

---

## Configuration Highlights

- **Invite rate limiting** (org invites, invite resend, board invites):
  - `INVITE_RATE_LIMIT_PER_SECOND` (default: 1)
  - `INVITE_RATE_LIMIT_BURST` (default: 5)

---

## Architecture Highlights

### Clean Architecture (Backend)

```
External Interfaces (API/WebSocket Handlers)
           ↓
   Use Cases (Business Logic)
           ↓
 Repositories (Data Access)
           ↓
Infrastructure (Database, SMTP)
```

### Real-time Collaboration (CRDT)

- **Technology**: Yjs (Conflict-free Replicated Data Type)
- **Protocol**: Binary WebSocket messages
- **Conflict Resolution**: Automatic (no user intervention)
- **Persistence**: Snapshots every 5 minutes
- **Performance**: Sub-second synchronization for 10+ concurrent users

### Multi-Tenancy

- **Organizations**: Teams with shared boards and members
- **Roles**: Owner, Admin, Member, Guest (org-level)
- **Board Roles**: Owner, Admin, Editor, Commenter, Viewer
- **Row-Level Security**: PostgreSQL RLS policies enforce access control

---

## Development Workflow

### 1. Database Changes

```bash
# Create migration
sqlx migrate add my_migration_name

# Edit migration file
vim migrations/XXXXXX_my_migration_name.sql

# Run migration
sqlx migrate run
```

### 2. API Changes

1. **Define DTO** (`src/dto/`)
2. **Update Use Case** (`src/usecases/`)
3. **Add Repository Method** (`src/repositories/`)
4. **Create Handler** (`src/api/http/` or `src/api/ws/`)
5. **Update Router** (`src/app/router.rs`)
6. **Document API** (`docs/api/API_DOCUMENTATION.md`)

### 3. Frontend Changes

1. **Add API Function** (`src/features/*/api.ts`)
2. **Update State** (Zustand store or TanStack Query)
3. **Create Component** (`src/components/` or `src/features/`)
4. **Add Route** (`src/routes/`)

### 4. Architecture Decisions

1. **Propose ADR** (create in `docs/architecture/adrs/`)
2. **Team Discussion** (review meeting)
3. **Update Status** (`Proposed` → `Accepted` or `Rejected`)
4. **Implement** (code changes)
5. **Update Index** (`docs/architecture/adrs/README.md`)

---

## Documentation Maintenance

### When to Update Documentation

| Trigger Event | Documents to Update |
|---------------|---------------------|
| New API endpoint | API Documentation |
| Database schema change | Architecture Overview, Data Flow Diagrams |
| Major technology change | ADR (new), Architecture Overview |
| Security change | Security Architecture |
| Deployment process change | Deployment Guide |
| New architectural pattern | C4 diagrams, Architecture Overview |

### Update Frequency

- **Architecture Docs**: Update immediately when architecture changes
- **API Docs**: Update with every API change (part of PR)
- **ADRs**: Create before implementing major architectural decisions
- **Deployment Guide**: Update when deployment process changes
- **Quarterly Review**: Review all docs for accuracy

### Documentation Standards

1. **Markdown**: Use GitHub-flavored Markdown
2. **Diagrams**: Mermaid for sequence/flow diagrams, C4 model notation
3. **Code Examples**: Include language tags for syntax highlighting
4. **Links**: Use relative paths for internal links
5. **Versioning**: Include document version and last updated date

### Automation Opportunities

**Future Enhancements:**
- Auto-generate API docs from OpenAPI spec
- Auto-update C4 diagrams from code annotations (Structurizr)
- Automated diagram rendering (Mermaid CLI)
- Documentation linting (markdownlint)
- Link checking (markdown-link-check)

---

## Contributing to Documentation

### Process

1. **Create Branch**: `docs/update-api-documentation`
2. **Make Changes**: Edit relevant `.md` files
3. **Validate**: Check for broken links, formatting
4. **Create PR**: Include screenshots for diagram changes
5. **Review**: Assigned to architecture team
6. **Merge**: Squash merge to main

### Style Guide

**Writing Style:**
- Clear and concise
- Active voice preferred
- Avoid jargon (or explain when necessary)
- Examples for complex concepts

**Code Blocks:**
```rust
// Include language for syntax highlighting
fn example() {
    println!("Like this!");
}
```

**Diagrams:**
- Use Mermaid for sequence/flowcharts
- Use PlantUML/draw.io for complex architecture diagrams
- Include alt text for accessibility

**Headings:**
- Use hierarchical structure (H1 → H2 → H3)
- Include table of contents for long documents

---

## Feedback and Questions

### Channels

- **Technical Questions**: GitHub Discussions
- **Bug Reports**: GitHub Issues (label: `documentation`)
- **Urgent Security**: security@example.com (see Security Architecture)

### Documentation Improvement Requests

File an issue with:
- Document name
- Section that needs improvement
- Proposed change or question
- Context (your role, what you're trying to accomplish)

---

## License

This documentation is part of the Real-time Collaborative Whiteboard project.

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.26 | 2026-01-28 | Hash pre-signup invite tokens in storage and mark plaintext tokens as deprecated. |
| 1.25 | 2026-01-06 | Applied live board role updates and enforced edit permissions without refresh. |
| 1.24 | 2026-01-06 | Cleaned up presence on disconnect, added cursor sweep, and fixed awareness update decoding. |
| 1.23 | 2026-01-06 | Stabilized presence to avoid duplicate cursors on refresh. |
| 1.22 | 2026-01-06 | Prevented members from changing their own workspace role. |
| 1.21 | 2026-01-06 | Added password placeholder on registration form. |
| 1.20 | 2026-01-06 | Added password visibility toggle on the login form. |
| 1.19 | 2026-01-06 | Added board invite UX hint about workspace invite acceptance. |
| 1.18 | 2026-01-06 | Redirect board access to invitations when workspace invite is pending. |
| 1.17 | 2026-01-06 | Board invites now auto-create guest workspace invites and require acceptance before access. |
| 1.16 | 2026-01-06 | Transfer board ownership and remove board memberships when removing organization members. |
| 1.15 | 2026-01-06 | Allowed organization owners/admins to access all org boards in read-only mode by default. |
| 1.14 | 2026-01-06 | Documented board list filtering and clarified board usage display behavior. |
| 1.13 | 2026-01-06 | Added invite token validation and auto-accept on invite-based registration. |
| 1.12 | 2026-01-06 | Shifted pre-signup invite acceptance to email verification. |
| 1.11 | 2026-01-06 | Added dedicated invitations route with account mismatch handling. |
| 1.10 | 2026-01-06 | Standardized UI error messages to hide API error codes. |
| 1.9 | 2026-01-06 | Excluded workspace owners from member limit usage counts. |
| 1.8 | 2026-01-06 | Updated pricing UI and member invite limit UX. |
| 1.7 | 2026-01-06 | Added subscription tier update endpoint and limit recalculation. |
| 1.6 | 2026-01-06 | Added migration to backfill tier-based organization limits. |
| 1.5 | 2026-01-06 | Auto-map subscription tiers to organization limits. |
| 1.4 | 2026-01-06 | Added dashboard usage widget for workspace limits. |
| 1.3 | 2026-01-06 | Added organization usage UI warnings and board limit hints. |
| 1.2 | 2026-01-06 | Enforced organization resource limits and added usage endpoint. |
| 1.1 | 2026-01-05 | Added organization email invite resend/cancel endpoints and UI actions. |
| 1.0 | 2026-01-04 | Initial comprehensive documentation |

**Next Review:** 2026-04-14
