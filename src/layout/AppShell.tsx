import { lazy, Suspense, useEffect, useState } from "react";
import MenuBar from "../components/MenuBar";
import ActivityBar from "./ActivityBar";
import OnboardingModal from "../components/OnboardingModal";
import { useUiStore, type AppMode } from "../store/ui";
import { useWorkspaceStore } from "../store/workspace";
import { useActionsStore } from "../store/actions";
import { useTasksStore } from "../store/tasks";
import { hasActlyFolder } from "../services/actlyFs";
import { onNavigateMode } from "../services/layoutEvents";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MODE_COMPONENTS: Record<AppMode, React.LazyExoticComponent<any>> = {
  activity: lazy(() => import("../modes/ActivityMode")),
  plan: lazy(() => import("../modes/PlanMode")),
  develop: lazy(() => import("../modes/DevelopMode")),
  monitor: lazy(() => import("../modes/MonitorMode")),
  launch: lazy(() => import("../modes/LaunchMode")),
  custom: lazy(() => import("../modes/CustomMode")),
  settings: lazy(() => import("../panels/Settings/index")),
};

const FALLBACK = (
  <div
    style={{
      flex: 1,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "var(--text-muted)",
      fontSize: "var(--font-size-sm)",
    }}
  >
    Loading…
  </div>
);

export default function AppShell() {
  const { activeMode, setMode, loadMode } = useUiStore();
  const { activeId, projectPath } = useWorkspaceStore();
  const { loadActions } = useActionsStore();
  const { setTasks } = useTasksStore();
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Restore mode and load actions when workspace changes
  useEffect(() => {
    if (!activeId || !projectPath) return;

    loadMode(activeId);
    loadActions(projectPath);
    setTasks([]); // clear stale tasks before the board reloads for this workspace

    // Check if the project needs onboarding
    hasActlyFolder(projectPath).then((has) => {
      if (!has) setShowOnboarding(true);
    });
  }, [activeId, projectPath]); // eslint-disable-line react-hooks/exhaustive-deps

  // Global navigation handler (used by notifications, task links, etc.)
  useEffect(() => {
    onNavigateMode((mode, taskId) => {
      if (taskId) useWorkspaceStore.getState().setActiveTaskId(taskId);
      setMode(mode, activeId);
    });
  }, [activeId, setMode]);

  const ModeComponent = MODE_COMPONENTS[activeMode];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "var(--bg-base)",
      }}
    >
      <MenuBar />
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <ActivityBar />
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <Suspense fallback={FALLBACK}>
            <ModeComponent />
          </Suspense>
        </div>
      </div>

      {showOnboarding && projectPath && (
        <OnboardingModal
          projectPath={projectPath}
          onDone={() => setShowOnboarding(false)}
        />
      )}
    </div>
  );
}
