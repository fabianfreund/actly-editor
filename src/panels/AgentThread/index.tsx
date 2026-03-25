import { useEffect, useRef, useState } from "react";
import { Play, Terminal, FileText } from "lucide-react";
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
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);
  const [pendingApprovalEventId, setPendingApprovalEventId] = useState<string | null>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);

  const task = tasks.find((t) => t.id === activeTaskId);
  const taskSessions = sessions
    .filter((s) => s.task_id === activeTaskId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const activeSession = taskSessions[0];

  // Determine which agent to show — prefer the one that ran the active session,
  // fall back to the task's assigned agent, then the first builder/agent available.
  const activeAgent = activeSession
    ? agents.find((a) => a.id === activeSession.agent_id)
    : task?.assigned_agent_id
    ? agents.find((a) => a.id === task.assigned_agent_id)
    : agents.find((a) => a.role === "builder") ?? agents[0];

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
    if (!activeTaskId || !projectPath || !task || !activeAgent) return;
    try {
      await startAgent({
        taskId: activeTaskId,
        agentId: activeAgent.id,
        task,
        agent: activeAgent,
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
    await client.sendMessage(nextMessage, { cwd: projectPath ?? undefined });
  };

  const handleApprovalDecision = async (requestId: string, decision: ApprovalDecision) => {
    if (!codexPort || !activeSession || !activeTaskId) return;
    const client = await getCodexClient(codexPort);
    client.respondToApproval(requestId, decision);
    await dbUpdateSession(activeSession.id, { status: "running" });
    setSessions(
      sessions.map((session) =>
        session.id === activeSession.id ? { ...session, status: "running" } : session
      )
    );
    useAgentsStore.getState().addEvent(activeSession.id, {
      id: `${Date.now()}-${Math.random()}`,
      session_id: activeSession.id,
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
      const { events } = useTasksStore.getState();
      const existing = (events[activeTaskId] ?? []).find((e) => e.id === pendingApprovalEventId);
      if (existing) updateEvent({ ...existing, metadata });
    }
    if (pendingApproval?.request_id === requestId) {
      setPendingApproval(null);
      setPendingApprovalEventId(null);
    }
  };

  if (!activeTaskId || !task) {
    return (
      <div
        className="panel-full"
        style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "var(--font-size-sm)" }}
      >
        Select a task to start an agent
      </div>
    );
  }

  return (
    <div className="panel-full">
      <style>{`
        @keyframes thinking-pulse {
          0%, 60%, 100% { opacity: 0.2; transform: scale(0.8); }
          30% { opacity: 1; transform: scale(1); }
        }
        .thinking-dot {
          display: inline-block;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--accent);
          animation: thinking-pulse 1.4s ease-in-out infinite;
        }
        .thinking-dot:nth-child(2) { animation-delay: 0.2s; }
        .thinking-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes cursor-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .stream-cursor {
          display: inline-block;
          width: 2px;
          height: 0.9em;
          background: var(--accent);
          margin-left: 2px;
          vertical-align: text-bottom;
          animation: cursor-blink 0.9s step-end infinite;
        }
        @keyframes step-in {
          from { opacity: 0; transform: translateX(-4px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .step-bubble { animation: step-in 0.15s ease-out; }
      `}</style>

      <div className="panel-header">
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {/* Show the active or assigned agent — no dropdown */}
          {activeAgent && (
            <div
              style={{
                fontSize: "var(--font-size-xs)",
                color: "var(--text-secondary)",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-default)",
                borderRadius: 6,
                padding: "3px 9px",
                fontWeight: 500,
              }}
            >
              {activeAgent.name}
            </div>
          )}

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
      <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {sessionEvents.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "var(--font-size-sm)", padding: 24 }}>
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
        <div style={{ padding: "8px 12px", borderTop: "1px solid var(--border-default)", display: "flex", gap: 6, flexShrink: 0 }}>
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

// ─── Types ────────────────────────────────────────────────────────────────────

type DisplayEvent = {
  id: string;
  kind: "user" | "agent" | "step" | "thinking" | "system" | "error" | "approval";
  content: string;
  stepType?: "command" | "file";
  isStreaming?: boolean;
  request?: ApprovalRequest;
  approvalState?: "pending" | "approved" | "alwaysApproved" | "dismissed";
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shortenPath(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : path;
}

function formatApprovalDescription(request: ApprovalRequest): string {
  if (request.description.trim()) return request.description;
  if (request.command?.length) return "The agent wants to run a command that needs your approval.";
  if (request.file_paths?.length) return "The agent wants to make file changes that need your approval.";
  if (request.grant_root?.trim()) return `The agent wants permission to work inside ${request.grant_root}.`;
  if (request.reason?.trim()) return request.reason;
  if (request.method === "item/commandExecution/requestApproval") return "The agent wants to run a command that needs your approval.";
  if (request.method === "item/fileChange/requestApproval") return "The agent wants to make file changes that need your approval.";
  return "The agent needs your approval to continue.";
}

function getApprovalMeta(request: ApprovalRequest): { label: string; value: string }[] {
  const meta: { label: string; value: string }[] = [];
  if (request.reason?.trim()) meta.push({ label: "Reason", value: request.reason.trim() });
  if (request.grant_root?.trim()) meta.push({ label: "Scope", value: request.grant_root.trim() });
  if (!request.command?.length && !request.file_paths?.length && request.item_id?.trim()) {
    meta.push({ label: "Request", value: "The agent is waiting on approval for this action." });
  }
  return meta;
}

// ─── Build display events from raw session events ─────────────────────────────

function buildDisplayEvents(events: { id: string; type: string; payload: unknown }[]): DisplayEvent[] {
  const display: DisplayEvent[] = [];
  const approvalIndexes = new Map<string, number>();
  let turnActive = false;

  const pushOrMergeAgent = (id: string, content: string) => {
    if (!content) return;
    const last = display[display.length - 1];
    if (last?.kind === "agent") {
      last.content += content;
      return;
    }
    display.push({ id, kind: "agent", content });
  };

  for (const event of events) {
    const payload = event.payload as Record<string, unknown>;

    if (event.type === "turn.started") {
      turnActive = true;
      continue;
    }

    if (event.type === "item.agent_message" && payload.item) {
      const item = payload.item as Record<string, unknown>;
      const content = String(item.content ?? "");
      if (content) pushOrMergeAgent(event.id, content);
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

    if (event.type === "item.command_exec" && payload.item) {
      const item = payload.item as Record<string, unknown>;
      const command = (item.command as string[] | undefined)?.join(" ");
      if (command) display.push({ id: event.id, kind: "step", content: command, stepType: "command" });
      continue;
    }

    if (event.type === "item.file_change" && payload.item) {
      const item = payload.item as Record<string, unknown>;
      const path = item.path as string | undefined;
      if (path) display.push({ id: event.id, kind: "step", content: path, stepType: "file" });
      continue;
    }

    if (event.type === "turn.completed") {
      turnActive = false;
      // Clear any streaming flag on the last agent message
      const lastAgent = [...display].reverse().find((e) => e.kind === "agent");
      if (lastAgent) lastAgent.isStreaming = false;
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
            decision === "accept" ? "approved" :
            decision === "acceptForSession" ? "alwaysApproved" : "dismissed",
        };
      }
      continue;
    }

    if (event.type === "turn.failed" || event.type === "error") {
      turnActive = false;
      const msg = String(payload.message ?? "Something went wrong");
      display.push({ id: event.id, kind: "error", content: msg });
    }
  }

  // While the turn is still active, show either a streaming cursor or thinking dots
  if (turnActive) {
    const last = display[display.length - 1];
    if (last?.kind === "agent") {
      last.isStreaming = true;
    } else {
      display.push({ id: "live-thinking", kind: "thinking", content: "" });
    }
  }

  return display;
}

// ─── EventBubble ─────────────────────────────────────────────────────────────

function EventBubble({
  event,
  rootPath,
  onApprovalDecision,
}: {
  event: DisplayEvent;
  rootPath?: string | null;
  onApprovalDecision?: (requestId: string, decision: ApprovalDecision) => void;
}) {
  // Animated thinking dots
  if (event.kind === "thinking") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 4px" }}>
        <div style={{ display: "flex", gap: 4 }}>
          <span className="thinking-dot" />
          <span className="thinking-dot" />
          <span className="thinking-dot" />
        </div>
        <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>Working…</span>
      </div>
    );
  }

  // Step bubble — command or file change
  if (event.kind === "step") {
    const isCommand = event.stepType === "command";
    const Icon = isCommand ? Terminal : FileText;
    const label = isCommand ? event.content : shortenPath(event.content);
    return (
      <div
        className="step-bubble"
        title={event.content}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "5px 10px",
          borderRadius: 6,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
        }}
      >
        <Icon size={11} style={{ color: "var(--accent)", flexShrink: 0, opacity: 0.6 }} />
        <code
          style={{
            fontSize: "var(--font-size-xs)",
            color: "var(--text-secondary)",
            fontFamily: "var(--font-mono)",
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </code>
      </div>
    );
  }

  // System message (generic)
  if (event.kind === "system") {
    return (
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", padding: "4px 2px" }}>
        {event.content}
      </div>
    );
  }

  // Error
  if (event.kind === "error") {
    return (
      <div
        style={{
          padding: "10px 12px",
          borderRadius: 8,
          background: "rgba(244,135,113,0.08)",
          border: "1px solid rgba(244,135,113,0.2)",
          fontSize: "var(--font-size-sm)",
          color: "var(--text-error)",
          lineHeight: 1.5,
          wordBreak: "break-word",
        }}
      >
        {event.content}
      </div>
    );
  }

  // Approval card
  if (event.kind === "approval" && event.request && onApprovalDecision) {
    const approvalState = event.approvalState ?? "pending";
    const stateMap: Record<string, ApprovalState> = {
      pending: "pending", approved: "accepted", alwaysApproved: "alwaysApproved", dismissed: "declined",
    };
    return (
      <ApprovalCard
        description={event.content}
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

  // User message
  if (event.kind === "user") {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div
          style={{
            padding: "8px 12px",
            borderRadius: "10px 10px 2px 10px",
            background: "rgba(0,120,212,0.12)",
            border: "1px solid rgba(0,120,212,0.18)",
            fontSize: "var(--font-size-sm)",
            color: "var(--text-primary)",
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maxWidth: "85%",
          }}
        >
          {event.content}
        </div>
      </div>
    );
  }

  // Agent message (default)
  const content = event.content.trim();
  return (
    <div
      style={{
        padding: "10px 14px",
        borderRadius: 10,
        background: "var(--bg-surface)",
        border: "1px solid rgba(255,255,255,0.04)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.02)",
        fontSize: "var(--font-size-sm)",
        color: "var(--text-primary)",
        lineHeight: 1.6,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      <FormattedText text={content} rootPath={rootPath} />
      {event.isStreaming && <span className="stream-cursor" />}
    </div>
  );
}
