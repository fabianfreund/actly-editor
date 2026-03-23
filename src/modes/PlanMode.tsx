import { lazy, Suspense } from "react";
import KanbanBoard from "../panels/TaskBoard/KanbanBoard";
import { useWorkspaceStore } from "../store/workspace";

const TaskDetail = lazy(() => import("../panels/TaskDetail/index"));

const FALLBACK = (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      color: "var(--text-muted)",
      fontSize: "var(--font-size-sm)",
    }}
  >
    Loading…
  </div>
);

export default function PlanMode() {
  const { activeTaskId } = useWorkspaceStore();

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Kanban board */}
      <div
        style={{
          flex: activeTaskId ? "0 0 60%" : "1",
          overflow: "hidden",
          borderRight: activeTaskId ? "1px solid var(--border-default)" : "none",
        }}
      >
        <KanbanBoard />
      </div>

      {/* Task detail (only when a task is selected) */}
      {activeTaskId && (
        <div style={{ flex: 1, overflow: "hidden" }}>
          <Suspense fallback={FALLBACK}>
            <TaskDetail />
          </Suspense>
        </div>
      )}
    </div>
  );
}
