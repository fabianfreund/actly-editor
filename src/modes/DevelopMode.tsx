import { lazy, Suspense } from "react";

const TaskDetail = lazy(() => import("../panels/TaskDetail/index"));
const AgentThread = lazy(() => import("../panels/AgentThread/index"));
const Terminal = lazy(() => import("../panels/Terminal/index"));
const GitPanel = lazy(() => import("../panels/GitPanel/index"));

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

export default function DevelopMode() {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Top row: TaskDetail | AgentThread */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
        <div
          style={{
            flex: 1,
            overflow: "hidden",
            borderRight: "1px solid var(--border-default)",
          }}
        >
          <Suspense fallback={FALLBACK}>
            <TaskDetail />
          </Suspense>
        </div>
        <div style={{ flex: 1, overflow: "hidden" }}>
          <Suspense fallback={FALLBACK}>
            <AgentThread />
          </Suspense>
        </div>
      </div>

      {/* Bottom row: Terminal | GitPanel */}
      <div
        style={{
          display: "flex",
          height: 280,
          flexShrink: 0,
          borderTop: "1px solid var(--border-default)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            flex: 1,
            overflow: "hidden",
            borderRight: "1px solid var(--border-default)",
          }}
        >
          <Suspense fallback={FALLBACK}>
            <Terminal />
          </Suspense>
        </div>
        <div style={{ width: 300, overflow: "hidden", flexShrink: 0 }}>
          <Suspense fallback={FALLBACK}>
            <GitPanel />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
