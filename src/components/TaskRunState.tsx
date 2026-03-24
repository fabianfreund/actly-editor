import type { Task } from "../store/tasks";
import type { Session } from "../store/agents";

export type TaskRunState = "idle" | "running" | "needs_intervention" | "finished";

function getLatestTaskSession(taskId: string, sessions: Session[]): Session | null {
  const matches = sessions.filter((session) => session.task_id === taskId);
  if (matches.length === 0) return null;

  return matches.sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}

export function getTaskRunState(task: Task, sessions: Session[]): TaskRunState {
  if (task.status === "done") return "finished";
  if (task.status === "failed") return "needs_intervention";

  const latestSession = getLatestTaskSession(task.id, sessions);
  if (!latestSession) return "idle";

  switch (latestSession.status) {
    case "running":
      return "running";
    case "paused":
    case "failed":
      return "needs_intervention";
    case "completed":
      return "idle";
    case "idle":
    default:
      return "idle";
  }
}

const STATE_META: Record<TaskRunState, { label: string; color: string; background: string }> = {
  idle: {
    label: "Idle",
    color: "var(--text-muted)",
    background: "rgba(106,106,106,0.12)",
  },
  running: {
    label: "Running",
    color: "var(--accent)",
    background: "rgba(0,120,212,0.12)",
  },
  needs_intervention: {
    label: "Needs intervention",
    color: "var(--text-warning)",
    background: "rgba(204,167,0,0.12)",
  },
  finished: {
    label: "Finished",
    color: "var(--text-success)",
    background: "rgba(137,209,133,0.12)",
  },
};

export function TaskRunStateDot({
  state,
  size = 12,
}: {
  state: TaskRunState;
  size?: number;
}) {
  const meta = STATE_META[state];
  const ringWidth = Math.max(2, Math.round(size / 6));

  if (state === "running") {
    return (
      <div
        aria-label={meta.label}
        title={meta.label}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          border: `${ringWidth}px solid ${meta.color}`,
          borderTopColor: "transparent",
          animation: "spin 0.7s linear infinite",
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <div
      aria-label={meta.label}
      title={meta.label}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `${ringWidth}px solid ${meta.color}`,
        background: state === "finished" ? meta.color : "transparent",
        flexShrink: 0,
      }}
    />
  );
}

export function TaskRunStateBadge({
  state,
}: {
  state: TaskRunState;
}) {
  const meta = STATE_META[state];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: "var(--font-size-xs)",
        color: meta.color,
        background: meta.background,
        padding: "2px 8px",
        borderRadius: 999,
        whiteSpace: "nowrap",
      }}
    >
      <TaskRunStateDot state={state} size={10} />
      {meta.label}
    </span>
  );
}
