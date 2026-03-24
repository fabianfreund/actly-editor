/**
 * Task template registry.
 * Templates pre-fill title, description, and assigned agent when creating well-known tasks.
 * Add new entries here to support additional templates in the future.
 */
import type { TaskStatus } from "../store/tasks";

export interface TaskTemplate {
  id: string;
  title: string;
  description: string;
  assigned_agent_id: string | null;
  initial_status?: TaskStatus;
}

export const TASK_TEMPLATES: TaskTemplate[] = [
  {
    id: "initialize-project",
    title: "Initialize project",
    description:
      "Analyze this repository and set up the .actly workspace:\n" +
      "• Write AGENTS.md with project overview, key files, and coding guidelines\n" +
      "• Write docs/architecture.md with tech stack and architectural decisions\n" +
      "• Detect available scripts and write actions.json",
    assigned_agent_id: "agent-initializer",
    initial_status: "in_progress",
  },
];

export function getTaskTemplate(id: string): TaskTemplate | undefined {
  return TASK_TEMPLATES.find((t) => t.id === id);
}
