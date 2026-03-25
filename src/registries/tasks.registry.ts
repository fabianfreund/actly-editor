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
  {
    id: "reinitialize-project",
    title: "Reinitialize project",
    description:
      "Re-analyze this repository and refresh the .actly workspace:\n" +
      "• Update AGENTS.md with current project overview, key files, and coding guidelines\n" +
      "• Update docs/architecture.md with latest tech stack and architectural decisions\n" +
      "• Refresh actions.json with current available scripts",
    assigned_agent_id: "agent-initializer",
    initial_status: "in_progress",
  },
  {
    id: "refactor",
    title: "Refactor",
    description:
      "Identify and clean up code quality issues in the codebase:\n" +
      "• Extract duplicated logic into shared utilities\n" +
      "• Improve naming and readability\n" +
      "• Simplify overly complex functions\n" +
      "• Ensure consistent patterns across modules",
    assigned_agent_id: "agent-builder",
  },
];

export function getTaskTemplate(id: string): TaskTemplate | undefined {
  return TASK_TEMPLATES.find((t) => t.id === id);
}
