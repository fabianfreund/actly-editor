import { useEffect, useRef, useState, useCallback, memo } from "react";
import { Play } from "lucide-react";
import { ApprovalCard, type ApprovalState } from "../../components/ApprovalCard";
import { useWorkspaceStore } from "../../store/workspace";
import { useTasksStore } from "../../store/tasks";
import { useAgentsStore } from "../../store/agents";
import { dbListAgents, dbListSessions, dbUpdateSession, dbUpdateTaskEventMetadata } from "../../services/db";
import { getCodexClient, type ApprovalDecision, type ApprovalRequest } from "../../services/codex";
import { startAgent } from "../../services/agentRunner";
import { TaskRunStateBadge, getTaskRunState } from "../../components/TaskRunState";
import { FormattedText } from "../../components/FormattedText";

export default function AgentThread() {
  const { activeTaskId, projectPath, codexPort, codexPath } = useWorkspaceStore();
  const { tasks, updateEvent } = useTasksStore();
  const { agents, sessions, events, setAgents, setSessions } = useAgentsStore();
  const [message, setMessage] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState<string>("agent-builder");
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);
  const [pendingApprovalEventId, setPendingApprovalEventId] = useState<string | null>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);

  const task = tasks.find((t) => t.id === activeTaskId);
  const taskSessions = sessions
    .filter((s) => s.task_id === activeTaskId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const activeSession = taskSessions[0];
  const selectedAgent = agents.find((agent) => agent.id === activeSession?.agent_id);
  const sessionEvents = activeSession ? (events[activeSession.id] ?? []) : [];
  const runState = task ? getTaskRunState(task, sessions) : null;
  const displayEvents = buildDisplayEvents(sessionEvents);

  useEffect(() => {
    dbListAgents().then(setAgents).catch(console.error);
  }, [setAgents]);

  useEffect(() => {
    if (activeTaskId) {
      dbListSessions(activeTaskId).then(setSessions).catch(console.error);
    }
  }, [activeTaskId, setSessions]);

  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sessionEvents.length]);

  const handleStart = async () => {
    if (!activeTaskId || !projectPath || !task) return;
    const agent = agents.find((a) => a.id === selectedAgentId);
    if (!agent) return;

    try {
      await startAgent({
        taskId: activeTaskId,
        agentId: selectedAgentId,
        task,
        agent,
        projectPath,
        codexPath,
        onSessionCreated: (session) => {
          setSessions([...sessions, session]);
        },
        onApprovalRequest: (req, taskEventId) => {
          setPendingApproval(req);
          setPendingApprovalEventId(taskEventId);
        },
      });
    } catch (e) {
      console.error("Failed to start agent:", e);
    }
  };

  const handleSend = async () => {
    if (!message.trim() || !codexPort || !activeSession) return;
    const nextMessage = message.trim();
    setMessage("");
    const client = await getCodexClient(codexPort);
    await dbUpdateSession(activeSession.id, { status: "running" });
    setSessions(
      sessions.map((session) =>
        session.id === activeSession.id ? { ...session, status: "running" } : session
      )
    );
    await client.sendMessage(nextMessage, {
      cwd: projectPath ?? undefined,
    });
  };

  // ⚡ Bolt Optimization: Wrap handleApprovalDecision in useCallback to prevent child components
  // like EventBubble from breaking their memoization when the parent AgentThread re-renders.
  const handleApprovalDecision = useCallback(async (requestId: string, decision: ApprovalDecision) => {
    // Read directly from stores to prevent depending on changing component variables
    const state = useWorkspaceStore.getState();
    const port = state.codexPort;
    const tId = state.activeTaskId;

    // Determine active session lazily when the callback fires
    const taskSessions = useAgentsStore.getState().sessions
      .filter((s) => s.task_id === tId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const session = taskSessions[0];

    if (!port || !session || !tId) return;

    const client = await getCodexClient(port);
    client.respondToApproval(requestId, decision);
    await dbUpdateSession(session.id, { status: "running" });

    // Update sessions globally without relying on the current local `sessions` variable
    useAgentsStore.getState().setSessions(
      useAgentsStore.getState().sessions.map((s) =>
        s.id === session.id ? { ...s, status: "running" } : s
      )
    );

    useAgentsStore.getState().addEvent(session.id, {
      id: `${Date.now()}-${Math.random()}`,
      session_id: session.id,
      type: "approval_resolved",
      payload: { request_id: requestId, decision },
      received_at: new Date().toISOString(),
    });

    if (pendingApprovalEventId) {
      const resolved: ApprovalState =
        decision === "accept" ? "accepted" :
        decision === "acceptForSession" ? "alwaysApproved" : "declined";
      const metadata = JSON.stringify({ request_id: requestId, status: resolved, decision });
      await dbUpdateTaskEventMetadata(pendingApprovalEventId, metadata).catch(() => {});
      const events = useTasksStore.getState().events;
      const existing = (events[tId] ?? []).find((e) => e.id === pendingApprovalEventId);
      if (existing) useTasksStore.getState().updateEvent({ ...existing, metadata });
    }

    if (pendingApproval?.request_id === requestId) {
      setPendingApproval(null);
      setPendingApprovalEventId(null);
    }
  }, [pendingApprovalEventId, pendingApproval]); // ⚡ Bolt Optimization: pendingApproval state only changes during approvals, preserving stability during token streams

  if (!activeTaskId || !task) {
    return (
      <div
        className="panel-full"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
          fontSize: "var(--font-size-sm)",
        }}
      >
        Select a task to start an agent
      </div>
    );
  }

  return (
    <div className="panel-full">
      <div className="panel-header">
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <select
            value={selectedAgentId}
            onChange={(e) => setSelectedAgentId(e.target.value)}
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-default)",
              borderRadius: 3,
              color: "var(--text-secondary)",
              fontSize: "var(--font-size-xs)",
              padding: "2px 6px",
            }}
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          {!activeSession ? (
            <button className="btn btn-primary" onClick={handleStart} style={{ padding: "2px 8px" }}>
              <Play size={12} />
              <span>Start</span>
            </button>
          ) : (
            runState && <TaskRunStateBadge state={runState} />
          )}
        </div>
      </div>

      {/* Event stream */}
      <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {sessionEvents.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: "var(--font-size-sm)",
              padding: 24,
            }}
          >
            Start an agent to see activity
          </div>
        ) : (
          displayEvents.map((ev) => (
            <EventBubble
              key={ev.id}
              event={ev}
              rootPath={projectPath}
              onApprovalDecision={handleApprovalDecision}
            />
          ))
        )}
        <div ref={eventsEndRef} />
      </div>

      {/* Input */}
      {activeSession && (
        <div
          style={{
            padding: "8px 12px",
            borderTop: "1px solid var(--border-default)",
            display: "flex",
            gap: 6,
            flexShrink: 0,
          }}
        >
          <input
            className="input"
            placeholder="Message the agent…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <button className="btn btn-primary" onClick={handleSend} disabled={!message.trim()}>
            Send
          </button>
        </div>
      )}
    </div>
  );
}

type DisplayEvent = {
  id: string;
  kind: "user" | "agent" | "step" | "error" | "system" | "approval";
  content: string;
  request?: ApprovalRequest;
  approvalState?: "pending" | "approved" | "alwaysApproved" | "dismissed";
};

function formatApprovalDescription(request: ApprovalRequest): string {
  if (request.description.trim()) {
    return request.description;
  }
  if (request.command?.length) {
    return "The agent wants to run a command that needs your approval.";
  }
  if (request.file_paths?.length) {
    return "The agent wants to make file changes that need your approval.";
  }
  if (request.grant_root?.trim()) {
    return `The agent wants permission to work inside ${request.grant_root}.`;
  }
  if (request.reason?.trim()) {
    return request.reason;
  }
  if (request.method === "item/commandExecution/requestApproval") {
    return "The agent wants to run a command that needs your approval.";
  }
  if (request.method === "item/fileChange/requestApproval") {
    return "The agent wants to make file changes that need your approval.";
  }
  return "The agent needs your approval to continue.";
}

function getApprovalMeta(request: ApprovalRequest): { label: string; value: string }[] {
  const meta: { label: string; value: string }[] = [];

  if (request.reason?.trim()) {
    meta.push({ label: "Reason", value: request.reason.trim() });
  }
  if (request.grant_root?.trim()) {
    meta.push({ label: "Scope", value: request.grant_root.trim() });
  }
  if (!request.command?.length && !request.file_paths?.length && request.item_id?.trim()) {
    meta.push({ label: "Request", value: "The agent is waiting on approval for this action." });
  }

  return meta;
}

function buildDisplayEvents(events: { id: string; type: string; payload: unknown }[]): DisplayEvent[] {
  const display: DisplayEvent[] = [];
  const approvalIndexes = new Map<string, number>();

  const pushOrMergeAgent = (id: string, content: string) => {
    if (!content) return;
    if (!content.trim()) {
      const last = display[display.length - 1];
      if (last?.kind === "agent") {
        last.content += content;
      }
      return;
    }

    const last = display[display.length - 1];
    if (last?.kind === "agent") {
      last.content += content;
      return;
    }
    display.push({ id, kind: "agent", content });
  };

  for (const event of events) {
    const payload = event.payload as Record<string, unknown>;

    if (event.type === "item.agent_message" && payload.item) {
      const item = payload.item as Record<string, unknown>;
      pushOrMergeAgent(event.id, String(item.content ?? ""));
      continue;
    }

    if (event.type === "item/started") {
      const item = (payload.item ?? {}) as Record<string, unknown>;
      if (item.type === "userMessage" && Array.isArray(item.content)) {
        const text = ((item.content[0] as Record<string, unknown> | undefined)?.text as string | undefined) ?? "";
        if (text.trim()) display.push({ id: event.id, kind: "user", content: text.trim() });
      }
      continue;
    }

    if (event.type === "turn.started") {
      display.push({ id: event.id, kind: "system", content: "Thinking…" });
      continue;
    }

    if (event.type === "item.command_exec" && payload.item) {
      const item = payload.item as Record<string, unknown>;
      const command = (item.command as string[] | undefined)?.join(" ");
      if (command) display.push({ id: event.id, kind: "step", content: `Ran ${command}` });
      continue;
    }

    if (event.type === "item.file_change" && payload.item) {
      const item = payload.item as Record<string, unknown>;
      const path = item.path as string | undefined;
      if (path) display.push({ id: event.id, kind: "step", content: `Updated ${path}` });
      continue;
    }

    if (event.type === "turn.completed") {
      display.push({ id: event.id, kind: "system", content: "Done." });
      continue;
    }

    if (event.type === "approval_request") {
      const nextEvent: DisplayEvent = {
        id: event.id,
        kind: "approval",
        content: formatApprovalDescription(payload as unknown as ApprovalRequest),
        request: payload as unknown as ApprovalRequest,
        approvalState: "pending",
      };
      display.push(nextEvent);
      approvalIndexes.set(String((payload as ApprovalRequest).request_id), display.length - 1);
      continue;
    }

    if (event.type === "approval_resolved") {
      const requestId = String(payload.request_id ?? "");
      const decision = String(payload.decision ?? "");
      const approvalIndex = approvalIndexes.get(requestId);
      if (approvalIndex !== undefined) {
        display[approvalIndex] = {
          ...display[approvalIndex],
          approvalState:
            decision === "accept"
              ? "approved"
              : decision === "acceptForSession"
              ? "alwaysApproved"
              : "dismissed",
        };
      }
      continue;
    }

    if (event.type === "turn.failed" || event.type === "error") {
      const message = String(payload.message ?? "Something went wrong");
      display.push({ id: event.id, kind: "error", content: message });
    }
  }

  return display;
}

// ⚡ Bolt Optimization: Memoize EventBubble so it only re-renders when its specific event data
// changes, avoiding O(N) re-renders when a new event streams into the chat.
const EventBubble = memo(function EventBubble({
  event,
  rootPath,
  onApprovalDecision,
}: {
  event: DisplayEvent;
  rootPath?: string | null;
  onApprovalDecision?: (requestId: string, decision: ApprovalDecision) => void;
}) {
  const isUser = event.kind === "user";
  const isStep = event.kind === "step";
  const isError = event.kind === "error";
  const isSystem = event.kind === "system";
  const isApproval = event.kind === "approval";
  const content = event.kind === "agent" ? event.content.trim() : event.content;

  if (isApproval && event.request && onApprovalDecision) {
    const approvalState = event.approvalState ?? "pending";
    const stateMap: Record<string, ApprovalState> = {
      pending: "pending", approved: "accepted", alwaysApproved: "alwaysApproved", dismissed: "declined",
    };
    return (
      <ApprovalCard
        description={content}
        command={event.request.command}
        file_paths={event.request.file_paths}
        meta={getApprovalMeta(event.request)}
        state={stateMap[approvalState] ?? "pending"}
        requestId={event.request.request_id}
        rootPath={rootPath}
        onDecision={onApprovalDecision}
      />
    );
  }

  return (
    <div
      style={{
        padding: isSystem ? "4px 2px" : "10px 12px",
        borderRadius: isSystem ? 0 : 10,
        background: isUser
          ? "transparent"
          : isStep
          ? "var(--bg-elevated)"
          : isError
          ? "rgba(244,135,113,0.08)"
          : isSystem
          ? "transparent"
          : "var(--bg-surface)",
        border: isSystem ? "none" : "1px solid transparent",
        borderLeft: isStep ? "2px solid var(--accent)" : isError ? "1px solid rgba(244,135,113,0.2)" : "1px solid rgba(255,255,255,0.02)",
        fontSize: isSystem ? "var(--font-size-xs)" : "var(--font-size-sm)",
        color: isError
          ? "var(--text-error)"
          : isUser
          ? "var(--text-muted)"
          : isSystem
          ? "var(--text-muted)"
          : "var(--text-primary)",
        fontFamily: "var(--font-sans)",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        fontStyle: isUser ? "italic" : "normal",
        lineHeight: 1.6,
        maxWidth: isSystem ? "100%" : isUser ? 760 : 820,
        boxShadow: isSystem ? "none" : "inset 0 1px 0 rgba(255,255,255,0.015)",
      }}
    >
      <FormattedText text={content} rootPath={rootPath} />
    </div>
  );
});
