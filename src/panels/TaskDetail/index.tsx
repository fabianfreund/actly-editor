import { useEffect, useRef, useState, useCallback } from "react";
import { Paperclip, Link, X, Plus, MessageSquare, GitCommit, AlertCircle, CheckCircle, Clock, ArrowRight, RotateCcw, Trash2, Play } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useWorkspaceStore } from "../../store/workspace";
import { useTasksStore, Task, TaskEvent } from "../../store/tasks";
import { useAgentsStore } from "../../store/agents";
import { TaskRunStateBadge, getTaskRunState } from "../../components/TaskRunState";
import {
  dbGetTaskEvents, dbAddTaskEvent, dbListTasks, dbUpdateTask, dbDeleteTask,
  dbListAttachments, dbAddAttachment, dbDeleteAttachment, dbListAgents,
  dbClearTaskEvents,
} from "../../services/db";
import { navigateMode } from "../../services/layoutEvents";
import { startAgent, stopTaskSessions } from "../../services/agentRunner";
import { updateTaskStatusWithActivity } from "../../services/taskActivity";
import { FormattedText } from "../../components/FormattedText";

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

// ─── status options ───────────────────────────────────────────────────────────

const STATUS_OPTIONS = ["icebox", "improving", "planned", "in_progress", "done", "blocked"] as const;
const STATUS_COLORS: Record<string, string> = {
  icebox: "var(--text-muted)",
  improving: "var(--text-warning)",
  planned: "var(--text-muted)",
  todo: "var(--text-muted)",
  in_progress: "var(--accent)",
  done: "var(--status-done)",
  blocked: "var(--status-blocked)",
  failed: "var(--text-error)",
};

const EVENT_ICONS: Record<string, React.ReactNode> = {
  state_change: <GitCommit size={13} />,
  agent_message: <MessageSquare size={13} style={{ color: "var(--accent)" }} />,
  user_comment: <MessageSquare size={13} />,
  agent_question: <AlertCircle size={13} style={{ color: "var(--text-warning)" }} />,
  approval: <CheckCircle size={13} style={{ color: "var(--status-done)" }} />,
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
  const { activeTaskId, projectPath, codexPath, setActiveTaskId } = useWorkspaceStore();
  const { tasks, events, attachments, setTasks, setEvents, addEvent, upsertTask, removeTask, setAttachments, addAttachment, removeAttachment } = useTasksStore();
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

  const getFreshAgentById = useCallback(async (agentId: string) => {
    const freshAgents = await getFreshAgents();
    return freshAgents.find((candidate) => candidate.id === agentId)
      ?? agents.find((candidate) => candidate.id === agentId)
      ?? null;
  }, [agents, getFreshAgents]);

  const runTaskWithAgent = useCallback(async (agent: NonNullable<typeof agents[number]>, initialMessage?: string) => {
    if (!task || !projectPath) return;
    const freshAgent = await getFreshAgentById(agent.id);
    if (!freshAgent) return;
    await startAgent({
      taskId: task.id,
      agentId: freshAgent.id,
      task,
      agent: freshAgent,
      projectPath,
      codexPath,
      initialMessage,
      onSessionCreated: (session) => {
        setSessions([...useAgentsStore.getState().sessions, session]);
      },
    });
  }, [codexPath, projectPath, task, setSessions, getFreshAgentById]);

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
    if (!activeTaskId) return;
    const selected = await open({ directory: false, multiple: true });
    const paths = Array.isArray(selected) ? selected : selected ? [selected] : [];
    for (const path of paths) {
      const name = path.split("/").pop() ?? path;
      const mime = guessMime(path);
      const att = await dbAddAttachment(activeTaskId, name, path, mime).catch(() => null);
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
    if (!activeTaskId || !comment.trim()) return;
    const trimmedComment = comment.trim();
    setComment("");
    setMentionQuery(null);
    const event = await dbAddTaskEvent(activeTaskId, "user_comment", trimmedComment).catch(() => null);
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

    const freshAgents = await getFreshAgents();
    const agent =
      freshAgents.find((candidate) => candidate.id === task.assigned_agent_id) ??
      freshAgents.find((candidate) => candidate.role === "builder") ??
      freshAgents[0];

    if (!agent) return;

    await runTaskWithAgent(agent);
  };

  const handleStartAssignedAgent = async () => {
    if (!pendingAssignedAgentId) return;
    const agent = await getFreshAgentById(pendingAssignedAgentId);
    if (!agent) return;
    await runTaskWithAgent(agent);
    setPendingAssignedAgentId(null);
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
      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 24, minHeight: "100%" }}>

        {/* ── Title ── */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {editingTitle ? (
              <input
                ref={titleInputRef}
                className="input"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={handleTitleBlur}
                onKeyDown={(e) => { if (e.key === "Enter") titleInputRef.current?.blur(); if (e.key === "Escape") { setTitleDraft(task.title); setEditingTitle(false); } }}
                style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, flex: 1, padding: "2px 6px" }}
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
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <TaskRunStateBadge state={runState} />
              {task.status === "failed" && (
                <button
                  className="btn btn-ghost"
                  onClick={handleRestartTask}
                  style={{ padding: "2px 8px", fontSize: "var(--font-size-xs)" }}
                >
                  <RotateCcw size={12} />
                  Restart Task
                </button>
              )}
              <button
                className="btn btn-ghost"
                onClick={() => navigateMode("develop", task.id)}
                style={{ padding: "2px 8px", fontSize: "var(--font-size-xs)" }}
              >
                <ArrowRight size={12} />
                Open In Develop
              </button>
              <button
                className="btn btn-ghost"
                onClick={handleDeleteTask}
                style={{ padding: "2px 8px", fontSize: "var(--font-size-xs)", color: "var(--text-error)" }}
              >
                <Trash2 size={12} />
                Delete Task
              </button>
            </div>
          </div>
        </div>

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
            rows={5}
            style={{ resize: "vertical", lineHeight: 1.6, fontFamily: "var(--font-sans)", fontSize: "var(--font-size-sm)" }}
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
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: -4 }}>
            <button
              className="btn btn-ghost"
              onClick={handleClearActivity}
              disabled={taskEvents.length === 0}
              style={{ padding: "2px 8px", fontSize: "var(--font-size-xs)" }}
            >
              Clear
            </button>
          </div>
          {taskEvents.length === 0 ? (
            <div style={{ color: "var(--text-muted)", fontSize: "var(--font-size-sm)", padding: "8px 0" }}>No activity yet</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {taskEvents.map((event) => <TimelineEvent key={event.id} event={event} rootPath={projectPath} />)}
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

function TimelineEvent({ event, rootPath }: { event: TaskEvent; rootPath?: string | null }) {
  if (event.type === "state_change" && event.content.startsWith("Moved to ")) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0" }}>
        <div style={{ flex: 1, height: 1, background: "var(--border-default)", opacity: 0.7 }} />
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {event.content}
        </div>
        <div style={{ flex: 1, height: 1, background: "var(--border-default)", opacity: 0.7 }} />
      </div>
    );
  }

  const icon = EVENT_ICONS[event.type] ?? <Clock size={13} />;
  return (
    <div style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border-default)" }}>
      <div style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "var(--text-secondary)", marginTop: 2 }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-secondary)", textTransform: "capitalize" }}>{event.actor}</span>
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
            {new Date(event.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <p style={{ margin: 0, fontSize: "var(--font-size-sm)", color: "var(--text-primary)", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          <FormattedText text={event.content} rootPath={rootPath} />
        </p>
      </div>
    </div>
  );
}
