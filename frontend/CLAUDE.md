# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev      # Start Vite dev server with HMR
npm run build    # Type-check (tsc -b) then build for production
npm run lint     # Run ESLint
npm run preview  # Preview production build locally
```

Bun is also available as an alternative package manager (`bun.lock` present).

## Architecture Overview

This is a React 19 + TypeScript real-time collaborative whiteboard application.

### Tech Stack
- **Build**: Vite 7.2 with TanStack Router Plugin
- **Routing**: TanStack Router (file-based routing in `src/routes/`)
- **State Management**: Zustand for auth/user state, TanStack Query for server state
- **Real-time Collaboration**: Yjs (CRDT) with y-websocket for conflict-free editing
- **Canvas**: Konva + react-konva for whiteboard drawing
- **Styling**: Tailwind CSS 4 with shadcn/ui-style components
- **HTTP**: Axios with auto Bearer token injection

### Key Directories
- `src/routes/` - File-based routes (auto-generates `routeTree.gen.ts`)
- `src/components/ui/` - Reusable UI primitives (Button, Input, Dialog, etc.)
- `src/components/dashboard/` - Dashboard-specific components
- `src/store/useAppStore.ts` - Zustand auth store
- `src/lib/api.ts` - Axios instance and API functions
- `src/types/` - TypeScript interfaces for auth, boards, elements

### Route Structure
- `/` - Landing page
- `/login`, `/register` - Auth pages (redirect to dashboard if authenticated)
- `/dashboard` - Board list and management (protected)
- `/board/$boardId` - Real-time collaborative canvas editor (protected)

### Authentication Flow
1. JWT stored in localStorage
2. `checkAuth()` validates token via `GET /users/me` on app mount
3. Axios interceptor auto-injects `Authorization: Bearer` header
4. Route guards in `beforeLoad` redirect unauthenticated users

### Real-time Collaboration (board.$boardId.tsx)
- WebSocket connects to `ws://localhost:3000/ws/boards/{boardId}?token={token}`
- Yjs Y.Doc manages shared state with automatic conflict resolution
- Awareness protocol tracks live cursor positions
- Binary message format: `[0, ...]` for sync, `[1, ...]` for awareness

### API Layer
Backend expected at `http://localhost:3000`:
- `POST /api/boards/` - Create board
- `GET /api/boards/list` - List user's boards
- `GET /api/boards/{boardId}/elements` - Get board elements
- `POST /auth/login`, `POST /auth/register` - Authentication

### Path Alias
`@/*` resolves to `./src/*` (configured in vite.config.ts and tsconfig)
