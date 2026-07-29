# ADR-003: Monorepo with npm Workspaces + Turborepo

## Status: Accepted

## Context
The project spans client, server, shared libraries, and tooling. We need:
- Shared TypeScript types between client/server
- Shared simulation code (`game-core`)
- Independent deployability of apps
- Fast CI with task caching
- Simple developer experience

## Decision
- **npm workspaces** for dependency management (no extra tooling like pnpm/yarn)
- **Turborepo** for task orchestration and caching
- **TypeScript project references** for incremental builds
- **Vite** for client bundling, **tsx** for server dev

## Consequences
- Single `npm install` at root
- `turbo run build` builds in dependency order with caching
- Shared packages (`game-core`, `net-protocol`, `content-schema`) are workspace dependencies
- Server-side tools (`tools-tripo`, `tools-eleven`) never bundled into client
- Clear boundary: client imports from `packages/*`, never from `apps/server`
