# Actly Editor

Visual workspace for AI-assisted coding. Orchestrate Codex CLI agents, track tasks, review code changes, and preview your app — all from one dockable panel layout.

![Status: MVP](https://img.shields.io/badge/status-MVP-blue)

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Rust | 1.77+ | [rustup.rs](https://rustup.rs) |
| Node.js | 18+ | [nodejs.org](https://nodejs.org) |
| Codex CLI | latest | `npm install -g @openai/codex` |

Verify everything is in place:
```bash
cargo --version
node --version
codex --version
```

## Setup

```bash
# 1. Clone the repo
git clone https://github.com/your-org/actly-editor
cd actly-editor

# 2. Install JS dependencies
npm install
```

## Run

```bash
# Development (Tauri + hot-reload)
npm run tauri:dev

# Frontend only (no native features — useful for UI work)
npm run dev
```

On first launch, Actly will ask you to open a project folder.

## Configure

1. Open **Settings** panel (drag it from the layout or add a tab)
2. Enter your API key — `OPENAI_API_KEY` or `MINIMAX_API_KEY`
3. Choose model and approval mode per agent

API keys are stored in your OS secure store (never committed to disk).

## Usage

1. **Open a project folder** — title bar → folder name button
2. **Create a task** — Tasks panel → `+` → enter title
3. **Start an agent** — select a task → Agent panel → pick Planner or Bob → click **Start**
4. **Watch it work** — Agent panel streams events, Terminal shows commands
5. **Approve actions** — when Codex needs permission, an inline prompt appears in the Agent panel
6. **Review + commit** — Git panel shows diffs, stage files, write a commit message

## Build for production

```bash
npm run tauri:build
```

Output is in `src-tauri/target/release/bundle/`.

## Project structure

```
actly-editor/
├── src/                    # React frontend
│   ├── layout/             # flexlayout-react workspace
│   ├── panels/             # one folder per panel
│   ├── registries/         # panels, agents, actions — extend here
│   ├── services/           # codex WS client, Tauri wrappers, SQLite
│   └── store/              # Zustand state
├── src-tauri/              # Rust backend
│   ├── src/commands/       # git, codex process management
│   └── src/db/             # SQLite schema + migrations
└── docs/                   # architecture, panels, agents, codex integration
```

See [CLAUDE.md](CLAUDE.md) for the full developer reference.
