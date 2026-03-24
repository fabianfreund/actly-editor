# Tasks

## Task status lifecycle

Tasks move through four statuses on the Kanban board:

```
Icebox → Planned → In Progress → Done
```

The legacy statuses `improving` and `blocked` are no longer valid. Any rows stored with those values are normalized to `"icebox"` at read time by `normalizeStatus()` in `src/services/db.ts`.

## Task templates registry

`src/registries/tasks.registry.ts` is the central catalogue of task templates that Actly can pre-fill when creating a new task.

### `TaskTemplate` interface

```ts
interface TaskTemplate {
  id: string;
  title: string;
  description: string;
  assigned_agent_id: string | null;
  initial_status: TaskStatus;
}
```

### Built-in templates

| ID | Title | Agent | Initial status |
|---|---|---|---|
| `initialize-project` | Initialize Project | `agent-initializer` | `planned` |

### Looking up a template

```ts
import { getTaskTemplate } from "@/registries/tasks.registry";

const tpl = getTaskTemplate("initialize-project");
// tpl is TaskTemplate | undefined
```

### Adding a new template

Add an entry to the `TASK_TEMPLATES` array in `src/registries/tasks.registry.ts`:

```ts
{
  id: "add-auth",
  title: "Add Authentication",
  description: "Implement user login and session management.",
  assigned_agent_id: "agent-builder",
  initial_status: "icebox",
}
```

Templates are pure data — no migration or registration step is required. They are available immediately once the file is saved.

## `dbCreateTask` signature

```ts
dbCreateTask(
  workspaceId: string,
  title: string,
  description: string,
  assigned_agent_id?: string | null   // optional, defaults to null
): Promise<Task>
```

The `assigned_agent_id` column is included in the INSERT. Pass a value when creating a task from a template so the correct agent is pre-selected in the AgentThread panel.
