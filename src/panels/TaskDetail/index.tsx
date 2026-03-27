import { useEffect, useRef, useState, useCallback, memo } from "react";
import { Paperclip, Link, X, Plus, MessageSquare, GitCommit, AlertCircle, Clock, ArrowRight, RotateCcw, Trash2, Play } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useWorkspaceStore } from "../../store/workspace";
import { useTasksStore, Task, TaskEvent } from "../../store/tasks";
import { useAgentsStore } from "../../store/agents";
import { TaskRunStateBadge, getTaskRunState } from "../../components/TaskRunState";
import {
  dbGetTaskEvents, dbAddTaskEvent, dbListTasks, dbUpdateTask, dbDeleteTask,
  dbListAttachments, dbAddAttachment, dbDeleteAttachment, dbListAgents,
  dbClearTaskEvents, dbUpdateTaskEventMetadata,
} from "../../services/db";
import { navigateMode } from "../../services/layoutEvents";
import { startAgent, stopTaskSessions } from "../../services/agentRunner";
import { updateTaskStatusWithActivity } from "../../services/taskActivity";
import { FormattedText } from "../../components/FormattedText";
import { ApprovalCard, type ApprovalState } from "../../components/ApprovalCard";
import { getCodexClient } from "../../services/codex";
import type { ApprovalDecision } from "../../services/codex";

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

function mimeIsImage(mime: string) {
  return mime.startsWith("image/");
}

function guessMime(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", pdf: "application/pdf" };
  return map[ext] ?? "application/octet-stream";
}

type Ref = { label: string; url: string };

function parseRefs(json: string): Ref[] {
  try { return JSON.parse(json) ?? []; } catch { return []; }
}

interface ActlyActivityMeta {
  type: "activity" | "question" | "summary";
  text: string;
  items?: Array<{ label: string; detail?: string }>;
}

function parseActivityMeta(metadata: string | null): ActlyActivityMeta | null {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata) as Record<string, unknown>;
    if (parsed.type === "activity" || parsed.type === "question" || parsed.type === "summary") {
      return parsed as unknown as ActlyActivityMeta;
    }
    return null;
  } catch { return null; }
}

// ─── status options ───────────────────────────────────────────────────────────

const STATUS_OPTIONS = ["icebox", "planned", "in_progress", "done"] as const;
const STATUS_COLORS: Record<string, string> = {
  icebox: "var(--text-muted)",
  planned: "var(--text-muted)",
  todo: "var(--text-muted)",
  in_progress: "var(--accent)",
  done: "var(--status-done)",
  failed: "var(--text-error)",
};

const EVENT_ICONS: Record<string, React.ReactNode> = {
  state_change: <GitCommit size={13} />,
};

// ─── Section heading ──────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </div>
      {children}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TaskDetail() {
  const { activeId, activeTaskId, projectPath, codexPath, codexPort, setActiveTaskId } = useWorkspaceStore();
  const { tasks, events, attachments, setTasks, setEvents, addEvent, updateEvent, upsertTask, removeTask, setAttachments, addAttachment, removeAttachment } = useTasksStore();
  const { agents, sessions, setAgents, setSessions } = useAgentsStore();

  const task = tasks.find((t) => t.id === activeTaskId);
  const taskEvents = activeTaskId ? (events[activeTaskId] ?? []) : [];
  const taskAttachments = activeTaskId ? (attachments[activeTaskId] ?? []) : [];
  const runState = task ? getTaskRunState(task, sessions) : "idle";

  // Editable draft state
  const [titleDraft, setTitleDraft] = useState(task?.title ?? "");
  const [descDraft, setDescDraft] = useState(task?.description ?? "");
  const [editingTitle, setEditingTitle] = useState(false);
  const [comment, setComment] = useState("");
  const [pendingAssignedAgentId, setPendingAssignedAgentId] = useState<string | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [newRef, setNewRef] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const descSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);

  // Sync draft when active task changes
  useEffect(() => {
    setTitleDraft(task?.title ?? "");
    setDescDraft(task?.description ?? "");
    setEditingTitle(false);
    setPendingAssignedAgentId(null);
    setMentionQuery(null);
  }, [activeTaskId, task?.title, task?.description]);

  useEffect(() => {
    if (activeTaskId) {
      dbGetTaskEvents(activeTaskId).then((ev) => setEvents(activeTaskId, ev)).catch(console.error);
      dbListAttachments(activeTaskId).then((att) => setAttachments(activeTaskId, att)).catch(console.error);
    }
  }, [activeTaskId, setEvents, setAttachments]);

  useEffect(() => {
    if (tasks.length === 0 && projectPath) dbListTasks(projectPath).then(setTasks).catch(console.error);
  }, [tasks.length, setTasks]);

  useEffect(() => {
    dbListAgents().then(setAgents).catch(console.error);
  }, [setAgents]);

  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [taskEvents.length]);

  // ── save helpers ────────────────────────────────────────────────────────────

  const saveField = useCallback(async (updates: Partial<Pick<Task, "title" | "description" | "status" | "assigned_agent_id" | "refs_json">>) => {
    if (!task) return;
    const updated = { ...task, ...updates };
    upsertTask(updated);
    await dbUpdateTask(task.id, updates).catch(console.error);
  }, [task, upsertTask]);

  const handleTitleBlur = () => {
    setEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== task?.title) saveField({ title: trimmed });
    else setTitleDraft(task?.title ?? "");
  };

  const handleDescChange = (val: string) => {
    setDescDraft(val);
    if (descSaveTimer.current) clearTimeout(descSaveTimer.current);
    descSaveTimer.current = setTimeout(() => saveField({ description: val }), 600);
  };

  const handleStatusChange = async (status: string) => {
    if (!task) return;
    await updateTaskStatusWithActivity(task, status as Task["status"]);
  };

  const getFreshAgents = useCallback(async () => {
    const freshAgents = await dbListAgents().catch(() => agents);
    setAgents(freshAgents);
    return freshAgents;
  }, [agents, setAgents]);

  const runTaskWithAgent = useCallback(async (agent: NonNullable<typeof agents[number]>, initialMessage?: string) => {
    if (!task || !projectPath) return;
    await startAgent({
      taskId: task.id,
      agentId: agent.id,
      task,
      agent,
      projectPath,
      codexPath,
      initialMessage,
      onSessionCreated: (session) => {
        setSessions([...useAgentsStore.getState().sessions, session]);
      },
    });
  }, [codexPath, projectPath, task, setSessions]);

  const handleAgentChange = async (agentId: string) => {
    await saveField({ assigned_agent_id: agentId || null });
    setPendingAssignedAgentId(agentId || null);
  };

  // ── refs ────────────────────────────────────────────────────────────────────

  const refs = parseRefs(task?.refs_json ?? "[]");

  const addRef = () => {
    const url = newRef.trim();
    if (!url) return;
    let label = url;
    try { label = new URL(url).hostname; } catch { /* keep as-is */ }
    const next: Ref[] = [...refs, { label, url }];
    setNewRef("");
    saveField({ refs_json: JSON.stringify(next) });
  };

  const removeRef = (i: number) => {
    const next = refs.filter((_, idx) => idx !== i);
    saveField({ refs_json: JSON.stringify(next) });
  };

  // ── attachments ─────────────────────────────────────────────────────────────

  const handleAddAttachment = async () => {
    if (!activeTaskId || !activeId) return;
    const selected = await open({ directory: false, multiple: true });
    const paths = Array.isArray(selected) ? selected : selected ? [selected] : [];
    for (const path of paths) {
      const name = path.split("/").pop() ?? path;
      const mime = guessMime(path);
      const att = await dbAddAttachment(activeTaskId, activeId, name, path, mime).catch(() => null);
      if (att) addAttachment(att);
    }
  };

  const handleRemoveAttachment = async (id: string) => {
    if (!activeTaskId) return;
    await dbDeleteAttachment(id).catch(console.error);
    removeAttachment(activeTaskId, id);
  };

  // ── comment ──────────────────────────────────────────────────────────────────

  const handleComment = useCallback(async () => {
    if (!activeTaskId || !activeId || !comment.trim()) return;
    const trimmedComment = comment.trim();
    setComment("");
    setMentionQuery(null);
    const event = await dbAddTaskEvent(activeTaskId, activeId, "user_comment", trimmedComment).catch(() => null);
    if (event) addEvent(event);

    const mentionMatch = trimmedComment.match(/(^|\s)@([a-zA-Z0-9_-]+)/);
    if (mentionMatch) {
      const mention = mentionMatch[2].toLowerCase();
      const freshAgents = await getFreshAgents();
      const mentionedAgent =
        freshAgents.find((candidate) => candidate.id === `agent-${mention}`) ??
        freshAgents.find((candidate) => candidate.role.toLowerCase() === mention) ??
        freshAgents.find((candidate) => candidate.id.replace(/^agent-/, "").toLowerCase() === mention) ??
        freshAgents.find((candidate) => candidate.name.toLowerCase().includes(mention));

      if (mentionedAgent && task) {
        const prompt = trimmedComment.replace(mentionMatch[0], " ").trim();
        const instruction = prompt || "Please review and improve this task.";
        await runTaskWithAgent(
          mentionedAgent,
          `${task.title}\n\n${task.description || "No additional task notes yet."}\n\nUser request for ${mentionedAgent.name}: ${instruction}`
        );
      }
    }
  }, [activeTaskId, addEvent, comment, getFreshAgents, runTaskWithAgent, task]);

  const handleClearActivity = async () => {
    if (!activeTaskId || !task || taskEvents.length === 0) return;
    const confirmed = window.confirm(`Clear all activity for "${task.title}"?`);
    if (!confirmed) return;

    await dbClearTaskEvents(activeTaskId).catch(console.error);
    setEvents(activeTaskId, []);
  };

  const handleDeleteTask = async () => {
    if (!task) return;
    const confirmed = window.confirm(`Delete task "${task.title}"? This cannot be undone.`);
    if (!confirmed) return;

    await stopTaskSessions(task.id);
    await dbDeleteTask(task.id);
    removeTask(task.id);
    setActiveTaskId(null);
  };

  const handleRestartTask = async () => {
    if (!task || !projectPath) return;
    const currentAgents = useAgentsStore.getState().agents;
    const agent =
      currentAgents.find((a) => a.id === task.assigned_agent_id) ??
      currentAgents.find((a) => a.role === "builder") ??
      currentAgents[0];
    if (!agent) return;
    await runTaskWithAgent(agent);
  };

  const handleStartAssignedAgent = async () => {
    if (!pendingAssignedAgentId) return;
    const agent = useAgentsStore.getState().agents.find((a) => a.id === pendingAssignedAgentId) ?? null;
    if (!agent) return;
    setPendingAssignedAgentId(null);
    await runTaskWithAgent(agent);
  };

  const insertMention = (agentId: string) => {
    const agent = agents.find((candidate) => candidate.id === agentId);
    if (!agent) return;
    const token = `@${agent.role}`;
    const next = comment.replace(/(^|\s)@([a-zA-Z0-9_-]*)$/, `$1${token} `);
    setComment(next);
    setMentionQuery(null);
    window.setTimeout(() => commentInputRef.current?.focus(), 0);
  };

  const mentionMatches = mentionQuery
    ? agents.filter((agent) => {
        const query = mentionQuery.toLowerCase();
        return (
          agent.role.toLowerCase().includes(query) ||
          agent.name.toLowerCase().includes(query) ||
          agent.id.toLowerCase().includes(query)
        );
      })
    : [];

  // ── empty state ──────────────────────────────────────────────────────────────

  if (!activeTaskId || !task) {
    return (
      <div className="panel-full" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "var(--font-size-sm)" }}>
        Select a task to view details
      </div>
    );
  }

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <div className="panel-full" style={{ overflowY: "auto" }}>

      {/* ── Sticky header ── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 10,
        background: "var(--bg-base)",
        borderBottom: "1px solid var(--border-default)",
        padding: "16px 20px 12px",
      }}>
        {/* Title row */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {editingTitle ? (
              <input
                ref={titleInputRef}
                className="input"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={handleTitleBlur}
                onKeyDown={(e) => { if (e.key === "Enter") titleInputRef.current?.blur(); if (e.key === "Escape") { setTitleDraft(task.title); setEditingTitle(false); } }}
                style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, width: "100%", padding: "2px 6px" }}
                autoFocus
              />
            ) : (
              <h2
                onClick={() => setEditingTitle(true)}
                title="Click to edit"
                style={{ margin: 0, fontSize: "var(--font-size-lg)", fontWeight: 600, color: "var(--text-primary)", cursor: "text", lineHeight: 1.3 }}
              >
                {task.title}
              </h2>
            )}
          </div>
          {/* Delete — icon only, right-aligned */}
          <button
            className="btn btn-ghost"
            onClick={handleDeleteTask}
            title="Delete task"
            style={{ padding: "4px 6px", color: "var(--text-error)", flexShrink: 0 }}
          >
            <Trash2 size={14} />
          </button>
        </div>

        {/* Action row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <TaskRunStateBadge state={runState} />
          {task.status === "failed" && (
            <button className="btn btn-ghost" onClick={handleRestartTask} style={{ padding: "2px 8px", fontSize: "var(--font-size-xs)" }}>
              <RotateCcw size={12} />
              Restart Task
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => navigateMode("develop", task.id)} style={{ padding: "2px 8px", fontSize: "var(--font-size-xs)" }}>
            <ArrowRight size={12} />
            Open In Develop
          </button>
        </div>
      </div>

      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 24 }}>

        {/* ── Meta row ── */}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>Status</span>
            <select
              value={task.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)", borderRadius: 4, color: STATUS_COLORS[task.status], fontSize: "var(--font-size-sm)", padding: "4px 8px", cursor: "pointer" }}
            >
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>Assigned agent</span>
            <select
              value={task.assigned_agent_id ?? ""}
              onChange={(e) => handleAgentChange(e.target.value)}
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)", borderRadius: 4, color: "var(--text-primary)", fontSize: "var(--font-size-sm)", padding: "4px 8px", cursor: "pointer" }}
            >
              <option value="">Unassigned</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            {pendingAssignedAgentId && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 6,
                  padding: "8px 10px",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-default)",
                  borderRadius: 8,
                }}
              >
                <span style={{ flex: 1, fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                  Start this task with {agents.find((agent) => agent.id === pendingAssignedAgentId)?.name ?? "the assigned agent"} now?
                </span>
                <button className="btn btn-primary" onClick={handleStartAssignedAgent} style={{ padding: "2px 8px", fontSize: "var(--font-size-xs)" }}>
                  <Play size={12} />
                  Start now
                </button>
                <button className="btn btn-ghost" onClick={() => setPendingAssignedAgentId(null)} style={{ padding: "2px 8px", fontSize: "var(--font-size-xs)" }}>
                  Later
                </button>
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, color: "var(--text-muted)", fontSize: "var(--font-size-xs)", justifyContent: "flex-end" }}>
            Created {formatDate(task.created_at)}
          </div>
        </div>

        {/* ── Notes ── */}
        <Section label="Notes">
          <textarea
            className="input"
            placeholder="Type a description or add notes here…"
            value={descDraft}
            onChange={(e) => handleDescChange(e.target.value)}
            style={{ resize: "vertical", minHeight: 100, lineHeight: 1.6, fontFamily: "var(--font-sans)", fontSize: "var(--font-size-sm)" }}
          />
        </Section>

        {/* ── References ── */}
        <Section label="References">
          {refs.map((ref, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 4, padding: "6px 10px" }}>
              <Link size={13} style={{ color: "var(--accent)", flexShrink: 0 }} />
              <a href={ref.url} target="_blank" rel="noreferrer" style={{ flex: 1, color: "var(--text-link)", fontSize: "var(--font-size-sm)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: "none" }} title={ref.url}>
                {ref.label}
              </a>
              <button onClick={() => removeRef(i)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 2, display: "flex" }}>
                <X size={13} />
              </button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 6 }}>
            <input
              className="input"
              placeholder="Paste a URL…"
              value={newRef}
              onChange={(e) => setNewRef(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addRef(); }}
              style={{ flex: 1 }}
            />
            <button className="btn btn-ghost" onClick={addRef} style={{ flexShrink: 0 }}>
              <Plus size={13} /> Add
            </button>
          </div>
        </Section>

        {/* ── Attachments ── */}
        <Section label="Attachments">
          {taskAttachments.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {taskAttachments.map((att) => (
                <div key={att.id} style={{ position: "relative", background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 4, overflow: "hidden", maxWidth: 120 }}>
                  {mimeIsImage(att.mime) ? (
                    <img src={`asset://localhost/${att.path}`} alt={att.name} style={{ width: 120, height: 80, objectFit: "cover", display: "block" }} />
                  ) : (
                    <div style={{ width: 120, height: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Paperclip size={24} style={{ color: "var(--text-muted)" }} />
                    </div>
                  )}
                  <div style={{ padding: "4px 6px", fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={att.name}>
                    {att.name}
                  </div>
                  <button
                    onClick={() => handleRemoveAttachment(att.id)}
                    style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff", padding: 0 }}
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button className="btn btn-ghost" onClick={handleAddAttachment} style={{ alignSelf: "flex-start" }}>
            <Paperclip size={13} /> Add attachment
          </button>
        </Section>

        {/* ── Activity ── */}
        <Section label="Activity">
          {taskEvents.length === 0 ? (
            <div style={{ color: "var(--text-muted)", fontSize: "var(--font-size-sm)", padding: "8px 0" }}>No activity yet</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {taskEvents.map((event) => (
                <TimelineEvent
                  key={event.id}
                  event={event}
                  rootPath={projectPath}
                  codexPort={codexPort}
                  sessions={sessions}
                  activeTaskId={activeTaskId}
                  onEventUpdated={updateEvent}
                />
              ))}
              <div ref={eventsEndRef} />
            </div>
          )}

          {/* Comment input */}
          <div style={{ display: "flex", gap: 6, marginTop: 8, paddingBottom: 12 }}>
            <div style={{ position: "relative", flex: 1 }}>
              <input
                ref={commentInputRef}
                className="input"
                placeholder="Add a comment or mention an agent with @planner…"
                value={comment}
                onChange={(e) => {
                  const next = e.target.value;
                  setComment(next);
                  const match = next.match(/(^|\s)@([a-zA-Z0-9_-]*)$/);
                  setMentionQuery(match ? match[2] : null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (mentionQuery && mentionMatches.length > 0) {
                      insertMention(mentionMatches[0].id);
                      return;
                    }
                    handleComment();
                  }
                  if (e.key === "Escape") {
                    setMentionQuery(null);
                  }
                }}
                style={{ flex: 1 }}
              />
              {mentionQuery !== null && mentionMatches.length > 0 && (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: "calc(100% + 6px)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    padding: 6,
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-default)",
                    borderRadius: 8,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.24)",
                    zIndex: 20,
                  }}
                >
                  {mentionMatches.slice(0, 5).map((agent) => (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => insertMention(agent.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        padding: "8px 10px",
                        borderRadius: 6,
                        background: "transparent",
                        border: "none",
                        color: "var(--text-primary)",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span style={{ fontSize: "var(--font-size-sm)" }}>{agent.name}</span>
                      <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        @{agent.role}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="btn btn-primary" onClick={handleComment} disabled={!comment.trim()}>Post</button>
          </div>
        </Section>

      </div>
    </div>
  );
}

// Wrap TimelineEvent in React.memo to prevent unnecessary re-renders of expensive historical events
// Expected impact: Reduces CPU overhead and re-renders when task state changes or user interacts with the thread
const TimelineEvent = memo(function TimelineEvent({
  event,
  rootPath,
  codexPort,
  sessions,
  activeTaskId,
  onEventUpdated,
}: {
  event: TaskEvent;
  rootPath?: string | null;
  codexPort: number | null;
  sessions: import("../../store/agents").Session[];
  activeTaskId: string | null;
  onEventUpdated: (updated: TaskEvent) => void;
}) {
  // ── Status divider ────────────────────────────────────────────────────────
  if (event.type === "state_change" && event.content.startsWith("Moved to ")) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0" }}>
        <div style={{ flex: 1, height: 1, background: "var(--border-default)", opacity: 0.5 }} />
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {event.content}
        </div>
        <div style={{ flex: 1, height: 1, background: "var(--border-default)", opacity: 0.5 }} />
      </div>
    );
  }

  // ── Approval card ─────────────────────────────────────────────────────────
  if (event.type === "approval") {
    let meta: { request_id: string; status: string; decision?: string } = { request_id: "", status: "pending" };
    try { meta = JSON.parse(event.metadata ?? "{}"); } catch { /* use default */ }
    const stateMap: Record<string, ApprovalState> = {
      pending: "pending", accepted: "accepted", alwaysApproved: "alwaysApproved", declined: "declined",
    };
    const state: ApprovalState = stateMap[meta.status] ?? "pending";

    const handleDecision = async (requestId: string, decision: ApprovalDecision) => {
      if (!codexPort) return;
      try {
        const client = await getCodexClient(codexPort);
        client.respondToApproval(requestId, decision);
        // Resume active session
        const { dbUpdateSession } = await import("../../services/db");
        const activeSession = sessions.filter((s) => s.task_id === activeTaskId).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
        if (activeSession) await dbUpdateSession(activeSession.id, { status: "running" }).catch(() => {});
      } catch (e) {
        console.error("Failed to respond to approval:", e);
      }
      const resolved: ApprovalState =
        decision === "accept" ? "accepted" :
        decision === "acceptForSession" ? "alwaysApproved" : "declined";
      const newMeta = JSON.stringify({ ...meta, status: resolved, decision });
      await dbUpdateTaskEventMetadata(event.id, newMeta).catch(() => {});
      onEventUpdated({ ...event, metadata: newMeta });
    };

    return (
      <div style={{ padding: "6px 0" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-secondary)", textTransform: "capitalize" }}>{event.actor}</span>
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
            {new Date(event.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <ApprovalCard
          description={event.content.replace(/^Approval requested:\s*/i, "")}
          state={state}
          requestId={meta.request_id}
          rootPath={rootPath}
          onDecision={handleDecision}
        />
      </div>
    );
  }

  // ── Agent message bubble ──────────────────────────────────────────────────
  if (event.type === "agent_message") {
    const activityMeta = parseActivityMeta(event.metadata);
    return (
      <div style={{ padding: "6px 0" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--accent)", textTransform: "capitalize" }}>{event.actor}</span>
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
            {new Date(event.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
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
          <FormattedText text={event.content} rootPath={rootPath} />
          {activityMeta?.items && activityMeta.items.length > 0 && (
            <ul style={{ margin: "8px 0 0 0", padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: 3 }}>
              {activityMeta.items.map((item, i) => (
                <li key={i} style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                  <span style={{ fontWeight: 600 }}>{item.label}</span>
                  {item.detail && <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>{item.detail}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // ── Agent question ────────────────────────────────────────────────────────
  if (event.type === "agent_question") {
    return (
      <div style={{ padding: "6px 0" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
          <AlertCircle size={12} style={{ color: "var(--text-warning)", marginBottom: -1 }} />
          <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-warning)", textTransform: "capitalize" }}>{event.actor}</span>
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
            {new Date(event.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            background: "rgba(204,167,0,0.06)",
            border: "1px solid rgba(204,167,0,0.25)",
            fontSize: "var(--font-size-sm)",
            color: "var(--text-primary)",
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          <FormattedText text={event.content} rootPath={rootPath} />
        </div>
      </div>
    );
  }

  // ── User comment ──────────────────────────────────────────────────────────
  if (event.type === "user_comment") {
    return (
      <div style={{ padding: "6px 0", display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
            {new Date(event.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </span>
          <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-secondary)" }}>You</span>
        </div>
        <div
          style={{
            padding: "8px 12px",
            borderRadius: "10px 10px 2px 10px",
            background: "rgba(0,120,212,0.12)",
            border: "1px solid rgba(0,120,212,0.2)",
            fontSize: "var(--font-size-sm)",
            color: "var(--text-primary)",
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maxWidth: "90%",
          }}
        >
          {event.content}
        </div>
      </div>
    );
  }

  // ── Generic fallback (step / approval legacy / etc.) ─────────────────────
  const icon = EVENT_ICONS[event.type] ?? <Clock size={13} />;
  return (
    <div style={{ display: "flex", gap: 8, padding: "5px 0", alignItems: "flex-start" }}>
      <div style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "var(--text-muted)", marginTop: 2 }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 1 }}>
          <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-muted)", textTransform: "capitalize" }}>{event.actor}</span>
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
            {new Date(event.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", lineHeight: 1.5, wordBreak: "break-word" }}>
          {event.content}
        </div>
      </div>
    </div>
  );
});
