import { useEffect } from "react";
import AppShell from "./layout/AppShell";
import { useWorkspaceStore } from "./store/workspace";
import { useTemplatesStore } from "./store/templates";
import { dbResetRunningSessions } from "./services/db";
import ProjectSplash from "./components/ProjectSplash";

export default function App() {
  const { projectPath, activeId, hydrate } = useWorkspaceStore();
  const { hydrate: hydrateTemplates } = useTemplatesStore();

  useEffect(() => {
    hydrate();
    dbResetRunningSessions().catch(console.error);
  }, [hydrate]);

  useEffect(() => {
    hydrateTemplates();
  }, [hydrateTemplates]);

  if (!projectPath) {
    return <ProjectSplash />;
  }

  return <AppShell key={activeId ?? "default"} />;
}
