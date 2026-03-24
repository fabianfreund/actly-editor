# Codex CLI Integration

Actly uses the [OpenAI Codex CLI](https://github.com/openai/codex) in **App Server** mode — a headless server that exposes a JSON-RPC-over-WebSocket interface for IDE and app integration.

---

## Installation

```bash
# npm (recommended)
npm install -g @openai/codex

# Homebrew
brew install --cask codex
```

Verify it works:
```bash
codex --version
```

You can also point Actly to a custom binary path in **Settings → Codex CLI path** (useful if `codex` is not in `$PATH` or you want to pin a specific version).

---

## Authentication

Codex needs an OpenAI API key (or OAuth login):

```bash
# Non-interactive API key setup (recommended for CI / headless use)
printenv OPENAI_API_KEY | codex login --with-api-key

# Interactive browser login
codex login
```

The key is stored in `~/.codex/`. Once set it persists across restarts.

> **Note:** If `OPENAI_API_KEY` is set as an environment variable it silently overrides any stored OAuth token. Unset it if you're using OAuth login.

---

## How Actly uses Codex

```
Tauri (Rust)                        Frontend (TypeScript)
──────────────────────────────────  ──────────────────────────────────────
codex::start_codex_server()         services/codex.ts → CodexClient
  spawns: codex app-server            connects ws://127.0.0.1:{port}
    --listen ws://127.0.0.1:{port}    sends JSON-RPC requests
    --cwd {projectPath}               receives event stream
  returns: port number
```

Each task session gets its own port. Tauri keeps a `sessionId → port` map and kills the process on app close.

---

## App-Server Mode

```bash
# WebSocket mode (used by Actly — marked experimental by OpenAI)
codex app-server --listen ws://127.0.0.1:4500

# Stdio mode (default, used by VS Code extension)
codex app-server
```

Health probes on the WebSocket server:
- `GET /readyz` → 200 when accepting connections
- `GET /healthz` → 200 always (rejects requests with `Origin` header)

---

## Protocol

**Wire format:** JSON-RPC 2.0 *without* the `"jsonrpc":"2.0"` field. One JSON object per WebSocket text frame.

Three message shapes:

```jsonc
// Client → Server: request (expects a response)
{ "method": "thread/start", "id": 1, "params": { ... } }

// Server → Client: response
{ "id": 1, "result": { "thread": { "id": "thr_abc123" } } }

// Server → Client: notification / event (no response expected)
{ "method": "turn/started", "params": { "turn": { "id": "turn_xyz" } } }
```

### Required initialization handshake

Must be the **first** messages sent after connecting. Actly sends this in `CodexClient.connect()` before any thread or turn request.

```jsonc
// 1. Send initialize (with id)
{
  "method": "initialize",
  "id": 0,
  "params": {
    "clientInfo": {
      "name": "actly-editor",
      "title": "Actly Editor",
      "version": "0.1.0"
    },
    "capabilities": {
      "experimentalApi": true
    }
  }
}

// 2. Send initialized (notification, no id)
{ "method": "initialized" }
```

---

## Core Methods

### Start a thread

```jsonc
{
  "method": "thread/start",
  "id": 1,
  "params": {
    "model": "codex-mini-latest",
    "cwd": "/Users/me/my-project",
    "approvalPolicy": "on-request",
    "ephemeral": true,
    "serviceName": "actly-editor"
  }
}
```

Response includes `result.thread.id` — this is the **real thread ID** you must use in all subsequent calls.

```jsonc
{ "id": 1, "result": { "thread": { "id": "thr_abc123" } } }
```

Actly starts one app-server process per **session**, then calls `thread/start` and stores the returned Codex thread id in `sessions.codex_thread_id`.

### Send a user message (start a turn)

```jsonc
{
  "method": "turn/start",
  "id": 2,
  "params": {
    "threadId": "thr_abc123",
    "input": [{ "type": "text", "text": "Fix the bug in auth.ts" }]
  }
}
```

`input` can also include images:
```jsonc
{ "type": "localImage", "path": "/tmp/screenshot.png" }
```

Turn-level overrides belong on `turn/start`, not `thread/start`. Actly currently uses that for:
- `collaborationMode.settings.developer_instructions`
- optional per-turn `cwd`
- per-turn `approvalPolicy`
- optional per-turn `model`

### Resume an existing thread

```jsonc
{ "method": "thread/resume", "id": 3, "params": { "threadId": "thr_abc123" } }
```

### Interrupt a running turn

```jsonc
{ "method": "turn/interrupt", "id": 4, "params": { "threadId": "thr_abc123", "turnId": "turn_456" } }
```

---

## Events (Server → Client Notifications)

### Turn lifecycle

| Method | Meaning |
|---|---|
| `thread/started` | Thread created or resumed — **captures the real `thread_id`** |
| `turn/started` | Agent started a new turn |
| `turn/completed` | Turn finished (`status`: `completed` \| `interrupted` \| `failed`) |
| `turn/plan/updated` | Agent's plan was updated |

### Streaming output

| Method | Meaning |
|---|---|
| `item/agentMessage/delta` | Streamed agent text (append to display buffer) |
| `item/commandExecution/outputDelta` | Streamed stdout/stderr from a shell command |
| `item/fileChange/outputDelta` | Streamed diff output |
| `item/started` | A new work item (command, file edit) is beginning |
| `item/completed` | Work item finished — authoritative final state |

### Approvals (server-initiated requests)

When Codex needs permission it sends a **request** (with an `id`) expecting a client response:

| Method | Meaning |
|---|---|
| `item/commandExecution/requestApproval` | Agent wants to run a shell command |
| `item/fileChange/requestApproval` | Agent wants to write a file |

Respond by sending a regular response to the request's `id`:

```jsonc
{
  "id": 42,
  "result": {
    "decision": "accept"
  }
}
```

Decision values:
| Value | Effect |
|---|---|
| `"accept"` | Run once |
| `"acceptForSession"` | Run and trust for the rest of this session |
| `"decline"` | Skip this action |
| `"cancel"` | Abort the entire turn |

> **Current code uses `client.respondToApproval(requestId, approved)`** which sends `approval/respond` — this is an older method name. The current API responds by replying to the request's numeric `id`.

---

## Approval Policy

Can be set on `thread/start` and overridden on `turn/start` via `approvalPolicy`:

| Value | Behavior |
|---|---|
| `"never"` | Auto-approve everything, no prompts |
| `"on-request"` | Prompt for untrusted operations (default) |
| `"always"` | Require approval for every action |
| `"default"` | Use server's configured policy |

For onboarding / background agents use `"never"`. For interactive developer sessions use `"on-request"`.

---

## Models

| Model ID | Description | Best for |
|---|---|---|
| `gpt-5.4` | Flagship model | Complex reasoning |
| `gpt-5.4-mini` | Fast and cheap | Subagents, simple edits |
| `gpt-5.3-codex` | Specialized for code | Deep software engineering |
| `o3` | Research-grade | Hard problems |
| `o4-mini` | Balanced | General use |

Actly defaults to:
- Planner: `gpt-5.4-mini`
- Builder: `gpt-5.4`
- Initializer: `gpt-5.4-mini`

Older saved agent models such as `codex-1` are normalized to supported values when agents are loaded, because ChatGPT-account logins can reject those legacy model ids.

---

## Configuration (`~/.codex/config.toml`)

```toml
model = "codex-mini-latest"
model_provider = "openai"
model_reasoning_effort = "medium"    # minimal | low | medium | high | xhigh

approval_policy = "on-request"
sandbox_mode = "workspace-write"     # read-only | workspace-write | danger-full-access

# Custom instructions loaded for every session
model_instructions_file = "/path/to/instructions.md"

# Alternative providers (e.g. local Ollama)
[model_providers.local]
name = "Local Ollama"
base_url = "http://localhost:11434/v1"
env_key = "OLLAMA_API_KEY"
wire_api = "responses"
```

Override inline without editing the file:
```bash
codex --config 'model="gpt-5.4-mini"' app-server --listen ws://127.0.0.1:4500
```

---

## System Prompts / Project Instructions

Codex reads instructions from (in priority order):

1. **`.actly/AGENTS.md`** or **`AGENTS.md`** in the project root — automatically loaded for every session in that directory. This is the primary mechanism Actly uses via the onboarding wizard.
2. **`model_instructions_file`** in `~/.codex/config.toml` — global override.
3. **`developer_instructions`** in `turn/start.collaborationMode.settings` — per-turn supplementary instructions that then become the default for later turns on that thread.

There is no `system_prompt` parameter on `thread/start`. In Actly, the `system_prompt` field in the `agents` table maps to:

```jsonc
{
  "collaborationMode": {
    "mode": "default",
    "settings": {
      "developer_instructions": "..."
    }
  }
}
```

and is sent on the first `turn/start`.

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | OpenAI key. Overrides OAuth token if set — use with care |
| `CODEX_HOME` | Override `~/.codex` state directory |
| `CODEX_CA_CERTIFICATE` | Custom CA cert path (corporate proxies) |
| `RUST_LOG` | Log level for Codex's Rust backend (`debug`, `info`, `warn`) |
| `LOG_FORMAT=json` | Emit tracing logs as JSON to stderr |

---

## Current Actly Flow

Actly's current integration is implemented in `src/services/codex.ts` and `src/services/agentRunner.ts`.

1. Rust starts `codex app-server --listen ws://127.0.0.1:<port>` for a specific **session id**.
2. `CodexClient.connect()` performs `initialize` then `initialized`.
3. `startAgent()` creates a DB session, then calls `client.createThread({ cwd, model, approval_mode })`.
4. The `thread/start` response returns the real Codex thread id, which is stored in `sessions.codex_thread_id`.
5. The first user turn is started with:
   - `threadId`
   - `input`
   - per-turn overrides like `cwd`
   - `collaborationMode.settings.developer_instructions` when the selected agent has a custom system prompt
6. `turn/started` captures the active `turnId`.
7. `turn/interrupt` uses both `threadId` and `turnId`.
8. Approval requests are answered by replying directly to the request `id`.
9. Each `item/agentMessage/delta` is scanned by `extractActlyActivities()` for `<actly_activity>` XML blocks. Parsed blocks are stored as structured task events and rendered as rich cards in the TaskDetail timeline. See [Agents — Structured activity messages](agents.md#structured-activity-messages-actly_activity) for the full schema.

This structure keeps thread lifecycle, turn lifecycle, and session persistence separate so we can extend the integration later with resume, steer, review mode, or thread listing.

---

## Parallel Agents

Each task session gets its own Codex server instance on a unique port. For true isolation (multiple agents on the same repo without conflicts), use git worktrees:

```bash
git worktree add .worktrees/session-<id> -b agent/<id>
```

Set `cwd` on `thread/start` to the worktree path. The `worktree_path` column in the `sessions` table is reserved for this.

---

## Backpressure

If the server is overloaded it returns error code `-32001`:
```jsonc
{ "id": 5, "error": { "code": -32001, "message": "Server overloaded; retry later" } }
```

Use exponential backoff with jitter before retrying.
