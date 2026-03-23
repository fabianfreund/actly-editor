import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useTasksStore, Task } from "../../store/tasks";
import { useAgentsStore } from "../../store/agents";
import { dbCreateTask, dbListTasks } from "../../services/db";
import { useWorkspaceStore } from "../../store/workspace";
import { focusPanel } from "../../services/layoutEvents";
import { TaskRunStateDot, getTaskRunState } from "../../components/TaskRunState";
import { updateTaskStatusWithActivity } from "../../services/taskActivity";

const STATUS_ORDER = ["icebox", "improving", "planned", "in_progress", "done", "blocked"] as const;

export default function TaskBoard() {
  const { tasks, setTasks, upsertTask } = useTasksStore();
  const { sessions } = useAgentsStore();
  const { activeTaskId, setActiveTaskId, projectPath } = useWorkspaceStore();
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (projectPath) dbListTasks(projectPath).then(setTasks).catch(console.error);
  }, [projectPath, setTasks]);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    try {
      if (!projectPath) return;
      const task = await dbCreateTask(newTitle.trim(), projectPath);
      upsertTask(task);
      setNewTitle("");
      setCreating(false);
      setActiveTaskId(task.id);
      focusPanel("task-detail");
    } catch (e) {
      console.error(e);
    }
  };

  const handleStatusChange = async (task: Task, status: string) => {
    await updateTaskStatusWithActivity(task, status as Task["status"]);
  };

  return (
    <div className="panel-full">
      <div className="panel-header">
        <button
          className="btn btn-ghost"
          style={{ marginLeft: "auto", padding: "2px 6px" }}
          onClick={() => setCreating((v) => !v)}
          title="New task"
        >
          <Plus size={14} />
        </button>
      </div>

      {creating && (
        <div style={{ padding: "8px", borderBottom: "1px solid var(--border-default)" }}>
          <input
            autoFocus
            className="input"
            placeholder="Task title…"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") setCreating(false);
            }}
          />
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button className="btn btn-primary" onClick={handleCreate} style={{ flex: 1 }}>
              Create
            </button>
            <button className="btn btn-ghost" onClick={() => setCreating(false)} style={{ flex: 1 }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="panel-body" style={{ padding: 0 }}>
        {tasks.length === 0 ? (
          <div
            style={{
              padding: 24,
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: "var(--font-size-sm)",
            }}
          >
            No tasks yet. Create one to get started.
          </div>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                active={task.id === activeTaskId}
                runState={getTaskRunState(task, sessions)}
                onClick={() => { setActiveTaskId(task.id); focusPanel("task-detail"); }}
                onStatusChange={(s) => handleStatusChange(task, s)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TaskRow({
  task,
  active,
  runState,
  onClick,
  onStatusChange,
}: {
  task: Task;
  active: boolean;
  runState: ReturnType<typeof getTaskRunState>;
  onClick: () => void;
  onStatusChange: (status: string) => void;
}) {
  return (
    <li
      onClick={onClick}
      style={{
        padding: "8px 12px",
        cursor: "pointer",
        background: active ? "var(--bg-active)" : "transparent",
        borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
        borderBottom: "1px solid var(--border-default)",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <TaskRunStateDot state={runState} size={14} />
        <span
          style={{
            flex: 1,
            fontSize: "var(--font-size-sm)",
            color: "var(--text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {task.title}
        </span>
        <select
          value={task.status}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onStatusChange(e.target.value)}
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            borderRadius: 3,
            color: "var(--text-secondary)",
            fontSize: "var(--font-size-xs)",
            padding: "1px 4px",
            cursor: "pointer",
          }}
        >
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </select>
      </div>
    </li>
  );
}
