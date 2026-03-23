import { create } from "zustand";

export type TerminalTabKind = "shell" | "command";

export interface TerminalTab {
  id: string;
  label: string;
  kind: TerminalTabKind;
  cwd: string;
  command?: string;
  args?: string[];
  closable: boolean;
  restartNonce: number;
}

interface AddCommandTabOptions {
  label: string;
  cwd: string;
  command: string;
  args?: string[];
}

interface TerminalState {
  workspacePath: string | null;
  tabs: TerminalTab[];
  activeTabId: string | null;
  initializeWorkspace: (workspacePath: string) => void;
  addCommandTab: (options: AddCommandTabOptions) => string;
  setActiveTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
  restartTab: (tabId: string) => void;
}

function createShellTab(workspacePath: string): TerminalTab {
  return {
    id: `shell:${workspacePath}`,
    label: "Shell",
    kind: "shell",
    cwd: workspacePath,
    closable: false,
    restartNonce: 0,
  };
}

function createCommandTab(options: AddCommandTabOptions): TerminalTab {
  return {
    id: `cmd:${Date.now()}:${Math.random().toString(16).slice(2)}`,
    label: options.label,
    kind: "command",
    cwd: options.cwd,
    command: options.command,
    args: options.args ?? [],
    closable: true,
    restartNonce: 0,
  };
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  workspacePath: null,
  tabs: [],
  activeTabId: null,

  initializeWorkspace: (workspacePath) =>
    set((state) => {
      if (state.workspacePath === workspacePath && state.tabs.length > 0) {
        return state;
      }
      const shellTab = createShellTab(workspacePath);
      return {
        workspacePath,
        tabs: [shellTab],
        activeTabId: shellTab.id,
      };
    }),

  addCommandTab: (options) => {
    const tab = createCommandTab(options);
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
    }));
    return tab.id;
  },

  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  closeTab: (tabId) =>
    set((state) => {
      const index = state.tabs.findIndex((tab) => tab.id === tabId);
      if (index === -1) return state;

      const nextTabs = state.tabs.filter((tab) => tab.id !== tabId);
      const nextActiveTabId =
        state.activeTabId === tabId
          ? nextTabs[index]?.id ?? nextTabs[index - 1]?.id ?? nextTabs[0]?.id ?? null
          : state.activeTabId;

      return {
        tabs: nextTabs,
        activeTabId: nextActiveTabId,
      };
    }),

  restartTab: (tabId) =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId ? { ...tab, restartNonce: tab.restartNonce + 1 } : tab
      ),
    })),
}));
