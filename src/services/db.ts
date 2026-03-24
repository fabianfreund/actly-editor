/**
 * SQLite helpers via @tauri-apps/plugin-sql.
 * All persistent app state (tasks, agents, sessions) lives here.
 */
import Database from "@tauri-apps/plugin-sql";
import { Task, TaskEvent, TaskAttachment } from "../store/tasks";
import { Agent, Session } from "../store/agents";
import { v4 as uuidv4 } from "uuid";
import { normalizeAgentModel } from "../registries/models.registry";
import { AGENT_TYPES, getAgentDefaultModel } from "../registries/agents.registry";

let _db: Database | null = null;

const BUILT_IN_AGENT_NAMES: Record<string, string> = {
  "agent-planner": "Patty the Planner",
  "agent-builder": "Bob the Builder",
  "agent-initializer": "Izzy the Initializer",
};

async function getDb(): Promise<Database> {
  if (!_db) {
    _db = await Database.load("sqlite:actly.db");
  }
  return _db;
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

function normalizeStatus(raw: string): Task["status"] {
  if (raw === "todo") return "planned";       // legacy migration
  if (raw === "improving") return "icebox";   // removed status
  if (raw === "blocked") return "icebox";     // removed status
  return raw as Task["status"];
}

export async function dbListTasks(workspaceId: string): Promise<Task[]> {
  const db = await getDb();
  const rows = await db.select<Task[]>(
    "SELECT id, title, description, status, assigned_agent_id, COALESCE(refs_json, '[]') as refs_json, created_at, updated_at FROM tasks WHERE workspace_id = ? ORDER BY created_at DESC",
    [workspaceId]
  );
  return rows.map((r) => ({ ...r, status: normalizeStatus(r.status) }));
}

export async function dbCreateTask(
  title: string,
  workspaceId: string,
  description = "",
  assigned_agent_id: string | null = null
): Promise<Task> {
  const db = await getDb();
  const id = uuidv4();
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO tasks (id, title, description, status, assigned_agent_id, workspace_id, created_at, updated_at) VALUES (?, ?, ?, 'planned', ?, ?, ?, ?)",
    [id, title, description, assigned_agent_id, workspaceId, now, now]
  );
  return { id, title, description, status: "planned", assigned_agent_id, refs_json: "[]", workspace_id: workspaceId, created_at: now, updated_at: now };
}

export async function dbUpdateTask(
  id: string,
  updates: Partial<Pick<Task, "title" | "description" | "status" | "assigned_agent_id" | "refs_json">>
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  const sets: string[] = ["updated_at = ?"];
  const values: unknown[] = [now];
  if (updates.title !== undefined) { sets.push("title = ?"); values.push(updates.title); }
  if (updates.description !== undefined) { sets.push("description = ?"); values.push(updates.description); }
  if (updates.status !== undefined) { sets.push("status = ?"); values.push(updates.status); }
  if (updates.assigned_agent_id !== undefined) { sets.push("assigned_agent_id = ?"); values.push(updates.assigned_agent_id); }
  if (updates.refs_json !== undefined) { sets.push("refs_json = ?"); values.push(updates.refs_json); }
  values.push(id);
  await db.execute(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`, values);
}

export async function dbUpdateTaskStatus(id: string, status: string): Promise<void> {
  return dbUpdateTask(id, { status: status as Task["status"] });
}

export async function dbDeleteTask(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM tasks WHERE id = ?", [id]);
}

// ─── Attachments ──────────────────────────────────────────────────────────────

export async function dbListAttachments(taskId: string): Promise<TaskAttachment[]> {
  const db = await getDb();
  return db.select<TaskAttachment[]>(
    "SELECT id, task_id, name, path, mime, created_at FROM task_attachments WHERE task_id = ? ORDER BY created_at ASC",
    [taskId]
  );
}

export async function dbAddAttachment(
  taskId: string,
  workspaceId: string,
  name: string,
  path: string,
  mime: string
): Promise<TaskAttachment> {
  const db = await getDb();
  const id = uuidv4();
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO task_attachments (id, task_id, workspace_id, name, path, mime, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [id, taskId, workspaceId, name, path, mime, now]
  );
  return { id, task_id: taskId, name, path, mime, workspace_id: workspaceId, created_at: now };
}

export async function dbDeleteAttachment(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM task_attachments WHERE id = ?", [id]);
}

export async function dbGetTaskEvents(taskId: string): Promise<TaskEvent[]> {
  const db = await getDb();
  return db.select<TaskEvent[]>(
    "SELECT id, task_id, type, content, actor, metadata, created_at FROM task_events WHERE task_id = ? ORDER BY created_at ASC",
    [taskId]
  );
}

export async function dbAddTaskEvent(
  taskId: string,
  workspaceId: string,
  type: string,
  content: string,
  actor = "user",
  metadata: string | null = null
): Promise<TaskEvent> {
  const db = await getDb();
  const id = uuidv4();
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO task_events (id, task_id, workspace_id, type, content, actor, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [id, taskId, workspaceId, type, content, actor, metadata, now]
  );
  return { id, task_id: taskId, workspace_id: workspaceId, type: type as TaskEvent["type"], content, actor, metadata, created_at: now };
}

export async function dbClearTaskEvents(taskId: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM task_events WHERE task_id = ?", [taskId]);
}

export async function dbGetWorkspaceActivityCount(workspaceId: string): Promise<number> {
  const db = await getDb();
  const rows = await db.select<Array<{ count: number }>>(
    `SELECT COUNT(te.id) as count
     FROM task_events te
     INNER JOIN tasks t ON t.id = te.task_id
     WHERE t.workspace_id = ?`,
    [workspaceId]
  );
  return Number(rows[0]?.count ?? 0);
}

// ─── Agents ───────────────────────────────────────────────────────────────────

export async function dbListAgents(): Promise<Agent[]> {
  const db = await getDb();
  const now = new Date().toISOString();

  await Promise.all(
    AGENT_TYPES.map((agentType) =>
      db.execute(
        `INSERT INTO agents (id, name, role, model, provider, approval_mode, system_prompt, config_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, '{}', ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name,
           role=excluded.role,
           model=CASE
             WHEN agents.model IS NULL OR TRIM(agents.model) = '' THEN excluded.model
             ELSE agents.model
           END,
           provider=CASE
             WHEN agents.provider IS NULL OR TRIM(agents.provider) = '' THEN excluded.provider
             ELSE agents.provider
           END,
           approval_mode=CASE
             WHEN agents.approval_mode IS NULL OR TRIM(agents.approval_mode) = '' THEN excluded.approval_mode
             ELSE agents.approval_mode
           END,
           system_prompt=CASE
             WHEN agents.system_prompt IS NULL OR TRIM(agents.system_prompt) = '' THEN excluded.system_prompt
             ELSE agents.system_prompt
           END,
           updated_at=excluded.updated_at`,
        [
          agentType.id,
          agentType.name,
          agentType.role,
          agentType.defaultModel,
          agentType.defaultProvider,
          agentType.defaultApprovalMode,
          agentType.defaultSystemPrompt ?? null,
          now,
          now,
        ]
      )
    )
  );

  const agents = await db.select<Agent[]>(
    "SELECT id, name, role, model, provider, approval_mode, system_prompt, config_json, created_at, updated_at FROM agents ORDER BY name ASC"
  );
  const normalized = agents.map((agent) => {
    const fallbackModel = getAgentDefaultModel(agent) ?? "gpt-5.4-mini";
    const normalizedInputModel = typeof agent.model === "string" ? agent.model.trim() : "";
    const model = normalizeAgentModel(normalizedInputModel || fallbackModel);
    const expectedName = BUILT_IN_AGENT_NAMES[agent.id] ?? agent.name;
    if (model === agent.model && expectedName === agent.name) return agent;
    return { ...agent, model, name: expectedName };
  });

  await Promise.all(
    normalized
      .filter((agent, index) => agent.model !== agents[index].model || agent.name !== agents[index].name)
      .map((agent) =>
        db.execute(
          "UPDATE agents SET model = ?, name = ?, updated_at = ? WHERE id = ?",
          [agent.model, agent.name, new Date().toISOString(), agent.id]
        )
      )
  );

  return normalized;
}

export async function dbUpsertAgent(agent: Omit<Agent, "created_at" | "updated_at">): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO agents (id, name, role, model, provider, approval_mode, system_prompt, config_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name, model=excluded.model, provider=excluded.provider,
       approval_mode=excluded.approval_mode, system_prompt=excluded.system_prompt,
       config_json=excluded.config_json, updated_at=excluded.updated_at`,
    [agent.id, agent.name, agent.role, agent.model, agent.provider,
     agent.approval_mode, agent.system_prompt, agent.config_json, now, now]
  );
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export async function dbListSessions(taskId?: string): Promise<Session[]> {
  const db = await getDb();
  if (taskId) {
    return db.select<Session[]>(
      "SELECT * FROM sessions WHERE task_id = ? ORDER BY created_at DESC",
      [taskId]
    );
  }
  return db.select<Session[]>("SELECT * FROM sessions ORDER BY created_at DESC");
}

export async function dbCreateSession(taskId: string, agentId: string, workspaceId: string): Promise<Session> {
  const db = await getDb();
  const id = uuidv4();
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO sessions (id, task_id, agent_id, workspace_id, status, created_at, updated_at) VALUES (?, ?, ?, 'idle', ?, ?, ?)",
    [id, taskId, agentId, workspaceId, now, now]
  );
  return {
    id, task_id: taskId, agent_id: agentId, workspace_id: workspaceId,
    codex_thread_id: null, worktree_path: null,
    status: "idle", created_at: now, updated_at: now,
  };
}

export async function dbUpdateSession(
  id: string,
  updates: Partial<Pick<Session, "codex_thread_id" | "worktree_path" | "status">>
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  const sets: string[] = ["updated_at = ?"];
  const values: unknown[] = [now];
  if (updates.status !== undefined) { sets.push("status = ?"); values.push(updates.status); }
  if (updates.codex_thread_id !== undefined) { sets.push("codex_thread_id = ?"); values.push(updates.codex_thread_id); }
  if (updates.worktree_path !== undefined) { sets.push("worktree_path = ?"); values.push(updates.worktree_path); }
  values.push(id);
  await db.execute(`UPDATE sessions SET ${sets.join(", ")} WHERE id = ?`, values);
}
