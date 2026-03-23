import type { ComponentType } from "react";

export interface PanelDefinition {
  id: string;
  label: string;
  component: () => Promise<{ default: ComponentType }>;
  icon?: string;
  minWidth?: number;
  minHeight?: number;
}

/**
 * Central panel registry.
 * To add a new panel: append an entry here — no other wiring needed.
 */
export const PANELS: PanelDefinition[] = [
  {
    id: "task-board",
    label: "Tasks",
    component: () => import("../panels/TaskBoard"),
  },
  {
    id: "task-detail",
    label: "Task Detail",
    component: () => import("../panels/TaskDetail"),
  },
  {
    id: "agent-thread",
    label: "Agent",
    component: () => import("../panels/AgentThread"),
  },
  {
    id: "terminal",
    label: "Terminal",
    component: () => import("../panels/Terminal"),
  },
  {
    id: "git-panel",
    label: "Git",
    component: () => import("../panels/GitPanel"),
  },
  {
    id: "live-preview",
    label: "Preview",
    component: () => import("../panels/LivePreview"),
  },
  {
    id: "action-panel",
    label: "Actions",
    component: () => import("../panels/ActionPanel"),
  },
  {
    id: "settings",
    label: "Settings",
    component: () => import("../panels/Settings"),
  },
];

export function getPanelById(id: string): PanelDefinition | undefined {
  return PANELS.find((p) => p.id === id);
}
