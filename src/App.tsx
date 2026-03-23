import { useEffect } from "react";
import AppShell from "./layout/AppShell";
import { useWorkspaceStore } from "./store/workspace";
import ProjectSplash from "./components/ProjectSplash";

export default function App() {
  const { projectPath, activeId, hydrate } = useWorkspaceStore();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (!projectPath) {
    return <ProjectSplash />;
  }

  return <AppShell key={activeId ?? "default"} />;
}
