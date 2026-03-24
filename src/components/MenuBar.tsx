import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { Actions, DockLocation, Model } from "flexlayout-react";
import { PANELS } from "../layout/panels.registry";
import { useWorkspaceStore } from "../store/workspace";
import { useTasksStore } from "../store/tasks";
import { dbGetWorkspaceActivityCount } from "../services/db";

function VsCodeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M74.6 3.2L39.3 35.5 16 17 3 28l23 22-23 22 13 11 23.3-18.5L74.6 96.8 97 85.6V14.4L74.6 3.2zm-.3 66.4L52.5 50l21.8-19.6v39.2z" />
    </svg>
  );
}

interface MenuBarProps {
  model?: Model;
  openPanelIds?: Set<string>;
  onLayoutChanged?: () => void;
}

type MenuId = "file" | "view" | null;

const MENU_STYLE: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  marginTop: 1,
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-default)",
  boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
  minWidth: 180,
  zIndex: 9999,
  padding: "3px 0",
};

const MENU_ITEM_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "5px 12px",
  background: "transparent",
  border: "none",
  color: "var(--text-primary)",
  fontSize: "var(--font-size-sm)",
  cursor: "pointer",
  textAlign: "left",
  whiteSpace: "nowrap",
};

const SEPARATOR_STYLE: React.CSSProperties = {
  height: 1,
  background: "var(--border-default)",
  margin: "3px 0",
};

function MenuItem({
  label,
  hint,
  disabled,
  onClick,
}: {
  label: string;
  hint?: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      style={{
        ...MENU_ITEM_STYLE,
        color: disabled ? "var(--text-muted)" : "var(--text-primary)",
        background: hovered && !disabled ? "var(--bg-active)" : "transparent",
        cursor: disabled ? "default" : "pointer",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={disabled ? undefined : onClick}
    >
      <span style={{ flex: 1 }}>{label}</span>
      {hint && <span style={{ color: "var(--text-muted)", fontSize: "var(--font-size-xs)" }}>{hint}</span>}
    </button>
  );
}

export default function MenuBar({ model, openPanelIds, onLayoutChanged }: MenuBarProps = {}) {
  const [openMenu, setOpenMenu] = useState<MenuId>(null);
  const [workspaceActivityCounts, setWorkspaceActivityCounts] = useState<Record<string, number>>({});
  const barRef = useRef<HTMLDivElement>(null);
  const { workspaces, activeId, projectPath, openWorkspace, setActiveWorkspace, closeWorkspace } = useWorkspaceStore();
  const { tasks, events } = useTasksStore();

  useEffect(() => {
    if (!openMenu) return;
    const handler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openMenu]);

  useEffect(() => {
    let cancelled = false;

    const loadCounts = async () => {
      const entries = await Promise.all(
        workspaces.map(async (workspace) => [
          workspace.id,
          await dbGetWorkspaceActivityCount(workspace.id).catch(() => 0),
        ] as const)
      );

      if (!cancelled) {
        setWorkspaceActivityCounts(Object.fromEntries(entries));
      }
    };

    if (workspaces.length > 0) {
      loadCounts().catch(console.error);
    } else {
      setWorkspaceActivityCounts({});
    }

    return () => {
      cancelled = true;
    };
  }, [workspaces, tasks, events]);

  const toggle = (id: MenuId) => setOpenMenu((prev) => (prev === id ? null : id));

  const handleOpenFolder = async () => {
    setOpenMenu(null);
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") openWorkspace(selected);
  };

  const handleAddPanel = (panelId: string, panelLabel: string) => {
    setOpenMenu(null);
    if (!model || !onLayoutChanged) return;
    const activeTabset = model.getActiveTabset(Model.MAIN_WINDOW_ID);
    const root = model.getRoot(Model.MAIN_WINDOW_ID);
    const firstChild = root.getChildren()[0];
    const targetId = activeTabset?.getId() ?? firstChild?.getId();
    if (!targetId) return;
    try {
      model.doAction(
        Actions.addNode(
          { type: "tab", name: panelLabel, component: panelId },
          targetId,
          DockLocation.CENTER,
          -1,
          true
        )
      );
      onLayoutChanged();
    } catch {
      // already open or invalid target
    }
  };

  const menuTriggerStyle = (isOpen: boolean): React.CSSProperties => ({
    background: isOpen ? "var(--bg-active)" : "transparent",
    border: "none",
    color: isOpen ? "var(--text-primary)" : "var(--text-secondary)",
    fontSize: "var(--font-size-sm)",
    padding: "4px 8px",
    cursor: "pointer",
    borderRadius: 3,
    height: 28,
  });

  return (
    <div
      data-tauri-drag-region
      style={{
        display: "flex",
        alignItems: "center",
        height: 36,
        padding: "0 8px",
        background: "var(--titlebar-bg)",
        borderBottom: "1px solid var(--border-default)",
        flexShrink: 0,
        userSelect: "none",
        gap: 2,
      }}
    >
      {/* ── Menu triggers ── */}
      <div ref={barRef} style={{ display: "flex", alignItems: "center", gap: 2 }}>
        {/* File */}
        <div style={{ position: "relative" }}>
          <button style={menuTriggerStyle(openMenu === "file")} onClick={() => toggle("file")}>
            File
          </button>
          {openMenu === "file" && (
            <div style={MENU_STYLE}>
              <MenuItem label="Open Folder…" onClick={handleOpenFolder} />
              {workspaces.length > 0 && (
                <>
                  <div style={SEPARATOR_STYLE} />
                  <div
                    style={{
                      padding: "3px 12px 2px",
                      fontSize: "var(--font-size-xs)",
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    Recent
                  </div>
                  {workspaces.map((ws) => (
                    <MenuItem
                      key={ws.id}
                      label={ws.label}
                      hint={ws.id === activeId ? "active" : undefined}
                      onClick={() => {
                        setActiveWorkspace(ws.id);
                        setOpenMenu(null);
                      }}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* View */}
        <div style={{ position: "relative" }}>
          <button style={menuTriggerStyle(openMenu === "view")} onClick={() => toggle("view")}>
            View
          </button>
          {openMenu === "view" && model && (
            <div style={MENU_STYLE}>
              {PANELS.map((panel) => {
                const isOpen = openPanelIds?.has(panel.id) ?? false;
                return (
                  <MenuItem
                    key={panel.id}
                    label={panel.label}
                    hint={isOpen ? "✓" : undefined}
                    disabled={isOpen}
                    onClick={() => handleAddPanel(panel.id, panel.label)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Workspace tabs ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          marginLeft: 12,
          flex: 1,
          overflow: "hidden",
        }}
      >
        {workspaces.map((ws) => {
          const isActive = ws.id === activeId;
          const activityCount = workspaceActivityCounts[ws.id] ?? 0;
          return (
            <div
              key={ws.id}
              style={{
                display: "flex",
                alignItems: "center",
                height: 28,
                borderRadius: 4,
                background: isActive ? "var(--bg-active)" : "transparent",
                border: isActive ? "1px solid var(--border-default)" : "1px solid transparent",
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              <button
                onClick={() => setActiveWorkspace(ws.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "transparent",
                  border: "none",
                  color: isActive ? "var(--text-primary)" : "var(--text-muted)",
                  fontSize: "var(--font-size-sm)",
                  fontWeight: isActive ? 500 : 400,
                  padding: "0 8px 0 10px",
                  cursor: "pointer",
                  height: "100%",
                  maxWidth: 160,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={ws.path}
              >
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {ws.label}
                </span>
                {activityCount > 0 && (
                  <span
                    style={{
                      minWidth: 18,
                      height: 18,
                      padding: "0 6px",
                      borderRadius: 999,
                      background: isActive ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.08)",
                      color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                      fontSize: "11px",
                      fontWeight: 600,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {activityCount}
                  </span>
                )}
              </button>
              {workspaces.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeWorkspace(ws.id);
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-muted)",
                    fontSize: 14,
                    cursor: "pointer",
                    padding: "0 6px 0 2px",
                    height: "100%",
                    lineHeight: 1,
                    display: "flex",
                    alignItems: "center",
                  }}
                  title="Close workspace"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}

        {/* Add workspace */}
        <button
          onClick={handleOpenFolder}
          title="Open folder as workspace"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-muted)",
            fontSize: 16,
            cursor: "pointer",
            width: 28,
            height: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 4,
            flexShrink: 0,
            lineHeight: 1,
          }}
        >
          +
        </button>
      </div>

      {/* ── Right actions ── */}
      {projectPath && (
        <button
          onClick={() => invoke("open_in_vscode", { path: projectPath })}
          title="Open in VS Code"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            background: "transparent",
            border: "1px solid var(--border-default)",
            color: "var(--text-secondary)",
            fontSize: "var(--font-size-xs)",
            padding: "0 8px",
            height: 24,
            borderRadius: 4,
            cursor: "pointer",
            flexShrink: 0,
            marginLeft: 8,
          }}
        >
          <VsCodeIcon size={13} />
          <span>VS Code</span>
        </button>
      )}
    </div>
  );
}
