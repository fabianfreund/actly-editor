import { create } from "zustand";
import { load } from "@tauri-apps/plugin-store";

export interface Workspace {
  id: string;   // = path
  path: string;
  label: string; // folder name
}

interface WorkspaceState {
  workspaces: Workspace[];
  activeId: string | null;
  codexPort: number | null;
  activeTaskId: string | null;
  codexPath: string | null; // path to codex binary, null = use "codex" from PATH

  // Derived convenience getter
  projectPath: string | null;

  openWorkspace: (path: string) => void;
  setActiveWorkspace: (id: string) => void;
  closeWorkspace: (id: string) => void;
  setCodexPort: (port: number | null) => void;
  setActiveTaskId: (id: string | null) => void;
  setCodexPath: (path: string | null) => void;
  hydrate: () => Promise<void>;
}

function pathLabel(path: string) {
  return path.split("/").filter(Boolean).pop() ?? path;
}

async function persist(workspaces: Workspace[], activeId: string | null) {
  try {
    const store = await load("workspace.json", { defaults: {}, autoSave: true });
    await store.set("workspaces", workspaces);
    await store.set("activeId", activeId);
  } catch {
    // not available outside Tauri
  }
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  activeId: null,
  codexPort: null,
  activeTaskId: null,
  codexPath: null,
  projectPath: null,

  openWorkspace: (path) => {
    const { workspaces } = get();
    const existing = workspaces.find((w) => w.id === path);
    if (existing) {
      set({ activeId: path, projectPath: path });
      persist(workspaces, path);
      return;
    }
    const next: Workspace = { id: path, path, label: pathLabel(path) };
    const updated = [...workspaces, next];
    set({ workspaces: updated, activeId: path, projectPath: path });
    persist(updated, path);
  },

  setActiveWorkspace: (id) => {
    const { workspaces } = get();
    const ws = workspaces.find((w) => w.id === id);
    if (!ws) return;
    set({ activeId: id, projectPath: ws.path, activeTaskId: null });
    persist(workspaces, id);
  },

  closeWorkspace: (id) => {
    const { workspaces, activeId } = get();
    const updated = workspaces.filter((w) => w.id !== id);
    let newActiveId = activeId === id
      ? (updated[updated.length - 1]?.id ?? null)
      : activeId;
    const projectPath = updated.find((w) => w.id === newActiveId)?.path ?? null;
    set({ workspaces: updated, activeId: newActiveId, projectPath });
    persist(updated, newActiveId);
  },

  setCodexPort: (port) => set({ codexPort: port }),
  setActiveTaskId: (id) => set({ activeTaskId: id }),

  setCodexPath: async (path) => {
    set({ codexPath: path });
    try {
      const store = await load("workspace.json", { defaults: {}, autoSave: true });
      await store.set("codexPath", path);
    } catch { /* not in Tauri */ }
  },

  // Keep legacy compat
  setProjectPath: (path: string) => {
    get().openWorkspace(path);
  },

  hydrate: async () => {
    try {
      const store = await load("workspace.json", { defaults: {}, autoSave: false });
      const workspaces = await store.get<Workspace[]>("workspaces");
      const activeId = await store.get<string>("activeId");

      if (workspaces && workspaces.length > 0) {
        const validActiveId = activeId && workspaces.find((w) => w.id === activeId)
          ? activeId
          : workspaces[workspaces.length - 1].id;
        const projectPath = workspaces.find((w) => w.id === validActiveId)?.path ?? null;
        set({ workspaces, activeId: validActiveId, projectPath });
        return;
      }

      // Migrate legacy single-workspace
      const legacyPath = await store.get<string>("projectPath");
      if (legacyPath) {
        const ws: Workspace = { id: legacyPath, path: legacyPath, label: pathLabel(legacyPath) };
        set({ workspaces: [ws], activeId: legacyPath, projectPath: legacyPath });
        persist([ws], legacyPath);
      }

      // Load codex path
      const codexPath = await store.get<string>("codexPath");
      if (codexPath) set({ codexPath });
    } catch {
      // First run
    }
  },
}));
