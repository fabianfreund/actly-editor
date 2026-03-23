import { create } from "zustand";

export interface Agent {
  id: string;
  name: string;
  role: "planner" | "builder";
  model: string;
  provider: string;
  approval_mode: "auto" | "full" | "readonly" | "never";
  system_prompt: string | null;
  config_json: string;
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: string;
  task_id: string;
  agent_id: string;
  codex_thread_id: string | null;
  worktree_path: string | null;
  status: "idle" | "running" | "paused" | "completed" | "failed";
  created_at: string;
  updated_at: string;
}

export interface CodexEvent {
  id: string;
  session_id: string;
  type: string;
  payload: unknown;
  received_at: string;
}

interface AgentsState {
  agents: Agent[];
  sessions: Session[];
  events: Record<string, CodexEvent[]>; // keyed by session_id
  setAgents: (agents: Agent[]) => void;
  setSessions: (sessions: Session[]) => void;
  addEvent: (sessionId: string, event: CodexEvent) => void;
  clearEvents: (sessionId: string) => void;
}

export const useAgentsStore = create<AgentsState>((set) => ({
  agents: [],
  sessions: [],
  events: {},

  setAgents: (agents) => set({ agents }),
  setSessions: (sessions) => set({ sessions }),

  addEvent: (sessionId, event) =>
    set((s) => {
      const existing = s.events[sessionId] ?? [];
      return { events: { ...s.events, [sessionId]: [...existing, event] } };
    }),

  clearEvents: (sessionId) =>
    set((s) => {
      const next = { ...s.events };
      delete next[sessionId];
      return { events: next };
    }),
}));
