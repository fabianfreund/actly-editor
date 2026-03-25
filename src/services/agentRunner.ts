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
import { useActionsStore } from "../store/actions";
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
  /** Called when an approval_request arrives. taskEventId is the DB event that can be updated on resolution. */
  onApprovalRequest?: (req: ApprovalRequest, taskEventId: string | null) => void;
  /** Called when the agent's turn completes */
  onTurnCompleted?: () => void;
}

export async function startAgent(opts: StartAgentOptions): Promise<void> {
  const { taskId, agentId, task, agent, projectPath, codexPath,
          initialMessage, onSessionCreated, onApprovalRequest, onTurnCompleted } = opts;
  const workflow = getAgentWorkflow(agent);
  const runtimeModel = agent.model?.trim() || getAgentDefaultModel(agent) || "gpt-5.4-mini";
  const runtimeSystemPrompt = agent.system_prompt?.trim() || getAgentDefaultSystemPrompt(agent);

  const { yoloMode } = useWorkspaceStore.getState();
  const effectiveApprovalMode = yoloMode ? "never" : agent.approval_mode;

  const workspaceId = task.workspace_id ?? projectPath;
  const session = await dbCreateSession(taskId, agentId, workspaceId);
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
      const taskEvent = await dbAddTaskEvent(taskIdToUpdate, workspaceId, "state_change", activityContent, actor).catch(() => null);
      if (taskEvent) addTaskEvent(taskEvent);
    }
  };

  if (workflow.startStatus) {
    await applyTaskUpdate(
      taskId,
      { status: workflow.startStatus },
      agent.name,
      `Moved to ${workflow.startStatus.replace(/_/g, " ")}`
    );
  }

  const client = await getCodexClient(port);
  let runHadError = false;
  let latestAgentMessage = "";

  const markTaskNeedsIntervention = async (reason: string) => {
    const taskEvent = await dbAddTaskEvent(taskId, workspaceId, "agent_question", reason, agent.name).catch(() => null);
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
      const startEvent = await dbAddTaskEvent(taskId, workspaceId, "state_change", `${agent.name} started`, agent.name).catch(() => null);
      if (startEvent) addTaskEvent(startEvent);
    }

    if (event.type === "item.agent_message" && event.item) {
      const content = (event.item as { content?: string }).content ?? JSON.stringify(event.item);
      latestAgentMessage += content;

      // Emit any completed <actly_activity> blocks immediately as they arrive
      const { cleanMessage, activities } = extractActlyActivities(latestAgentMessage);
      if (activities.length > 0) {
        latestAgentMessage = cleanMessage; // strip processed tags to avoid double-write at turn.completed
        for (const activity of activities) {
          const isUserFacing = activity.type === "question" || activity.tag_user === true;
          const eventType = isUserFacing ? "agent_question" : "agent_message";
          const activityEvent = await dbAddTaskEvent(
            taskId, workspaceId, eventType,
            activity.text, agent.name,
            JSON.stringify({ type: activity.type, text: activity.text, items: activity.items ?? [] })
          ).catch(() => null);
          if (activityEvent) addTaskEvent(activityEvent);
        }
      }
    }

    if (event.type === "item.command_exec" && event.item) {
      const item = event.item as { command?: string[] };
      const command = item.command?.join(" ");
      if (command) {
        const taskEvent = await dbAddTaskEvent(taskId, workspaceId, "state_change", `Ran ${command}`, agent.name).catch(() => null);
        if (taskEvent) addTaskEvent(taskEvent);
      }
    }

    if (event.type === "item.file_change" && event.item) {
      const item = event.item as { path?: string };
      if (item.path) {
        const taskEvent = await dbAddTaskEvent(taskId, workspaceId, "state_change", `Updated ${item.path}`, agent.name).catch(() => null);
        if (taskEvent) addTaskEvent(taskEvent);
      }
    }

    if (event.type === "approval_request") {
      const req = event as ApprovalRequest;
      const summary = req.description?.trim() || "Approval required";
      const { yoloMode } = useWorkspaceStore.getState();

      if (yoloMode) {
        const approvalEvent = await dbAddTaskEvent(
          taskId,
          workspaceId,
          "approval",
          `Auto-approved: ${summary}`,
          agent.name,
          JSON.stringify({ request_id: req.request_id, status: "accepted", decision: "accept" })
        ).catch(() => null);
        if (approvalEvent) addTaskEvent(approvalEvent);
        client.respondToApproval(req.request_id, "accept");
        return;
      }

      await updateSessionStatus("paused");
      const approvalEvent = await dbAddTaskEvent(
        taskId,
        workspaceId,
        "approval",
        `Approval requested: ${summary}`,
        agent.name,
        JSON.stringify({ request_id: req.request_id, status: "pending" })
      ).catch(() => null);
      if (approvalEvent) addTaskEvent(approvalEvent);
      onApprovalRequest?.(req, approvalEvent?.id ?? null);
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
      const afterTaskUpdate = (parsedTaskUpdate?.cleanMessage ?? latestAgentMessage).trim();
      const { cleanMessage: strippedMessage, activities } = extractActlyActivities(afterTaskUpdate);
      const finalMessage = strippedMessage;
      if (parsedTaskUpdate && (parsedTaskUpdate.title || parsedTaskUpdate.description || parsedTaskUpdate.status)) {
        const statusLabel = parsedTaskUpdate.status
          ? `Moved to ${parsedTaskUpdate.status.replace(/_/g, " ")}`
          : null;
        const contentLabel =
          parsedTaskUpdate.title && parsedTaskUpdate.description
            ? "Refined the task title and notes"
            : parsedTaskUpdate.title
            ? "Updated the task title"
            : parsedTaskUpdate.description
            ? "Updated the task notes"
            : null;
        const activityLabel = [contentLabel, statusLabel].filter(Boolean).join(", ");
        await applyTaskUpdate(
          taskId,
          {
            ...(parsedTaskUpdate.title ? { title: parsedTaskUpdate.title } : {}),
            ...(parsedTaskUpdate.description ? { description: parsedTaskUpdate.description } : {}),
            ...(parsedTaskUpdate.status ? { status: parsedTaskUpdate.status as Task["status"] } : {}),
          },
          agent.name,
          activityLabel || "Updated task"
        );
      }
      for (const activity of activities) {
        const isUserFacing = activity.type === "question" || activity.tag_user === true;
        const eventType = isUserFacing ? "agent_question" : "agent_message";
        const activityEvent = await dbAddTaskEvent(
          taskId, workspaceId, eventType, activity.text, agent.name,
          JSON.stringify({ type: activity.type, text: activity.text, items: activity.items ?? [] })
        ).catch(() => null);
        if (activityEvent) addTaskEvent(activityEvent);
        if (isUserFacing) {
          addNotification({
            kind: "task_state_change",
            taskId,
            taskTitle: task.title,
            agentName: agent.name,
            content: activity.text,
          });
        }
      }
      if (finalMessage) {
        const taskEvent = await dbAddTaskEvent(taskId, workspaceId, "agent_message", finalMessage, agent.name).catch(() => null);
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
      if (workflow.completionStatus && currentTask.status !== workflow.completionStatus) {
        await applyTaskUpdate(
          taskId,
          { status: workflow.completionStatus },
          agent.name,
          `Moved to ${workflow.completionStatus.replace(/_/g, " ")}`
        );
      }
      await updateSessionStatus("completed");
      // Reload actions from disk in case the agent wrote/updated .actly/actions.json
      useActionsStore.getState().loadActions(projectPath).catch(() => {});
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
      const partial = latestAgentMessage.trim();
      latestAgentMessage = "";
      if (partial) {
        const partialEvent = await dbAddTaskEvent(taskId, workspaceId, "agent_message", partial, agent.name).catch(() => null);
        if (partialEvent) addTaskEvent(partialEvent);
      }
      await updateSessionStatus("failed");
      await markTaskNeedsIntervention((event.message as string | undefined) ?? `${agent.name} needs help to continue.`);
    }

    if (event.type === "error") {
      runHadError = true;
      const errorMsg = (event.message as string | undefined) ?? "Codex connection error";
      // Save any partial output the agent produced before the connection dropped
      const partial = latestAgentMessage.trim();
      latestAgentMessage = "";
      if (partial) {
        const partialEvent = await dbAddTaskEvent(taskId, workspaceId, "agent_message", partial, agent.name).catch(() => null);
        if (partialEvent) addTaskEvent(partialEvent);
      }
      await updateSessionStatus("failed");
      await markTaskNeedsIntervention(errorMsg);
    }
  });

  try {
    const threadId = await client.createThread({
      workdir: projectPath,
      model: runtimeModel,
      approval_mode: effectiveApprovalMode,
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
      approval_mode: effectiveApprovalMode,
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

interface ActlyActivity {
  type: "activity" | "question" | "summary";
  text: string;
  items?: Array<{ label: string; detail?: string }>;
  tag_user?: boolean;
}

function extractActlyActivities(message: string): { cleanMessage: string; activities: ActlyActivity[] } {
  const regex = /<actly_activity>\s*([\s\S]*?)\s*<\/actly_activity>/gi;
  const matches: Array<{ full: string; json: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(message)) !== null) {
    matches.push({ full: match[0], json: match[1] });
  }

  const activities: ActlyActivity[] = [];
  let cleanMessage = message;
  for (const { full, json } of matches) {
    cleanMessage = cleanMessage.replace(full, "");
    try {
      const parsed = JSON.parse(json) as Record<string, unknown>;
      const type = parsed.type === "question" || parsed.type === "summary" ? parsed.type : "activity";
      const text = typeof parsed.text === "string" && parsed.text.trim() ? parsed.text.trim() : null;
      if (!text) continue;
      const activity: ActlyActivity = { type, text };
      if (Array.isArray(parsed.items)) {
        activity.items = (parsed.items as unknown[]).filter(
          (item): item is { label: string; detail?: string } =>
            typeof (item as Record<string, unknown>).label === "string"
        );
      }
      if (parsed.tag_user === true) activity.tag_user = true;
      activities.push(activity);
    } catch { /* skip malformed blocks */ }
  }

  return { cleanMessage: cleanMessage.trim(), activities };
}

const VALID_TASK_STATUSES = new Set(["icebox", "planned", "todo", "in_progress", "done", "failed"]);

function extractTaskUpdate(message: string): {
  cleanMessage: string;
  title?: string;
  description?: string;
  status?: string;
} | null {
  const match = message.match(/<task_update>\s*([\s\S]*?)\s*<\/task_update>/i);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[1]) as { title?: unknown; description?: unknown; status?: unknown };
    const rawStatus = typeof parsed.status === "string" ? parsed.status.trim() : undefined;
    return {
      cleanMessage: message.replace(match[0], "").trim(),
      title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : undefined,
      description:
        typeof parsed.description === "string" && parsed.description.trim()
          ? parsed.description.trim()
          : undefined,
      status: rawStatus && VALID_TASK_STATUSES.has(rawStatus) ? rawStatus : undefined,
    };
  } catch {
    return {
      cleanMessage: message.trim(),
    };
  }
}
