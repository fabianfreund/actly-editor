import { useState } from "react";
import { Plus } from "lucide-react";
import type { Task, TaskStatus } from "../../store/tasks";
import type { Agent } from "../../store/agents";
import KanbanCard from "./KanbanCard";
import type { TaskRunState } from "../../components/TaskRunState";

interface KanbanColumnProps {
  title: string;
  status: TaskStatus;
  tasks: Task[];
  agents: Agent[];
  activeTaskId: string | null;
  taskRunStates: Record<string, TaskRunState>;
  onTaskClick: (taskId: string) => void;
  onAddTask: (title: string) => void;
}

export default function KanbanColumn({
  title,
  status,
  tasks,
  agents,
  activeTaskId,
  taskRunStates,
  onTaskClick,
  onAddTask,
}: KanbanColumnProps) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const handleAdd = () => {
    const trimmed = draft.trim();
    if (trimmed) {
      onAddTask(trimmed);
    }
    setDraft("");
    setAdding(false);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 240,
        flexShrink: 0,
        background: "var(--bg-surface)",
        borderRadius: 6,
        overflow: "hidden",
      }}
    >
      {/* Column header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 10px",
          borderBottom: "1px solid var(--border-default)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontSize: "var(--font-size-xs)",
              fontWeight: 600,
              color: "var(--text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {title}
          </span>
          <span
            style={{
              fontSize: "var(--font-size-xs)",
              color: "var(--text-muted)",
              background: "var(--bg-elevated)",
              padding: "0 5px",
              borderRadius: 10,
              minWidth: 18,
              textAlign: "center",
            }}
          >
            {tasks.length}
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setAdding(true);
          }}
          title={`Add task to ${title}`}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            padding: 2,
            display: "flex",
            alignItems: "center",
          }}
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Cards */}
      <div style={{ flex: 1, overflow: "auto", padding: 8 }}>
        {tasks.map((task) => (
          <KanbanCard
            key={task.id}
            task={task}
            agents={agents}
            isActive={task.id === activeTaskId}
            runState={taskRunStates[task.id] ?? "idle"}
            onClick={onTaskClick}
          />
        ))}

        {/* Inline add input */}
        {adding && (
          <div style={{ marginTop: 4 }}>
            <input
              className="input"
              autoFocus
              placeholder="Task title…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
                if (e.key === "Escape") {
                  setDraft("");
                  setAdding(false);
                }
              }}
              onBlur={handleAdd}
              style={{ marginBottom: 4 }}
            />
          </div>
        )}

        {tasks.length === 0 && !adding && (
          <div
            style={{
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: "var(--font-size-xs)",
              padding: "16px 8px",
            }}
          >
            No tasks
          </div>
        )}
      </div>
    </div>
  );
}
