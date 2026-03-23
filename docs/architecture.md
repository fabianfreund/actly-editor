# Architecture

## Stack

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
