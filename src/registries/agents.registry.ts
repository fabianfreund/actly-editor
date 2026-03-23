/**
 * Agent type registry.
 * Add new agent roles here — each entry defines the default config for an agent type.
 */
import type { Agent } from "../store/agents";
import type { TaskStatus } from "../store/tasks";

export interface AgentWorkflow {
  startStatus: TaskStatus;
  completionStatus: TaskStatus;
  canRewriteTask: boolean;
  taskUpdateFormat?: "json_block";
  executionPrompt: string;
}

export interface AgentTypeDef {
  id: string;
  name: string;
  role: "planner" | "builder";
  defaultModel: string;
  defaultProvider: string;
  defaultApprovalMode: "auto" | "full" | "readonly" | "never";
  defaultSystemPrompt?: string;
  workflow: AgentWorkflow;
}

export const AGENT_TYPES: AgentTypeDef[] = [
  {
    id: "agent-planner",
    name: "Planner",
    role: "planner",
    defaultModel: "gpt-5.4-mini",
    defaultProvider: "openai",
    defaultApprovalMode: "auto",
    defaultSystemPrompt:
      "You are a software planning agent. Search the codebase before refining work. " +
      "When asked to improve a task, rewrite the task title and notes with concrete repository context, " +
      "clear scope, and practical acceptance criteria. You may improve the task itself but you should not " +
      "implement the code changes in this mode.",
    workflow: {
      startStatus: "improving",
      completionStatus: "planned",
      canRewriteTask: true,
      taskUpdateFormat: "json_block",
      executionPrompt:
        "You are improving a task before implementation. Read the repository, inspect relevant files, and rewrite " +
        "the task with concrete codebase context. You may update both the task title and notes. At the end of your " +
        "reply, include exactly one <task_update>{...}</task_update> JSON block with this shape: " +
        "{\"title\":\"updated title\",\"description\":\"updated notes\"}. Keep the JSON valid and omit fields you do not want to change.",
    },
  },
  {
    id: "agent-builder",
    name: "Bob (Builder)",
    role: "builder",
    defaultModel: "gpt-5.4",
    defaultProvider: "openai",
    defaultApprovalMode: "auto",
    defaultSystemPrompt:
      "You are an expert software engineer. Write clean, idiomatic code. " +
      "Run tests after changes. Keep commits small and focused.",
    workflow: {
      startStatus: "in_progress",
      completionStatus: "done",
      canRewriteTask: false,
      executionPrompt:
        "You are implementing the task. Use the current task title and notes as the source of truth, make the requested changes, " +
        "and finish by summarizing what changed and any verification you ran.",
    },
  },
];

const DEFAULT_WORKFLOW: AgentWorkflow = {
  startStatus: "in_progress",
  completionStatus: "done",
  canRewriteTask: false,
  executionPrompt:
    "You are executing the assigned task. Do the work, keep the task aligned with implementation progress, and summarize the outcome clearly.",
};

export function getAgentTypeDef(agent: Pick<Agent, "id" | "role">): AgentTypeDef | undefined {
  return AGENT_TYPES.find((def) => def.id === agent.id) ?? AGENT_TYPES.find((def) => def.role === agent.role);
}

export function getAgentWorkflow(agent: Pick<Agent, "id" | "role">): AgentWorkflow {
  return getAgentTypeDef(agent)?.workflow ?? DEFAULT_WORKFLOW;
}
