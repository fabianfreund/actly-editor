# Agents

## Built-in agent types

| Name | Role | Default model | Purpose | Workflow |
|---|---|---|---|---|
| Planner | `planner` | `gpt-5.4-mini` | Refines tasks with repo context | `improving` → `planned` |
| Bob (Builder) | `builder` | `gpt-5.4` | Implements tasks and ships changes | `in_progress` → `done` |

Actly normalizes legacy saved models to supported defaults:
- Planner → `gpt-5.4-mini`
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

## Task-aware planner flow

The planner is task-improvement focused. When it runs, Actly moves the task into `improving`, lets the planner inspect the repository, and expects a final structured task update block:

```xml
<task_update>{"title":"...","description":"..."}</task_update>
```

`src/services/agentRunner.ts` strips that block from the visible chat message, applies any title / description changes to the task, records the update in activity, and moves the task back to `planned`.

This is what powers comment triggers like `@planner improve this task`.

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

**Step 2** — seed it into SQLite (either via migration or at first launch).

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
