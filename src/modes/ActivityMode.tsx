import { useEffect } from "react";
import { Bell, CheckCircle, MessageSquare, GitPullRequest, XCircle } from "lucide-react";
import { useNotificationsStore, type AppNotification } from "../store/notifications";
import { useWorkspaceStore } from "../store/workspace";
import { navigateMode } from "../services/layoutEvents";
import { getCodexClient } from "../services/codex";

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
    try {
      const client = await getCodexClient(codexPort);
      client.respondToApproval(n.requestId, approved ? "accept" : "decline");
    } catch (e) {
      console.error("Failed to respond to approval:", e);
    }
  };

  return (
    <div
      style={{
        padding: "12px 16px",
        borderBottom: "1px solid var(--border-default)",
        background: n.read ? "transparent" : "rgba(0,120,212,0.04)",
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
  const { notifications, markAllRead } = useNotificationsStore();

  useEffect(() => {
    markAllRead();
  }, [markAllRead]);

  return (
    <div className="panel-full">
      <div
        style={{
          padding: "10px 16px",
          borderBottom: "1px solid var(--border-default)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: "var(--font-size-sm)",
            fontWeight: 600,
            color: "var(--text-secondary)",
          }}
        >
          Activity
        </span>
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>
        {notifications.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 12,
              color: "var(--text-muted)",
              fontSize: "var(--font-size-sm)",
              textAlign: "center",
              padding: 32,
            }}
          >
            <Bell size={32} style={{ opacity: 0.3 }} />
            <div>No notifications yet.</div>
            <div style={{ fontSize: "var(--font-size-xs)" }}>
              Assign an agent to a task to get started.
            </div>
          </div>
        ) : (
          notifications.map((n) => <NotificationCard key={n.id} n={n} />)
        )}
      </div>
    </div>
  );
}
