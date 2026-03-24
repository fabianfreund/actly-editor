/**
 * Shared approval request card.
 * Used in both the AgentThread live stream and the TaskDetail timeline.
 * Shows action buttons when pending; compacts to a small badge when resolved.
 */
import { CheckCircle, XCircle, ShieldAlert } from "lucide-react";
import type { ApprovalDecision } from "../services/codex";
import { FormattedText } from "./FormattedText";

export type ApprovalState = "pending" | "accepted" | "alwaysApproved" | "declined";

interface Props {
  description: string;
  command?: string[];
  file_paths?: string[];
  meta?: { label: string; value: string }[];
  state: ApprovalState;
  requestId: string;
  rootPath?: string | null;
  onDecision?: (requestId: string, decision: ApprovalDecision) => void;
}

export function ApprovalCard({ description, command, file_paths, meta, state, requestId, rootPath, onDecision }: Props) {
  const isResolved = state !== "pending";

  // ── Compact resolved state ────────────────────────────────────────────────
  if (isResolved) {
    const accepted = state === "accepted" || state === "alwaysApproved";
    const label =
      state === "accepted" ? "Approved" :
      state === "alwaysApproved" ? "Always Approved" :
      "Denied";

    return (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          borderRadius: 999,
          border: `1px solid ${accepted ? "rgba(137,209,133,0.3)" : "rgba(244,135,113,0.3)"}`,
          background: accepted ? "rgba(137,209,133,0.08)" : "rgba(244,135,113,0.08)",
          fontSize: "var(--font-size-xs)",
          color: accepted ? "var(--text-success)" : "var(--text-error)",
        }}
      >
        {accepted
          ? <CheckCircle size={11} />
          : <XCircle size={11} />}
        {label}
        {description && (
          <span style={{ color: "var(--text-muted)", marginLeft: 2 }}>
            — {description.length > 48 ? description.slice(0, 48) + "…" : description}
          </span>
        )}
      </div>
    );
  }

  // ── Pending state — full card ─────────────────────────────────────────────
  return (
    <div
      style={{
        borderRadius: 10,
        background: "linear-gradient(180deg, rgba(204,167,0,0.08), rgba(204,167,0,0.04))",
        border: "1px solid rgba(204,167,0,0.3)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        overflow: "hidden",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px 0",
          fontSize: "var(--font-size-xs)",
          fontWeight: 700,
          color: "var(--text-warning)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        <ShieldAlert size={13} />
        Approval Required
      </div>

      {/* Description */}
      <div
        style={{
          padding: "0 14px",
          fontSize: "var(--font-size-sm)",
          color: "var(--text-primary)",
          lineHeight: 1.55,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        <FormattedText text={description} rootPath={rootPath} />
      </div>

      {/* Command */}
      {command && command.length > 0 && (
        <code
          style={{
            display: "block",
            margin: "0 14px",
            background: "var(--bg-base)",
            padding: "8px 12px",
            borderRadius: 6,
            fontSize: "var(--font-size-xs)",
            fontFamily: "var(--font-mono)",
            color: "var(--text-primary)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            border: "1px solid var(--border-default)",
          }}
        >
          {command.join(" ")}
        </code>
      )}

      {/* File paths */}
      {file_paths && file_paths.length > 0 && (
        <div
          style={{
            margin: "0 14px",
            fontSize: "var(--font-size-xs)",
            color: "var(--text-secondary)",
            background: "rgba(255,255,255,0.02)",
            border: "1px solid var(--border-default)",
            borderRadius: 6,
            padding: "8px 12px",
            lineHeight: 1.5,
            fontFamily: "var(--font-mono)",
          }}
        >
          <FormattedText text={file_paths.join("\n")} rootPath={rootPath} />
        </div>
      )}

      {/* Meta */}
      {meta && meta.length > 0 && (
        <div
          style={{
            margin: "0 14px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: "8px 12px",
            borderRadius: 6,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          {meta.map((entry) => (
            <div key={entry.label}>
              <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", fontWeight: 700 }}>
                {entry.label}
              </div>
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                <FormattedText text={entry.value} rootPath={rootPath} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: "10px 14px",
          borderTop: "1px solid rgba(204,167,0,0.15)",
          background: "rgba(204,167,0,0.04)",
        }}
      >
        <button
          className="btn btn-primary"
          onClick={() => onDecision?.(requestId, "accept")}
          style={{ fontSize: "var(--font-size-xs)", padding: "3px 10px" }}
        >
          <CheckCircle size={12} />
          Approve
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => onDecision?.(requestId, "acceptForSession")}
          style={{ fontSize: "var(--font-size-xs)", padding: "3px 10px" }}
        >
          <CheckCircle size={12} />
          Always
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => onDecision?.(requestId, "decline")}
          style={{ fontSize: "var(--font-size-xs)", padding: "3px 10px", color: "var(--text-error)", marginLeft: "auto" }}
        >
          <XCircle size={12} />
          Deny
        </button>
      </div>
    </div>
  );
}
