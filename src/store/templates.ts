import { create } from "zustand";
import Database from "@tauri-apps/plugin-sql";
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

let _db: Database | null = null;

async function getDb(): Promise<Database> {
  if (!_db) {
    _db = await Database.load("sqlite:actly.db");
    await _db.execute(
      `CREATE TABLE IF NOT EXISTS custom_templates (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        assigned_agent_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`
    );
  }
  return _db;
}

function mapRowToTemplate(row: any): CustomTaskTemplate {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    assigned_agent_id: row.assigned_agent_id ?? null,
    isCustom: true,
  };
}

export const useTemplatesStore = create<TemplatesState>((set, get) => ({
  customTemplates: [],

  allTemplates: () => [...TASK_TEMPLATES, ...get().customTemplates],

  hydrate: async () => {
    try {
      const db = await getDb();
      const rows = await db.select<
        Array<{
          id: string;
          title: string;
          description: string;
          assigned_agent_id: string | null;
          created_at: string;
          updated_at: string;
        }>
      >("SELECT id, title, description, assigned_agent_id, created_at, updated_at FROM custom_templates ORDER BY created_at ASC");
      const custom = rows.map(mapRowToTemplate);
      if (custom.length > 0) {
        set({ customTemplates: custom });
      }
    } catch (err) {
      console.error("Failed to hydrate templates", err);
    }
  },

  addTemplate: async (t) => {
    const now = new Date().toISOString();
    const newTemplate: CustomTaskTemplate = {
      ...t,
      id: uuidv4(),
      isCustom: true,
    };

    try {
      const db = await getDb();
      await db.execute(
        "INSERT INTO custom_templates (id, title, description, assigned_agent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        [newTemplate.id, newTemplate.title, newTemplate.description, newTemplate.assigned_agent_id, now, now]
      );
      set({ customTemplates: [...get().customTemplates, newTemplate] });
    } catch (err) {
      console.error("Failed to add template", err);
      throw err;
    }
  },

  updateTemplate: async (t) => {
    const now = new Date().toISOString();
    const updatedTemplates = get().customTemplates.map((c) => (c.id === t.id ? t : c));

    try {
      const db = await getDb();
      await db.execute(
        "UPDATE custom_templates SET title = ?, description = ?, assigned_agent_id = ?, updated_at = ? WHERE id = ?",
        [t.title, t.description, t.assigned_agent_id, now, t.id]
      );
      set({ customTemplates: updatedTemplates });
    } catch (err) {
      console.error("Failed to update template", err);
      throw err;
    }
  },

  removeTemplate: async (id) => {
    const existing = get().customTemplates;
    const nextTemplates = existing.filter((c) => c.id !== id);

    try {
      const db = await getDb();
      await db.execute("DELETE FROM custom_templates WHERE id = ?", [id]);
      set({ customTemplates: nextTemplates });
    } catch (err) {
      console.error("Failed to remove template", err);
      throw err;
    }
  },
}));
