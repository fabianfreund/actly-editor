# Agents

## Built-in agent types

| Name | Role | Default model | Purpose | Workflow |
|---|---|---|---|---|
| Patty the Planner | `planner` | `gpt-5.4-mini` | Refines tasks with repo context | `planned` (start) → `planned` (completion) |
| Bob the Builder | `builder` | `gpt-5.4` | Implements tasks and ships changes | `in_progress` → `done` |
| Izzy the Initializer | `initializer` | `gpt-5.4-mini` | Project setup and re-initialization | configurable |

Actly normalizes legacy saved models to supported defaults:
- Patty the Planner → `gpt-5.4-mini`
- Builder → `gpt-5.4`

The Settings panel uses a dropdown of supported / already-used models instead of a free-text model field, which avoids unsupported values like `codex-1` for ChatGPT-account logins.

## Agent configuration

Each agent is a row in the `agents` SQLite table. Users configure:
- **Model** — any Codex-compatible model identifier
- **Provider** — `openai`, `minimax`, `azure`, `anthropic`
- **Approval mode** — `auto` (ask for risky ops), `full` (no prompts), `readonly`, `never`
- **System prompt** — optional custom instructions

Built-in agent types also carry a workflow config in `src/registries/agents.registry.ts`:
- **Start status** — the task stage applied when the run begins
- **Completion status** — the stage applied after a successful turn
- **Task rewrite support** — whether the agent can update the task title / notes
- **Execution prompt** — role-specific instructions appended to the Codex turn

Configuration UI is in the Settings panel.

All three built-in agents are auto-seeded into SQLite at first launch via `dbListAgents()`. They do not require a manual migration step.

## Task status lifecycle

The Kanban board tracks four statuses:

```
Icebox → Planned → In Progress → Done
```

The statuses `improving` and `blocked` have been removed. Any legacy DB rows with those values are normalized to `"icebox"` by `normalizeStatus()` in `src/services/db.ts`.

## Task-aware planner flow

The planner is task-refinement focused. When it runs, Actly lets the planner inspect the repository, and expects a final structured task update block:

```xml
<task_update>{"title":"...","description":"..."}</task_update>
```

`src/services/agentRunner.ts` strips that block from the visible chat message, applies any title / description changes to the task, records the update in activity, and moves the task to `planned`.

This is what powers comment triggers like `@planner improve this task`.

## Structured activity messages (`<actly_activity>`)

Agents can emit structured activity blocks anywhere in their output:

```xml
<actly_activity>{"type":"activity","text":"Running tests…","items":[{"label":"auth.test.ts","detail":"passed"}]}</actly_activity>
```

### JSON schema

```ts
{
  type: "activity" | "question" | "summary";
  text: string;
  items?: { label: string; detail?: string }[];
  tag_user?: boolean;
}
```

### Parsing and storage

`extractActlyActivities()` in `src/services/agentRunner.ts` scans each streamed agent message for `<actly_activity>` blocks and:
- Stores `type: "activity"` blocks as `agent_message` task events with the JSON payload as metadata.
- Stores `type: "question"` blocks as `agent_question` task events.

### Rendering

The TaskDetail timeline renders activity cards with:
- An optional item list (label + optional detail per row).
- A warning-style border for `question` type cards, to draw developer attention.

Agents should use `"question"` when they need a human decision before proceeding, and `"summary"` for end-of-turn wrap-ups.

## Adding a new agent type

**Step 1** — add the default config to `src/registries/agents.registry.ts`:
```ts
{
  id: "agent-reviewer",
  name: "Reviewer",
  role: "builder",
  defaultModel: "gpt-4o",
  defaultProvider: "openai",
  defaultApprovalMode: "readonly",
  defaultSystemPrompt: "Review code for bugs, security, and style.",
  workflow: {
    startStatus: "in_progress",
    completionStatus: "done",
    canRewriteTask: false,
    executionPrompt: "Review the task, do the work, and summarize the result.",
  },
}
```

**Step 2** — the agent is auto-seeded at first launch via `dbListAgents()`. No manual migration is required.

The agent will then appear in the AgentThread panel's agent selector dropdown.

## Session lifecycle

```
task created
  ↓
user clicks "Start" in AgentThread → dbCreateSession(taskId, agentId)
  ↓
codexCommands.startServer(sessionId, projectPath) → port
  ↓
getCodexClient(port) → CodexClient connected
  ↓
client.createThread({workdir, model, approval_mode})
  ↓
thread/start response → persist real codex_thread_id on the session
  ↓
client.sendMessage(initialMessage ?? task.title + task.description, {
  cwd: projectPath,
  model,
  approval_mode,
  system_prompt + workflow.executionPrompt
})
  ↓
events stream → AgentThread + Terminal panels
  ↓
turn.started → capture active turnId
  ↓
turn.completed → optional planner task rewrite + workflow completion status
  ↓
turn.failed → session marked failed, task stays in pipeline and shows needs intervention
```
