# Architecture

## Agentic Coding Platform

| Layer | Technology |
|---|---|
| Desktop shell | Tauri v2 (Rust) |
| Frontend | React 19 + TypeScript + Vite |
| Panel layout | flexlayout-react |
| Styling | Tailwind v4 + CSS custom properties (VS Code dark+ tokens) |
| UI state | Zustand |
| Async data | TanStack Query |
| Persistence | SQLite via @tauri-apps/plugin-sql |
| Terminal | xterm.js + FitAddon |
| Agent protocol | Codex app-server over WebSocket (JSONL-RPC) |
| Git | git2 Rust crate (via Tauri commands) |

## Data flow

```
User interaction
  ↓
React panel (UI state via Zustand)
  ↓
services/tauri.ts (invoke Tauri commands)   services/codex.ts (WebSocket → Codex app-server)
  ↓                                              ↓
src-tauri/src/commands/                     Codex CLI process (spawned by Tauri)
  - git.rs (git2)                               ↓
  - codex.rs (process management)          JSONL events → CodexClient.on("*")
  ↓                                              ↓
SQLite (via plugin-sql)                    AgentThread panel + Terminal panel
```

## Module boundaries

**Rule: keep Rust thin.** Only native access goes in Rust:
- Git operations (git2 crate)
- Spawning/killing Codex app-server processes
- SQLite migrations (registered at startup)

Everything else is TypeScript:
- All SQL queries (`services/db.ts`)
- Codex WebSocket communication (`services/codex.ts`)
- Business logic in panels and stores

## UI styling principles

- Workspace screens should look like editor surfaces, not marketing pages.
- Favor split panes, panel headers, token-based colors, and subtle borders over decorative gradients or oversized copy.
- Reserve stronger visual treatments for true empty states, onboarding, or external landing pages.

## State model

```
SQLite (persistent)         Zustand (ephemeral UI)
─────────────────           ──────────────────────
tasks                       useWorkspaceStore
  task_events                 projectPath
agents                        activeTaskId
sessions                      codexPort
                            useTasksStore
                              tasks[]
                              events{}
                            useAgentsStore
                              agents[]
                              sessions[]
                              events{}
```

### Task status values

Valid statuses: `icebox`, `planned`, `in_progress`, `done`.

The statuses `improving` and `blocked` have been removed. `normalizeStatus()` in `src/services/db.ts` maps any legacy DB value to `"icebox"` so old rows are handled transparently.

### Migrations

SQLite migrations live in `src-tauri/src/db/migrations/` and must be registered in `lib.rs` in order. Migration `004_add_workspace_indexes.sql` adds `workspace_id` to `task_events`, `sessions`, and `task_attachments`. It must be present or comment posting and agent session creation will silently fail.
