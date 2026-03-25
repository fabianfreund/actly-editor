import { create } from "zustand";
import { load } from "@tauri-apps/plugin-store";
import { v4 as uuidv4 } from "uuid";
import { TASK_TEMPLATES, type TaskTemplate } from "../registries/tasks.registry";

export interface CustomTaskTemplate extends TaskTemplate {
  isCustom: true;
}

interface TemplatesState {
  customTemplates: CustomTaskTemplate[];
  allTemplates: () => TaskTemplate[];
  hydrate: () => Promise<void>;
  addTemplate: (t: Omit<TaskTemplate, "id">) => Promise<void>;
  updateTemplate: (t: CustomTaskTemplate) => Promise<void>;
  removeTemplate: (id: string) => Promise<void>;
}

async function persistCustom(templates: CustomTaskTemplate[]) {
  try {
    const store = await load("templates.json", { defaults: {}, autoSave: true });
    await store.set("customTemplates", templates);
  } catch {
    // not available outside Tauri
  }
}

export const useTemplatesStore = create<TemplatesState>((set, get) => ({
  customTemplates: [],

  allTemplates: () => [...TASK_TEMPLATES, ...get().customTemplates],

  hydrate: async () => {
    try {
      const store = await load("templates.json", { defaults: {}, autoSave: false });
      const custom = await store.get<CustomTaskTemplate[]>("customTemplates");
      if (custom && custom.length > 0) {
        set({ customTemplates: custom });
      }
    } catch {
      // first run
    }
  },

  addTemplate: async (t) => {
    const newTemplate: CustomTaskTemplate = { ...t, id: uuidv4(), isCustom: true };
    const updated = [...get().customTemplates, newTemplate];
    set({ customTemplates: updated });
    await persistCustom(updated);
  },

  updateTemplate: async (t) => {
    const updated = get().customTemplates.map((c) => (c.id === t.id ? t : c));
    set({ customTemplates: updated });
    await persistCustom(updated);
  },

  removeTemplate: async (id) => {
    const updated = get().customTemplates.filter((c) => c.id !== id);
    set({ customTemplates: updated });
    await persistCustom(updated);
  },
}));
