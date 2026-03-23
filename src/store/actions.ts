import { create } from "zustand";
import type { ActionDef } from "../panels/ActionPanel/index";
import { readActlyActions, detectProjectScripts, writeActlyActions } from "../services/actlyFs";

interface ActionsState {
  actions: ActionDef[];
  projectPath: string | null;
  setActions: (actions: ActionDef[], projectPath: string) => void;
  loadActions: (projectPath: string) => Promise<void>;
  saveActions: (actions: ActionDef[]) => Promise<void>;
}

export const useActionsStore = create<ActionsState>((set, get) => ({
  actions: [],
  projectPath: null,

  setActions: (actions, projectPath) => set({ actions, projectPath }),

  loadActions: async (projectPath) => {
    // Try .actly/actions.json first
    const saved = await readActlyActions(projectPath);
    if (saved && saved.length > 0) {
      set({ actions: saved, projectPath });
      return;
    }
    // Fall back to auto-detection
    const detected = await detectProjectScripts(projectPath);
    set({ actions: detected, projectPath });
  },

  saveActions: async (actions) => {
    const { projectPath } = get();
    if (!projectPath) return;
    set({ actions });
    await writeActlyActions(projectPath, actions);
  },
}));
