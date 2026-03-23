import { useState } from "react";
import { Play, Plus, Rocket, Trash2 } from "lucide-react";
import { useWorkspaceStore } from "../../store/workspace";
import { useActionsStore } from "../../store/actions";
import { useTerminalStore } from "../../store/terminal";
import { useUiStore } from "../../store/ui";

export interface ActionDef {
  id: string;
  label: string;
  command: string;
  args?: string[];
}

export default function ActionPanel() {
  const { activeId, projectPath } = useWorkspaceStore();
  const { actions, saveActions } = useActionsStore();
  const { initializeWorkspace, addCommandTab } = useTerminalStore();
  const { setMode } = useUiStore();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ label: "", command: "", args: "" });

  const handleRun = (action: ActionDef) => {
    if (!projectPath) return;
    initializeWorkspace(projectPath);
    addCommandTab({
      label: action.label,
      cwd: projectPath,
      command: action.command,
      args: action.args,
    });
    setMode("develop", activeId);
  };

  const handleRemove = (id: string) => {
    saveActions(actions.filter((a) => a.id !== id));
  };

  const handleAddConfirm = () => {
    const label = draft.label.trim();
    const command = draft.command.trim();
    if (!label || !command) return;
    const parts = command.split(" ");
    const newAction: ActionDef = {
      id: `custom-${Date.now()}`,
      label,
      command: parts[0],
      args: parts.slice(1).concat(draft.args.trim() ? draft.args.trim().split(" ") : []).filter(Boolean),
    };
    saveActions([...actions, newAction]);
    setDraft({ label: "", command: "", args: "" });
    setAdding(false);
  };

  return (
    <div className="panel-full">
      <div className="panel-header">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "var(--text-secondary)",
            fontSize: "var(--font-size-xs)",
          }}
        >
          <Rocket size={12} style={{ color: "var(--text-muted)" }} />
          <span>Actions</span>
        </div>
      </div>

      <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {actions.length === 0 && !adding && (
          <div
            style={{
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: "var(--font-size-xs)",
              padding: "24px 8px",
            }}
          >
            No actions yet.
            <br />
            Add one below or run AI init to auto-detect.
          </div>
        )}

        {actions.map((action) => (
          <div key={action.id}>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                className="btn btn-ghost"
                onClick={() => handleRun(action)}
                disabled={!projectPath}
                style={{
                  flex: 1,
                  justifyContent: "flex-start",
                  padding: "6px 10px",
                }}
              >
                <Play
                  size={12}
                  style={{ color: "var(--text-muted)" }}
                />
                <span>{action.label}</span>
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: "var(--font-size-xs)",
                    color: "var(--text-muted)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {[action.command, ...(action.args ?? [])].join(" ").slice(0, 24)}
                </span>
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => handleRemove(action.id)}
                title="Remove action"
                style={{ padding: "6px 8px", flexShrink: 0 }}
              >
                <Trash2 size={11} style={{ color: "var(--text-muted)" }} />
              </button>
            </div>

          </div>
        ))}

        {/* Add action form */}
        {adding ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              padding: "8px 10px",
              background: "var(--bg-elevated)",
              borderRadius: 4,
              border: "1px solid var(--border-default)",
            }}
          >
            <input
              className="input"
              autoFocus
              placeholder="Label (e.g. Dev Server)"
              value={draft.label}
              onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
              style={{ fontSize: "var(--font-size-xs)" }}
            />
            <input
              className="input"
              placeholder="Command (e.g. npm run dev)"
              value={draft.command}
              onChange={(e) => setDraft((d) => ({ ...d, command: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddConfirm();
                if (e.key === "Escape") setAdding(false);
              }}
              style={{ fontSize: "var(--font-size-xs)" }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn btn-primary" onClick={handleAddConfirm} style={{ flex: 1, fontSize: "var(--font-size-xs)", padding: "3px 8px" }}>
                Add
              </button>
              <button className="btn btn-ghost" onClick={() => setAdding(false)} style={{ flex: 1, fontSize: "var(--font-size-xs)", padding: "3px 8px" }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            className="btn btn-ghost"
            onClick={() => setAdding(true)}
            style={{ justifyContent: "flex-start", padding: "5px 10px", marginTop: 2 }}
          >
            <Plus size={12} style={{ color: "var(--text-muted)" }} />
            <span style={{ color: "var(--text-muted)", fontSize: "var(--font-size-xs)" }}>Add action</span>
          </button>
        )}
      </div>
    </div>
  );
}
