import { useEffect, useState, useCallback, memo, useRef } from "react";
import { Plus } from "lucide-react";
import { useTasksStore, Task } from "../../store/tasks";
import { useAgentsStore } from "../../store/agents";
import { dbCreateTask, dbListTasks } from "../../services/db";
import { useWorkspaceStore } from "../../store/workspace";
import { useTemplatesStore } from "../../store/templates";
import { focusPanel } from "../../services/layoutEvents";
import { TaskRunStateDot, getTaskRunState } from "../../components/TaskRunState";
import { updateTaskStatusWithActivity } from "../../services/taskActivity";
import TaskTemplateSuggestions from "../../components/TaskTemplateSuggestions";
import type { TaskTemplate } from "../../registries/tasks.registry";

const STATUS_ORDER = ["icebox", "improving", "planned", "in_progress", "done", "blocked"] as const;

export default function TaskBoard() {
  const { tasks, setTasks, upsertTask } = useTasksStore();
  const { sessions } = useAgentsStore();
  const { activeTaskId, setActiveTaskId, projectPath } = useWorkspaceStore();
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(-1);
  const [selectedTemplate, setSelectedTemplate] = useState<TaskTemplate | null>(null);
  const allTemplates = useTemplatesStore((s) => s.allTemplates)();
  const filteredTemplates = allTemplates.filter((t) =>
    t.title.toLowerCase().includes(newTitle.trim().toLowerCase())
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (projectPath) dbListTasks(projectPath).then(setTasks).catch(console.error);
  }, [projectPath, setTasks]);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    try {
      if (!projectPath) return;
      const task = await dbCreateTask(
        newTitle.trim(),
        projectPath,
        selectedTemplate?.description ?? "",
        selectedTemplate?.assigned_agent_id ?? null
      );
      upsertTask(task);
      setNewTitle("");
      setCreating(false);
      setSuggestionIndex(-1);
      setSelectedTemplate(null);
      setActiveTaskId(task.id);
      focusPanel("task-detail");
    } catch (e) {
      console.error(e);
    }
  };

  const handleTemplateSelect = (template: TaskTemplate) => {
    setNewTitle(template.title);
    setSelectedTemplate(template);
    setSuggestionIndex(-1);
  };

  // ⚡ Bolt Optimization: Stabilize callbacks to prevent all TaskRow items
  // from re-rendering on every local state update or task selection change in TaskBoard.
  const handleStatusChange = useCallback(async (taskId: string, status: string) => {
    const task = useTasksStore.getState().tasks.find(t => t.id === taskId);
    if (task) {
      await updateTaskStatusWithActivity(task, status as Task["status"]);
    }
  }, []);

  const handleTaskClick = useCallback((taskId: string) => {
    setActiveTaskId(taskId);
    focusPanel("task-detail");
  }, [setActiveTaskId]);

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
          <div>
            <input
              ref={inputRef}
              autoFocus
              className="input"
              placeholder="Task title…"
              value={newTitle}
              onChange={(e) => {
                setNewTitle(e.target.value);
                setSuggestionIndex(-1);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setSuggestionIndex((i) => Math.min(i + 1, filteredTemplates.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setSuggestionIndex((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter") {
                  if (suggestionIndex >= 0 && filteredTemplates[suggestionIndex]) {
                    handleTemplateSelect(filteredTemplates[suggestionIndex]);
                  } else {
                    void handleCreate();
                  }
                } else if (e.key === "Escape") {
                  if (suggestionIndex >= 0) {
                    setSuggestionIndex(-1);
                  } else {
                    setCreating(false);
                  }
                }
              }}
            />
            <TaskTemplateSuggestions
              query={newTitle}
              templates={filteredTemplates}
              selectedIndex={suggestionIndex}
              onSelect={handleTemplateSelect}
              anchorRef={inputRef}
            />
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button className="btn btn-primary" onClick={() => void handleCreate()} style={{ flex: 1 }}>
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
                onClick={handleTaskClick}
                onStatusChange={handleStatusChange}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ⚡ Bolt Optimization: Memoize TaskRow so it only re-renders when its specific
// task data or active state changes, avoiding O(N) re-renders when one task updates.
const TaskRow = memo(function TaskRow({
  task,
  active,
  runState,
  onClick,
  onStatusChange,
}: {
  task: Task;
  active: boolean;
  runState: ReturnType<typeof getTaskRunState>;
  onClick: (taskId: string) => void;
  onStatusChange: (taskId: string, status: string) => void;
}) {
  return (
    <li
      onClick={() => onClick(task.id)}
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
          onChange={(e) => onStatusChange(task.id, e.target.value)}
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
});
