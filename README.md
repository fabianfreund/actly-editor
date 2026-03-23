# Actly Editor

Desktop AI coding workspace built with Tauri, React, and TypeScript.

Actly Editor gives you a task-driven interface for working with coding agents inside a real desktop app. You can open a repository, break work into tasks, assign different agents to different stages, review approvals inline, inspect terminal output, and keep project context visible in one dockable workspace.

It is designed around a simple idea: planning, implementation, and review should feel like parts of the same workspace instead of separate tools. Patty the Planner can improve and rewrite tasks with repo-aware context, while Bob the Builder can execute implementation work and move tasks through delivery.

![Status: MVP](https://img.shields.io/badge/status-MVP-blue)

## What It Does

- Open local repositories as workspaces
- Organize work in a kanban-style task board
- Run Codex agents inside the app through `codex app-server`
- Use role-specific agents like Patty the Planner and Bob the Builder
- Stream agent chat, steps, approvals, and terminal activity live
- Track task activity, comments, references, and attachments
- Review Git changes without leaving the app

## Built-In Agent Flow

- **Patty the Planner** improves tasks before implementation
  Patty moves tasks into `improving`, inspects the codebase, rewrites the title and notes with better context, then moves the task back to `planned`.
- **Bob the Builder** executes implementation work
  Bob moves tasks into `in_progress`, does the work, and completes them into `done`.

You can also trigger agents from task comments with mentions like `@planner` or `@builder`.

## Stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri v2 |
| Frontend | React 19 + TypeScript + Vite |
| Layout system | flexlayout-react |
| State | Zustand |
| Persistence | SQLite via `@tauri-apps/plugin-sql` |
| Terminal | xterm.js |
| Agent runtime | Codex CLI App Server |
| Native layer | Rust |

## Requirements

| Tool | Version |
|---|---|
| Node.js | 18+ |
| Rust | current stable via `rustup` |
| Codex CLI | available on `PATH` |

Quick check:

```bash
node --version
cargo --version
codex --version
```

## Getting Started

```bash
npm install
npm run tauri:dev
```

Useful commands:

```bash
# Frontend only
npm run dev

# Production web build
npm run build

# Desktop production build
npm run tauri:build
```

On first launch, open a project folder. If the project does not have an `.actly/` folder yet, the app can scaffold and initialize it for you.

## How To Use It

1. Open a repository as a workspace.
2. Create a task in the plan board.
3. Assign Patty to improve the task or Bob to implement it.
4. Review chat, task activity, approvals, and terminal output as the run progresses.
5. Use the Git and Actions panels to finish the loop.

## Project Structure

```text
actly-editor/
├── src/
│   ├── components/        # shared UI building blocks
│   ├── layout/            # workspace shell and panel layout
│   ├── panels/            # task board, task detail, agent chat, terminal, git
│   ├── registries/        # built-in panels, agents, actions, models
│   ├── services/          # db access, codex client, tauri wrappers
│   └── store/             # Zustand stores
├── src-tauri/
│   └── src/
│       ├── commands/      # codex + git native commands
│       └── db/            # sqlite migrations
├── docs/                  # architecture and implementation notes
└── CLAUDE.md              # contributor guide for this repo
```

## Documentation

- [CLAUDE.md](CLAUDE.md)
- [Architecture](docs/architecture.md)
- [Panels](docs/panels.md)
- [Agents](docs/agents.md)
- [Codex Integration](docs/codex-integration.md)

## License

This project is open and free to use for both personal and professional work.

You may use, modify, and deploy it internally, but you may **not** resell the software itself or redistribute it as a paid competing product without explicit permission.

In other words:

- personal use is allowed
- professional and commercial internal use is allowed
- modification is allowed
- resale of the software itself is not allowed

If you want stricter legal wording, add a dedicated `LICENSE` file with the final license text used for distribution.
