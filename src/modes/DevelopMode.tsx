import { lazy, Suspense, useState, type ComponentType } from "react";
import { Github, PlaySquare } from "lucide-react";

const TaskDetail = lazy(() => import("../panels/TaskDetail/index"));
const AgentThread = lazy(() => import("../panels/AgentThread/index"));
const Terminal = lazy(() => import("../panels/Terminal/index"));
const GitPanel = lazy(() => import("../panels/GitPanel/index"));
const ActionPanel = lazy(() => import("../panels/ActionPanel/index"));

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

type DevelopToolId = "git" | "actions";

const DEVELOP_TOOLS: {
  id: DevelopToolId;
  label: string;
  Icon: ComponentType<{ size?: number }>;
}[] = [
  { id: "git", label: "Git", Icon: Github },
  { id: "actions", label: "Actions", Icon: PlaySquare },
];

export default function DevelopMode() {
  const [activeTool, setActiveTool] = useState<DevelopToolId | null>("actions");

  const ActiveToolPanel =
    activeTool === "git" ? GitPanel : activeTool === "actions" ? ActionPanel : null;

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              borderRight: "1px solid var(--border-default)",
            }}
          >
            <Suspense fallback={FALLBACK}>
              <TaskDetail />
            </Suspense>
          </div>

          <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
            <Suspense fallback={FALLBACK}>
              <AgentThread />
            </Suspense>
          </div>
        </div>

        <div
          style={{
            height: 300,
            flexShrink: 0,
            borderTop: "1px solid var(--border-default)",
            overflow: "hidden",
          }}
        >
          <Suspense fallback={FALLBACK}>
            <Terminal />
          </Suspense>
        </div>
      </div>

      {ActiveToolPanel && (
        <div
          style={{
            width: 340,
            flexShrink: 0,
            minWidth: 0,
            overflow: "hidden",
            borderLeft: "1px solid var(--border-default)",
            borderRight: "1px solid var(--border-default)",
          }}
        >
          <Suspense fallback={FALLBACK}>
            <ActiveToolPanel />
          </Suspense>
        </div>
      )}

      <div
        className="activity-bar"
        style={{
          borderRight: "none",
          borderLeft: "1px solid var(--border-default)",
        }}
      >
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {DEVELOP_TOOLS.map(({ id, label, Icon }) => {
            const isActive = activeTool === id;
            return (
              <button
                key={id}
                className={`activity-bar-item${isActive ? " active" : ""}`}
                onClick={() => setActiveTool((current) => (current === id ? null : id))}
                title={label}
              >
                <Icon size={20} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
