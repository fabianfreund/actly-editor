/**
 * Agent type registry.
 * Add new agent roles here — each entry defines the default config for an agent type.
 */
import type { Agent } from "../store/agents";
import type { TaskStatus } from "../store/tasks";

export interface AgentWorkflow {
  /** Status to set when the agent starts. null = leave the task status unchanged. */
  startStatus: TaskStatus | null;
  /** Status to set when the agent finishes. null = leave the task status unchanged. */
  completionStatus: TaskStatus | null;
  canRewriteTask: boolean;
  taskUpdateFormat?: "json_block";
  executionPrompt: string;
}

export interface AgentTypeDef {
  id: string;
  name: string;
  role: "planner" | "builder" | "initializer";
  defaultModel: string;
  defaultProvider: string;
  defaultApprovalMode: "auto" | "full" | "readonly" | "never";
  defaultSystemPrompt?: string;
  workflow: AgentWorkflow;
}

export const AGENT_TYPES: AgentTypeDef[] = [
  {
    id: "agent-planner",
    name: "Patty the Planner",
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
      startStatus: "icebox",
      completionStatus: "planned",
      canRewriteTask: true,
      taskUpdateFormat: "json_block",
      executionPrompt:
        "You are improving a task before implementation. Read the repository, inspect relevant files, and rewrite " +
        "the task with concrete codebase context. You may update both the task title and notes. At the end of your " +
        "reply, include exactly one <task_update>{...}</task_update> JSON block with this shape: " +
        "{\"title\":\"updated title\",\"description\":\"updated notes\"}. Keep the JSON valid and omit fields you do not want to change. " +
        "Throughout your work, you may emit one or more <actly_activity>{...}</actly_activity> JSON blocks " +
        "to report progress, ask the user a question, or summarise findings. Each block must match this shape: " +
        "{\"type\":\"activity\"|\"question\"|\"summary\",\"text\":\"main message\"," +
        "\"items\":[{\"label\":\"string\",\"detail\":\"optional string\"}],\"tag_user\":false}. " +
        "Omit \"items\" when you have no list to share. Set \"tag_user\":true only if the user must respond before you can continue.",
    },
  },
  {
    id: "agent-builder",
    name: "Bob the Builder",
    role: "builder",
    defaultModel: "gpt-5.4",
    defaultProvider: "openai",
    defaultApprovalMode: "auto",
    defaultSystemPrompt:
      "You are an expert software engineer. Write clean, idiomatic code. " +
      "Run tests after changes. Keep commits small and focused.",
    workflow: {
      startStatus: "in_progress",
      // null = let the agent decide via <task_update> status field
      completionStatus: null,
      canRewriteTask: true,
      taskUpdateFormat: "json_block",
      executionPrompt:
        "You are implementing the task. Use the current task title and notes as the source of truth, make the requested changes, " +
        "and finish by summarizing what changed and any verification you ran. " +
        "At the end of your reply, include exactly one <task_update>{...}</task_update> JSON block to set the outcome. " +
        "Use {\"status\":\"done\"} when the task is fully implemented and verified. " +
        "Use {\"status\":\"in_progress\"} if work is only partially complete or you were blocked. " +
        "You may also include \"title\" or \"description\" fields in the same block to update the task notes with a completion summary. " +
        "Keep the JSON valid and omit fields you do not want to change. " +
        "Throughout your work, you may also emit one or more <actly_activity>{...}</actly_activity> JSON blocks " +
        "to report progress, ask the user a question, or summarise findings. Each block must match this shape: " +
        "{\"type\":\"activity\"|\"question\"|\"summary\",\"text\":\"main message\"," +
        "\"items\":[{\"label\":\"string\",\"detail\":\"optional string\"}],\"tag_user\":false}. " +
        "Omit \"items\" when you have no list to share. Set \"tag_user\":true only if the user must respond before you can continue.",
    },
  },
  {
    id: "agent-initializer",
    name: "Izzy the Initializer",
    role: "initializer",
    defaultModel: "gpt-5.4",
    defaultProvider: "openai",
    defaultApprovalMode: "auto",
    defaultSystemPrompt:
      "You are a project initialization agent. Analyze repositories and write clear, practical documentation " +
      "and configuration for AI coding agents. Be concise, omit placeholders, and start immediately.",
    workflow: {
      startStatus: null,
      completionStatus: "done",
      canRewriteTask: false,
      executionPrompt:
        "You are initializing an Actly project workspace. Analyze this repository carefully, then:\n\n" +
        "1. Overwrite `.actly/AGENTS.md` with a complete version containing:\n" +
        "   - A 2–3 paragraph project overview (what it does, tech stack, purpose)\n" +
        "   - Key files and directories with short descriptions\n" +
        "   - Practical coding guidelines for AI agents (conventions, patterns, gotchas)\n" +
        "   - A references table linking to docs files\n\n" +
        "2. Overwrite `.actly/docs/architecture.md` with:\n" +
        "   - Tech stack and major dependencies\n" +
        "   - High-level data flow or request lifecycle\n" +
        "   - Key architectural decisions and why they were made\n\n" +
        "3. Read `package.json` (or Makefile) and write `.actly/actions.json` as a JSON array:\n" +
        "   [{\"id\":\"dev\",\"label\":\"Dev Server\",\"command\":\"npm\",\"args\":[\"run\",\"dev\"]}, ...]\n" +
        "   Include all useful scripts (dev, build, test, lint, typecheck, preview, etc).\n" +
        "   Output only the JSON array in this file — no markdown.\n\n" +
        "Be concise and practical. Do not add placeholders — if you cannot determine something, omit it. " +
        "Start working immediately without asking questions.",
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

export function getAgentDefaultModel(agent: Pick<Agent, "id" | "role">): string | undefined {
  return getAgentTypeDef(agent)?.defaultModel;
}

export function getAgentDefaultSystemPrompt(agent: Pick<Agent, "id" | "role">): string | undefined {
  return getAgentTypeDef(agent)?.defaultSystemPrompt;
}
