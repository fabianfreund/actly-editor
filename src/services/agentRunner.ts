/**
 * Standalone agent-start logic, shared by AgentThread (manual start),
 * TaskDetail (auto-start on agent assignment), and OnboardingModal.
 */
import { Task } from "../store/tasks";
import { Agent, Session } from "../store/agents";
import { useAgentsStore } from "../store/agents";
import { useTasksStore } from "../store/tasks";
import { useWorkspaceStore } from "../store/workspace";
import { useNotificationsStore } from "../store/notifications";
import { codexCommands } from "./tauri";
import { getCodexClient, type ApprovalRequest } from "./codex";
import { dbCreateSession, dbUpdateSession, dbAddTaskEvent, dbUpdateTask } from "./db";
import { getAgentDefaultModel, getAgentDefaultSystemPrompt, getAgentWorkflow } from "../registries/agents.registry";

export interface StartAgentOptions {
  taskId: string;
  agentId: string;
  task: Task;
  agent: Agent;
  projectPath: string;
  codexPath: string | null;
  initialMessage?: string;
  /** Called with the new session immediately after creation */
  onSessionCreated?: (session: Session) => void;
  /** Called when an approval_request arrives */
  onApprovalRequest?: (req: ApprovalRequest) => void;
  /** Called when the agent's turn completes */
  onTurnCompleted?: () => void;
}

export async function startAgent(opts: StartAgentOptions): Promise<void> {
  const { taskId, agentId, task, agent, projectPath, codexPath,
          initialMessage, onSessionCreated, onApprovalRequest, onTurnCompleted } = opts;
  const workflow = getAgentWorkflow(agent);
  const runtimeModel = agent.model?.trim() || getAgentDefaultModel(agent) || "gpt-5.4-mini";
  const runtimeSystemPrompt = agent.system_prompt?.trim() || getAgentDefaultSystemPrompt(agent);

  const session = await dbCreateSession(taskId, agentId);
  const { setSessions, sessions } = useAgentsStore.getState();
  setSessions([...sessions, session]);
  onSessionCreated?.(session);

  const port = await codexCommands.startServer(session.id, projectPath, codexPath);
  useWorkspaceStore.getState().setCodexPort(port);

  let currentTask = { ...task };
  const { addEvent } = useAgentsStore.getState();
  const { addEvent: addTaskEvent } = useTasksStore.getState();
  const { addNotification } = useNotificationsStore.getState();

  const applyTaskUpdate = async (
    taskIdToUpdate: string,
    updates: Partial<Pick<Task, "title" | "description" | "status">>,
    actor: string,
    activityContent?: string
  ) => {
    const hasChanges = Object.entries(updates).some(([key, value]) => currentTask[key as keyof Task] !== value);
    if (!hasChanges) return;
    currentTask = { ...currentTask, ...updates };
    await dbUpdateTask(taskIdToUpdate, updates).catch(() => null);
    useTasksStore.getState().upsertTask(currentTask);
    if (activityContent) {
      const taskEvent = await dbAddTaskEvent(taskIdToUpdate, "state_change", activityContent, actor).catch(() => null);
      if (taskEvent) addTaskEvent(taskEvent);
    }
  };

  await applyTaskUpdate(
    taskId,
    { status: workflow.startStatus },
    agent.name,
    `Moved to ${workflow.startStatus.replace(/_/g, " ")}`
  );

  const client = await getCodexClient(port);
  let runHadError = false;
  let latestAgentMessage = "";

  const markTaskNeedsIntervention = async (reason: string) => {
    const taskEvent = await dbAddTaskEvent(taskId, "agent_question", reason, agent.name).catch(() => null);
    if (taskEvent) addTaskEvent(taskEvent);
    addNotification({
      kind: "task_state_change",
      taskId,
      taskTitle: task.title,
      agentName: agent.name,
      content: reason,
    });
  };

  const updateSessionStatus = async (status: Session["status"]) => {
    await dbUpdateSession(session.id, { status });
    const store = useAgentsStore.getState();
    store.setSessions(
      store.sessions.map((existing) =>
        existing.id === session.id ? { ...existing, status } : existing
      )
    );
  };

  client.on("*", async (event) => {
    const codexEvent = {
      id: `${Date.now()}-${Math.random()}`,
      session_id: session.id,
      type: event.type,
      payload: event,
      received_at: new Date().toISOString(),
    };
    addEvent(session.id, codexEvent);

    // Capture real thread ID from thread.started / thread/started
    if (event.type === "thread.started" || (event.type as string) === "thread/started") {
      const id = (event.thread_id
        ?? (event.params as Record<string, unknown> | undefined)?.["thread_id"]
        ?? session.id) as string;
      await dbUpdateSession(session.id, { codex_thread_id: id });
      const store = useAgentsStore.getState();
      store.setSessions(
        store.sessions.map((existing) =>
          existing.id === session.id ? { ...existing, codex_thread_id: id } : existing
        )
      );
    }

    if (event.type === "turn.started") {
      await updateSessionStatus("running");
    }

    if (event.type === "item.agent_message" && event.item) {
      const content = (event.item as { content?: string }).content ?? JSON.stringify(event.item);
      latestAgentMessage += content;
    }

    if (event.type === "item.command_exec" && event.item) {
      const item = event.item as { command?: string[] };
      const command = item.command?.join(" ");
      if (command) {
        const taskEvent = await dbAddTaskEvent(taskId, "state_change", `Ran ${command}`, agent.name).catch(() => null);
        if (taskEvent) addTaskEvent(taskEvent);
      }
    }

    if (event.type === "item.file_change" && event.item) {
      const item = event.item as { path?: string };
      if (item.path) {
        const taskEvent = await dbAddTaskEvent(taskId, "state_change", `Updated ${item.path}`, agent.name).catch(() => null);
        if (taskEvent) addTaskEvent(taskEvent);
      }
    }

    if (event.type === "approval_request") {
      await updateSessionStatus("paused");
      const req = event as ApprovalRequest;
      const summary = req.description?.trim() || "Approval required";
      const approvalEvent = await dbAddTaskEvent(
        taskId,
        "approval",
        `Approval requested: ${summary}`,
        agent.name,
        JSON.stringify({ request_id: req.request_id, status: "pending" })
      ).catch(() => null);
      if (approvalEvent) addTaskEvent(approvalEvent);
      onApprovalRequest?.(req);
      addNotification({
        kind: "approval_request",
        taskId,
        taskTitle: task.title,
        agentName: agent.name,
        content: summary,
        sessionId: session.id,
        requestId: req.request_id,
      });
    }

    if (event.type === "turn.completed") {
      if (runHadError) {
        await updateSessionStatus("failed");
        return;
      }
      const parsedTaskUpdate = workflow.canRewriteTask ? extractTaskUpdate(latestAgentMessage) : null;
      const finalMessage = (parsedTaskUpdate?.cleanMessage ?? latestAgentMessage).trim();
      if (parsedTaskUpdate && (parsedTaskUpdate.title || parsedTaskUpdate.description)) {
        await applyTaskUpdate(
          taskId,
          {
            title: parsedTaskUpdate.title ?? currentTask.title,
            description: parsedTaskUpdate.description ?? currentTask.description,
          },
          agent.name,
          parsedTaskUpdate.title && parsedTaskUpdate.description
            ? "Refined the task title and notes"
            : parsedTaskUpdate.title
            ? "Updated the task title"
            : "Updated the task notes"
        );
      }
      if (finalMessage) {
        const taskEvent = await dbAddTaskEvent(taskId, "agent_message", finalMessage, agent.name).catch(() => null);
        if (taskEvent) addTaskEvent(taskEvent);
        addNotification({
          kind: "agent_message",
          taskId,
          taskTitle: task.title,
          agentName: agent.name,
          content: finalMessage,
        });
        latestAgentMessage = "";
      }
      if (currentTask.status !== workflow.completionStatus) {
        await applyTaskUpdate(
          taskId,
          { status: workflow.completionStatus },
          agent.name,
          `Moved to ${workflow.completionStatus.replace(/_/g, " ")}`
        );
      }
      await updateSessionStatus("completed");
      onTurnCompleted?.();
      addNotification({
        kind: "turn_completed",
        taskId,
        taskTitle: task.title,
        agentName: agent.name,
        content: `${agent.name} finished a turn.`,
      });
    }

    if (event.type === "turn.failed") {
      runHadError = true;
      latestAgentMessage = "";
      await updateSessionStatus("failed");
      await markTaskNeedsIntervention((event.message as string | undefined) ?? `${agent.name} needs help to continue.`);
    }

    if (event.type === "error") {
      runHadError = true;
      latestAgentMessage = "";
      await updateSessionStatus("failed");
      await markTaskNeedsIntervention((event.message as string | undefined) ?? "Codex connection error");
    }
  });

  try {
    const threadId = await client.createThread({
      workdir: projectPath,
      model: runtimeModel,
      approval_mode: agent.approval_mode,
    });

    await dbUpdateSession(session.id, { codex_thread_id: threadId });
    const sessionStore = useAgentsStore.getState();
    sessionStore.setSessions(
      sessionStore.sessions.map((existing) =>
        existing.id === session.id ? { ...existing, codex_thread_id: threadId } : existing
      )
    );

    await updateSessionStatus("running");

    const baseMessage = initialMessage?.trim()
      ? initialMessage.trim()
      : task.description
      ? `${task.title}\n\n${task.description}`
      : task.title;
    const instructionBlock = [runtimeSystemPrompt, workflow.executionPrompt]
      .filter(Boolean)
      .join("\n\n");
    const msg = instructionBlock
      ? `${baseMessage}\n\nAgent instructions:\n${instructionBlock}`
      : baseMessage;
    await client.sendMessage(msg, {
      cwd: projectPath,
      model: runtimeModel,
      approval_mode: agent.approval_mode,
    });
  } catch (error) {
    await updateSessionStatus("failed");
    const reason = error instanceof Error ? error.message : String(error);
    await markTaskNeedsIntervention(reason);
    await codexCommands.stopServer(session.id).catch(() => undefined);
    throw error;
  }
}

export async function stopTaskSessions(taskId: string): Promise<void> {
  const { sessions, setSessions, clearEvents } = useAgentsStore.getState();
  const taskSessions = sessions.filter((session) => session.task_id === taskId);

  await Promise.all(
    taskSessions.map((session) =>
      codexCommands.stopServer(session.id).catch(() => undefined)
    )
  );

  taskSessions.forEach((session) => clearEvents(session.id));
  setSessions(sessions.filter((session) => session.task_id !== taskId));

  const workspaceStore = useWorkspaceStore.getState();
  if (workspaceStore.activeTaskId === taskId) {
    workspaceStore.setCodexPort(null);
  }
}

function extractTaskUpdate(message: string): { cleanMessage: string; title?: string; description?: string } | null {
  const match = message.match(/<task_update>\s*([\s\S]*?)\s*<\/task_update>/i);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[1]) as { title?: unknown; description?: unknown };
    return {
      cleanMessage: message.replace(match[0], "").trim(),
      title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : undefined,
      description:
        typeof parsed.description === "string" && parsed.description.trim()
          ? parsed.description.trim()
          : undefined,
    };
  } catch {
    return {
      cleanMessage: message.trim(),
    };
  }
}
