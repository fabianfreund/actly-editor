import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Bell,
  CheckCircle,
  MessageSquare,
  GitPullRequest,
  XCircle,
  FolderOpen,
  FileText,
  LoaderCircle,
  Plus,
  X,
} from "lucide-react";
import { useNotificationsStore, type AppNotification } from "../store/notifications";
import { useWorkspaceStore } from "../store/workspace";
import { useTasksStore } from "../store/tasks";
import { useAgentsStore } from "../store/agents";
import { navigateMode } from "../services/layoutEvents";
import { getCodexClient } from "../services/codex";
import { dbUpdateTaskEventMetadata, dbUpdateSession } from "../services/db";
import { gitCommands } from "../services/tauri";
import {
  getRelativeProjectPath,
  isPathInsideProject,
  listImportantFiles,
  type ImportantFile,
} from "../services/projectFiles";
import { useFilePreviewStore } from "../store/filePreview";

function customFilesKey(projectPath: string) {
  return `actly:custom-files:${projectPath}`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function kindIcon(kind: AppNotification["kind"]) {
  switch (kind) {
    case "agent_message": return <MessageSquare size={14} />;
    case "turn_completed": return <CheckCircle size={14} style={{ color: "var(--text-success)" }} />;
    case "approval_request": return <GitPullRequest size={14} style={{ color: "var(--text-warning)" }} />;
    case "task_state_change": return <Bell size={14} />;
    default: return <Bell size={14} />;
  }
}

function NotificationCard({ n }: { n: AppNotification }) {
  const { codexPort } = useWorkspaceStore();

  const handleTaskClick = () => {
    navigateMode("develop", n.taskId);
  };

  const handleApprove = async (approved: boolean) => {
    if (!codexPort || !n.requestId) return;
    const decision = approved ? "accept" : "decline";
    try {
      const client = await getCodexClient(codexPort);
      client.respondToApproval(n.requestId, decision);
    } catch (e) {
      console.error("Failed to respond to approval:", e);
      return;
    }
    // Update the matching task event in DB + store
    const { events, updateEvent } = useTasksStore.getState();
    const taskEvents = events[n.taskId] ?? [];
    const approvalEvent = taskEvents.find((e) => {
      if (e.type !== "approval") return false;
      try { return JSON.parse(e.metadata ?? "{}").request_id === n.requestId; } catch { return false; }
    });
    if (approvalEvent) {
      const resolved = approved ? "accepted" : "declined";
      const newMeta = JSON.stringify({ request_id: n.requestId, status: resolved, decision });
      await dbUpdateTaskEventMetadata(approvalEvent.id, newMeta).catch(() => {});
      updateEvent({ ...approvalEvent, metadata: newMeta });
    }
    // Resume the active session for this task
    const { sessions, setSessions } = useAgentsStore.getState();
    const activeSession = sessions
      .filter((s) => s.task_id === n.taskId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (activeSession) {
      await dbUpdateSession(activeSession.id, { status: "running" }).catch(() => {});
      setSessions(sessions.map((s) => s.id === activeSession.id ? { ...s, status: "running" } : s));
    }
  };

  return (
    <div
      style={{
        padding: "12px 16px",
        borderBottom: "1px solid var(--border-default)",
        background: "transparent",
        opacity: n.read ? 0.45 : 1,
        transition: "opacity 0.2s",
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
      }}
    >
      <div
        style={{
          color: n.kind === "turn_completed"
            ? "var(--text-success)"
            : n.kind === "approval_request"
            ? "var(--text-warning)"
            : "var(--text-secondary)",
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        {kindIcon(n.kind)}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
          <button
            onClick={handleTaskClick}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-link)",
              fontSize: "var(--font-size-sm)",
              fontWeight: 500,
              cursor: "pointer",
              padding: 0,
              textAlign: "left",
              textDecoration: "underline",
              textDecorationColor: "transparent",
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.textDecorationColor = "var(--text-link)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.textDecorationColor = "transparent")
            }
          >
            {n.taskTitle}
          </button>
          {n.agentName && (
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
              · {n.agentName}
            </span>
          )}
          <span
            style={{
              marginLeft: "auto",
              fontSize: "var(--font-size-xs)",
              color: "var(--text-muted)",
              flexShrink: 0,
            }}
          >
            {relativeTime(n.createdAt)}
          </span>
        </div>

        <div
          style={{
            fontSize: "var(--font-size-sm)",
            color: "var(--text-secondary)",
            wordBreak: "break-word",
          }}
        >
          {n.content}
        </div>

        {n.kind === "approval_request" && (
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button
              className="btn btn-primary"
              onClick={() => handleApprove(true)}
              style={{ padding: "2px 10px", fontSize: "var(--font-size-xs)" }}
            >
              <CheckCircle size={12} />
              Approve
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => handleApprove(false)}
              style={{
                padding: "2px 10px",
                fontSize: "var(--font-size-xs)",
                color: "var(--text-error)",
              }}
            >
              <XCircle size={12} />
              Deny
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ActivityMode() {
  const { notifications, markAllRead, dismissAll } = useNotificationsStore();
  const { projectPath, activeId, workspaces } = useWorkspaceStore();
  const { tasks } = useTasksStore();
  const { sessions } = useAgentsStore();
  const { openFile } = useFilePreviewStore();
  const [importantFiles, setImportantFiles] = useState<ImportantFile[]>([]);
  const [customFiles, setCustomFiles] = useState<string[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [currentBranch, setCurrentBranch] = useState<string>("—");

  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeId) ?? null;

  useEffect(() => {
    markAllRead();
  }, [markAllRead]);

  useEffect(() => {
    if (!projectPath) {
      setCustomFiles([]);
      return;
    }

    try {
      const saved = localStorage.getItem(customFilesKey(projectPath));
      setCustomFiles(saved ? (JSON.parse(saved) as string[]) : []);
    } catch {
      setCustomFiles([]);
    }
  }, [projectPath]);

  useEffect(() => {
    let cancelled = false;

    if (!projectPath) {
      setCurrentBranch("—");
      return;
    }

    gitCommands.branches(projectPath)
      .then((branches) => {
        if (cancelled) return;
        const current = branches.find((branch) => branch.is_current);
        setCurrentBranch(current?.name ?? "Detached");
      })
      .catch(() => {
        if (!cancelled) setCurrentBranch("—");
      });

    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  useEffect(() => {
    let cancelled = false;

    if (!projectPath) {
      setImportantFiles([]);
      return;
    }

    setFilesLoading(true);
    listImportantFiles(projectPath)
      .then((files) => {
        if (!cancelled) setImportantFiles(files);
      })
      .catch(() => {
        if (!cancelled) setImportantFiles([]);
      })
      .finally(() => {
        if (!cancelled) setFilesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  const persistCustomFiles = (next: string[]) => {
    setCustomFiles(next);
    if (!projectPath) return;
    try {
      localStorage.setItem(customFilesKey(projectPath), JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const handleAddCustomFile = async () => {
    if (!projectPath) return;
    const selected = await open({ directory: false, multiple: false, defaultPath: projectPath });
    if (!selected || Array.isArray(selected)) return;
    if (!isPathInsideProject(selected, projectPath)) {
      window.alert("Please choose a file inside the current workspace.");
      return;
    }

    if (importantFiles.some((file) => file.path === selected) || customFiles.includes(selected)) {
      return;
    }

    persistCustomFiles([...customFiles, selected]);
  };

  const handleRemoveCustomFile = (path: string) => {
    persistCustomFiles(customFiles.filter((file) => file !== path));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
        <section
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            borderRight: "1px solid var(--border-default)",
          }}
        >
          <div className="panel-header" style={{ justifyContent: "space-between", padding: "10px 12px" }}>
            <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Activity</span>
            {notifications.length > 0 && (
              <button className="btn btn-ghost" onClick={dismissAll} style={{ padding: "2px 8px", fontSize: "var(--font-size-xs)" }}>
                Clear
              </button>
            )}
          </div>

          <div style={{ flex: 1, overflow: "auto" }}>
            {notifications.length === 0 ? (
              <div className="dashboard-empty">
                <Bell size={28} style={{ opacity: 0.35 }} />
                <div>No notifications yet.</div>
                <div style={{ fontSize: "var(--font-size-xs)" }}>Assign an agent to a task to get started.</div>
              </div>
            ) : (
              notifications.map((n) => <NotificationCard key={n.id} n={n} />)
            )}
          </div>
        </section>

        <section
          style={{
            width: 360,
            maxWidth: "42%",
            minWidth: 280,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div className="panel-header" style={{ justifyContent: "space-between", padding: "10px 12px" }}>
            <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Main files</span>
            <button className="btn btn-ghost" onClick={() => void handleAddCustomFile()} style={{ padding: "2px 8px", fontSize: "var(--font-size-xs)" }}>
              <Plus size={12} />
              Add file
            </button>
          </div>

          <div className="important-files-list" style={{ padding: 8 }}>
            {filesLoading ? (
              <div className="dashboard-empty">
                <LoaderCircle size={18} className="spin-icon" />
                <div>Loading files…</div>
              </div>
            ) : importantFiles.length === 0 && customFiles.length === 0 ? (
              <div className="dashboard-empty">
                <FolderOpen size={28} style={{ opacity: 0.35 }} />
                <div>No important files found.</div>
              </div>
            ) : (
              <>
                {importantFiles.map((file) => (
                  <button
                    key={file.path}
                    className="important-file-card"
                    onClick={() => void openFile(file.path, file.label)}
                  >
                    <div className="important-file-icon">
                      <FileText size={16} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="important-file-title">{file.label}</div>
                      <div className="important-file-path">
                        {projectPath ? getRelativeProjectPath(file.path, projectPath) : file.path}
                      </div>
                    </div>
                  </button>
                ))}
                {customFiles.length > 0 && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border-default)" }}>
                    <div style={{ padding: "0 4px 8px", fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                      Pinned
                    </div>
                    {customFiles.map((path) => (
                      <div key={path} className="important-file-card" style={{ alignItems: "center" }}>
                        <button
                          onClick={() => void openFile(path)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            minWidth: 0,
                            flex: 1,
                            background: "transparent",
                            border: "none",
                            color: "inherit",
                            padding: 0,
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                        >
                          <div className="important-file-icon">
                            <FileText size={16} />
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div className="important-file-title">
                              {projectPath ? getRelativeProjectPath(path, projectPath).split("/").pop() ?? path : path}
                            </div>
                            <div className="important-file-path">
                              {projectPath ? getRelativeProjectPath(path, projectPath) : path}
                            </div>
                          </div>
                        </button>
                        <button
                          className="btn btn-ghost"
                          onClick={() => handleRemoveCustomFile(path)}
                          style={{ padding: "2px 6px", marginLeft: 8 }}
                          title="Remove pinned file"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </div>

      <div className="dashboard-footer">
        <FooterItem label="Repo" value={activeWorkspace?.label ?? "—"} />
        <FooterItem label="Path" value={projectPath ?? "—"} monospace />
        <FooterItem label="Branch" value={currentBranch} monospace />
        <FooterItem label="Main files" value={String(importantFiles.length + customFiles.length)} />
        <FooterItem label="Tasks" value={String(tasks.length)} />
        <FooterItem label="Sessions" value={String(sessions.length)} />
        <FooterItem label="Notifications" value={String(notifications.length)} />
      </div>
    </div>
  );
}

function FooterItem({ label, value, monospace }: { label: string; value: string; monospace?: boolean }) {
  return (
    <div className="dashboard-footer-item">
      <span className="dashboard-footer-label">{label}</span>
      <span className="dashboard-footer-value" style={{ fontFamily: monospace ? "var(--font-mono)" : undefined }}>
        {value}
      </span>
    </div>
  );
}
