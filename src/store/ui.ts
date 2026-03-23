import { create } from "zustand";

export type AppMode =
  | "activity"
  | "plan"
  | "develop"
  | "monitor"
  | "launch"
  | "custom"
  | "settings";

interface UiState {
  activeMode: AppMode;
  setMode: (mode: AppMode, workspaceId?: string | null) => void;
  loadMode: (workspaceId: string) => void;
}

function modeKey(workspaceId: string) {
  return `actly:mode:${workspaceId}`;
}

export const useUiStore = create<UiState>(() => ({
  activeMode: "plan",

  setMode: (mode, workspaceId) => {
    useUiStore.setState({ activeMode: mode });
    if (workspaceId) {
      try { localStorage.setItem(modeKey(workspaceId), mode); } catch { /* ignore */ }
    }
  },

  loadMode: (workspaceId) => {
    try {
      const saved = localStorage.getItem(modeKey(workspaceId));
      useUiStore.setState({ activeMode: (saved as AppMode) ?? "plan" });
    } catch {
      useUiStore.setState({ activeMode: "plan" });
    }
  },
}));
