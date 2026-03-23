import { useEffect, useState } from "react";
import { GitCommit, RefreshCw, Plus, Minus } from "lucide-react";
import { useWorkspaceStore } from "../../store/workspace";
import { gitCommands, GitFile, GitDiff } from "../../services/tauri";

export default function GitPanel() {
  const { projectPath } = useWorkspaceStore();
  const [files, setFiles] = useState<GitFile[]>([]);
  const [diffs, setDiffs] = useState<GitDiff[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [commitMsg, setCommitMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!projectPath) return;
    setLoading(true);
    setError(null);
    try {
      const [statusResult, diffResult] = await Promise.all([
        gitCommands.status(projectPath),
        gitCommands.diff(projectPath, false),
      ]);
      setFiles(statusResult);
      setDiffs(diffResult);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [projectPath]);

  const handleStage = async (path: string) => {
    if (!projectPath) return;
    try {
      await gitCommands.stage(projectPath, [path]);
      await load();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleCommit = async () => {
    if (!projectPath || !commitMsg.trim()) return;
    setCommitting(true);
    try {
      await gitCommands.commit(projectPath, commitMsg.trim());
      setCommitMsg("");
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setCommitting(false);
    }
  };

  const selectedDiff = diffs.find((d) => d.path === selectedFile);
  const stagedFiles = files.filter((f) => f.staged);
  const unstagedFiles = files.filter((f) => !f.staged);

  if (!projectPath) {
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
        Open a project to see git status
      </div>
    );
  }

  return (
    <div className="panel-full">
      <div className="panel-header">
        <button
          className="btn btn-ghost"
          style={{ marginLeft: "auto", padding: "2px 6px" }}
          onClick={load}
          disabled={loading}
          title="Refresh"
        >
          <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: "6px 12px",
            background: "rgba(244,135,113,0.1)",
            color: "var(--text-error)",
            fontSize: "var(--font-size-xs)",
            borderBottom: "1px solid var(--border-default)",
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* File list */}
        <div
          style={{
            width: 180,
            flexShrink: 0,
            borderRight: "1px solid var(--border-default)",
            overflow: "auto",
          }}
        >
          {stagedFiles.length > 0 && (
            <div>
              <div style={{ padding: "4px 8px", fontSize: "var(--font-size-xs)", color: "var(--text-muted)", borderBottom: "1px solid var(--border-default)" }}>
                Staged ({stagedFiles.length})
              </div>
              {stagedFiles.map((f) => (
                <FileRow
                  key={f.path}
                  file={f}
                  active={selectedFile === f.path}
                  onClick={() => setSelectedFile(f.path)}
                />
              ))}
            </div>
          )}

          {unstagedFiles.length > 0 && (
            <div>
              <div style={{ padding: "4px 8px", fontSize: "var(--font-size-xs)", color: "var(--text-muted)", borderBottom: "1px solid var(--border-default)" }}>
                Changes ({unstagedFiles.length})
              </div>
              {unstagedFiles.map((f) => (
                <FileRow
                  key={f.path}
                  file={f}
                  active={selectedFile === f.path}
                  onClick={() => setSelectedFile(f.path)}
                  onStage={() => handleStage(f.path)}
                />
              ))}
            </div>
          )}

          {files.length === 0 && !loading && (
            <div style={{ padding: 12, color: "var(--text-muted)", fontSize: "var(--font-size-xs)", textAlign: "center" }}>
              No changes
            </div>
          )}
        </div>

        {/* Diff view */}
        <div style={{ flex: 1, overflow: "auto", background: "var(--bg-base)" }}>
          {selectedDiff ? (
            <DiffView diff={selectedDiff} />
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                color: "var(--text-muted)",
                fontSize: "var(--font-size-sm)",
              }}
            >
              Select a file to view diff
            </div>
          )}
        </div>
      </div>

      {/* Commit area */}
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
          placeholder="Commit message…"
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleCommit();
            }
          }}
        />
        <button
          className="btn btn-primary"
          onClick={handleCommit}
          disabled={!commitMsg.trim() || committing || stagedFiles.length === 0}
          title="Commit staged files"
        >
          <GitCommit size={12} />
        </button>
      </div>
    </div>
  );
}

function FileRow({
  file,
  active,
  onClick,
  onStage,
}: {
  file: GitFile;
  active: boolean;
  onClick: () => void;
  onStage?: () => void;
}) {
  const statusColor: Record<string, string> = {
    added: "var(--status-done)",
    modified: "var(--text-info)",
    deleted: "var(--text-error)",
    untracked: "var(--text-muted)",
  };

  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 8px",
        cursor: "pointer",
        background: active ? "var(--bg-active)" : "transparent",
        borderBottom: "1px solid var(--border-default)",
        fontSize: "var(--font-size-xs)",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: statusColor[file.status] ?? "var(--text-muted)",
          flexShrink: 0,
        }}
      />
      <span
        style={{
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          color: "var(--text-primary)",
        }}
        title={file.path}
      >
        {file.path.split("/").pop()}
      </span>
      {onStage && (
        <button
          className="btn btn-ghost"
          onClick={(e) => {
            e.stopPropagation();
            onStage();
          }}
          style={{ padding: "1px 3px" }}
          title="Stage"
        >
          <Plus size={10} />
        </button>
      )}
    </div>
  );
}

function DiffView({ diff }: { diff: GitDiff }) {
  const lines = diff.patch.split("\n");

  return (
    <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--font-size-xs)", padding: 0 }}>
      {lines.map((line, i) => {
        const color = line.startsWith("+")
          ? "rgba(137,209,133,0.1)"
          : line.startsWith("-")
          ? "rgba(244,135,113,0.1)"
          : "transparent";
        const textColor = line.startsWith("+")
          ? "var(--status-done)"
          : line.startsWith("-")
          ? "var(--text-error)"
          : line.startsWith("@@")
          ? "var(--text-info)"
          : "var(--text-secondary)";

        return (
          <div
            key={i}
            style={{
              background: color,
              color: textColor,
              padding: "0 12px",
              lineHeight: "18px",
              whiteSpace: "pre",
            }}
          >
            {line || " "}
          </div>
        );
      })}
    </div>
  );
}
