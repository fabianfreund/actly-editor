# Actly Editor

Desktop AI coding workspace — Tauri v2 + React + TypeScript.

## Docs
- [Architecture](docs/architecture.md) — stack, data flow, module boundaries
- [Panels](docs/panels.md) — panel system, adding new panels
- [Agents](docs/agents.md) — agent types, registries, adding agents
- [Codex Integration](docs/codex-integration.md) — app-server protocol, JSONL events, approval flow

## Quick start

```bash
# Install dependencies
npm install

# Run in dev mode (starts Tauri + Vite)
npm run tauri:dev

# Frontend only (no Tauri)
npm run dev

# Production build
npm run tauri:build
```

## Key conventions

| What | Where |
|---|---|
| Add a panel | `src/layout/panels.registry.ts` |
| Add an agent type | `src/registries/agents.registry.ts` |
| Add an action button | `src/registries/actions.registry.ts` |
| Tauri commands (Rust) | `src-tauri/src/commands/` |
| SQLite schema | `src-tauri/src/db/migrations/001_initial.sql` |
| Persistent state | SQLite via `@tauri-apps/plugin-sql` (JS) |
| UI state | Zustand stores in `src/store/` |
| Tauri command wrappers | `src/services/tauri.ts` |
| Codex WS client | `src/services/codex.ts` |

## Prerequisites
- Rust (via rustup)
- Node.js 18+
- Codex CLI (`codex` in PATH) — for agent features
