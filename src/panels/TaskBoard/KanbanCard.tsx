import type { Task } from "../../store/tasks";
import type { Agent } from "../../store/agents";
import { TaskRunStateDot, type TaskRunState } from "../../components/TaskRunState";

interface KanbanCardProps {
  task: Task;
  agents: Agent[];
  isActive: boolean;
  runState: TaskRunState;
  onClick: () => void;
}

export default function KanbanCard({ task, agents, isActive, runState, onClick }: KanbanCardProps) {
  const agent = agents.find((a) => a.id === task.assigned_agent_id);

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        background: isActive ? "var(--bg-active)" : "var(--bg-elevated)",
        border: `1px solid ${isActive ? "var(--accent)" : "var(--border-default)"}`,
        borderRadius: 4,
        padding: "8px 10px",
        cursor: "pointer",
        marginBottom: 4,
        transition: "border-color 0.1s, background 0.1s",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
        <div style={{ flexShrink: 0, marginTop: 3 }}>
          <TaskRunStateDot state={runState} size={10} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: "var(--font-size-sm)",
              color: "var(--text-primary)",
              lineHeight: 1.4,
              wordBreak: "break-word",
              marginBottom: agent || task.status === "blocked" ? 5 : 0,
            }}
          >
            {task.title}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            {agent && runState !== "running" && (
              <span
                style={{
                  fontSize: "var(--font-size-xs)",
                  color: "var(--text-info)",
                  background: "rgba(117,190,255,0.1)",
                  padding: "1px 6px",
                  borderRadius: 3,
                }}
              >
                {agent.name}
              </span>
            )}
            {task.status === "blocked" && runState !== "needs_intervention" && (
              <span
                style={{
                  fontSize: "var(--font-size-xs)",
                  color: "var(--status-blocked)",
                  background: "rgba(244,135,113,0.1)",
                  padding: "1px 6px",
                  borderRadius: 3,
                }}
              >
                blocked
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
