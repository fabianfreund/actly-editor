import {
  type Dispatch,
  type SetStateAction,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { listen } from "@tauri-apps/api/event";
import { RefreshCw, SquareTerminal, X } from "lucide-react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useWorkspaceStore } from "../../store/workspace";
import {
  useTerminalStore,
  type TerminalTab,
} from "../../store/terminal";
import {
  terminalCommands,
  type TerminalDataEvent,
  type TerminalExitEvent,
} from "../../services/tauri";

type TerminalStatus = "idle" | "starting" | "ready" | "error" | "closed";

interface TerminalTabHandle {
  clear: () => void;
  focus: () => void;
}

function createSessionId(tabId: string) {
  return `${tabId}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

export default function Terminal() {
  const tabHandlesRef = useRef<Record<string, TerminalTabHandle | null>>({});
  const { projectPath } = useWorkspaceStore();
  const { tabs, activeTabId, initializeWorkspace, setActiveTab, closeTab, restartTab } =
    useTerminalStore();
  const [statuses, setStatuses] = useState<Record<string, TerminalStatus>>({});

  useEffect(() => {
    if (!projectPath) return;
    initializeWorkspace(projectPath);
  }, [initializeWorkspace, projectPath]);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? null,
    [activeTabId, tabs]
  );

  useEffect(() => {
    if (!activeTabId) return;
    tabHandlesRef.current[activeTabId]?.focus();
  }, [activeTabId]);

  if (!projectPath || tabs.length === 0 || !activeTab) {
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
        Open a project to start a terminal
      </div>
    );
  }

  return (
    <div className="panel-full">
      <div className="panel-header">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            minWidth: 0,
            color: "var(--text-secondary)",
            fontSize: "var(--font-size-xs)",
          }}
        >
          <SquareTerminal size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          <span>{activeTab.label}</span>
          <span
            style={{
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              color: "var(--text-muted)",
            }}
          >
            {activeTab.cwd}
          </span>
          <span style={{ color: "var(--text-muted)", textTransform: "capitalize" }}>
            {statuses[activeTab.id] ?? "idle"}
          </span>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button
            className="btn btn-ghost"
            style={{ padding: "2px 6px", fontSize: "var(--font-size-xs)" }}
            onClick={() => tabHandlesRef.current[activeTab.id]?.clear()}
          >
            Clear
          </button>
          <button
            className="btn btn-ghost"
            style={{ padding: "2px 6px" }}
            onClick={() => restartTab(activeTab.id)}
            title="Restart tab"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 4,
          padding: "6px 8px 0",
          borderBottom: "1px solid var(--border-default)",
          flexShrink: 0,
          overflowX: "auto",
        }}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab.id;
          return (
            <button
              key={tab.id}
              className="btn btn-ghost"
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 10px",
                borderRadius: "6px 6px 0 0",
                border: "1px solid var(--border-default)",
                borderBottomColor: isActive ? "var(--bg-base)" : "var(--border-default)",
                background: isActive ? "var(--bg-base)" : "var(--bg-elevated)",
                color: isActive ? "var(--text-primary)" : "var(--text-muted)",
                flexShrink: 0,
              }}
            >
              <span>{tab.label}</span>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background:
                    statuses[tab.id] === "ready"
                      ? "var(--status-done)"
                      : statuses[tab.id] === "starting"
                      ? "var(--text-info)"
                      : statuses[tab.id] === "error"
                      ? "var(--text-error)"
                      : "var(--text-muted)",
                }}
              />
              {tab.closable && (
                <span
                  onClick={(event) => {
                    event.stopPropagation();
                    closeTab(tab.id);
                  }}
                  style={{ display: "inline-flex", color: "var(--text-muted)" }}
                  title="Close tab"
                >
                  <X size={12} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        {tabs.map((tab) => (
          <TerminalTabView
            key={tab.id}
            ref={(handle) => {
              tabHandlesRef.current[tab.id] = handle;
            }}
            tab={tab}
            active={tab.id === activeTab.id}
            setStatuses={setStatuses}
          />
        ))}
      </div>
    </div>
  );
}

const TerminalTabView = forwardRef<
  TerminalTabHandle,
  {
    tab: TerminalTab;
    active: boolean;
    setStatuses: Dispatch<SetStateAction<Record<string, TerminalStatus>>>;
  }
>(function TerminalTabView({ tab, active, setStatuses }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const updateStatus = (status: TerminalStatus) => {
    setStatuses((current) => ({ ...current, [tab.id]: status }));
  };

  useImperativeHandle(
    ref,
    () => ({
      clear: () => xtermRef.current?.clear(),
      focus: () => xtermRef.current?.focus(),
    }),
    []
  );

  useEffect(() => {
    if (!containerRef.current || xtermRef.current) return;

    const term = new XTerm({
      theme: {
        background: "#1e1e1e",
        foreground: "#d4d4d4",
        cursor: "#d4d4d4",
        selectionBackground: "#264f78",
        black: "#1e1e1e",
        red: "#f44747",
        green: "#89d185",
        yellow: "#cca700",
        blue: "#569cd6",
        magenta: "#c586c0",
        cyan: "#4ec9b0",
        white: "#d4d4d4",
        brightBlack: "#808080",
        brightRed: "#f4897b",
        brightGreen: "#b5cea8",
        brightYellow: "#dcdcaa",
        brightBlue: "#9cdcfe",
        brightMagenta: "#c586c0",
        brightCyan: "#4ec9b0",
        brightWhite: "#ffffff",
      },
      fontFamily: "var(--font-mono)",
      fontSize: 12,
      lineHeight: 1.4,
      cursorBlink: true,
      scrollback: 5000,
      allowTransparency: false,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    return () => {
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      if (!active) return;
      fitAddonRef.current?.fit();
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [active]);

  useEffect(() => {
    const term = xtermRef.current;
    const fitAddon = fitAddonRef.current;
    if (!term || !fitAddon) return;

    let cancelled = false;
    let unlistenData: (() => void) | undefined;
    let unlistenExit: (() => void) | undefined;

    const sessionId = createSessionId(tab.id);
    sessionIdRef.current = sessionId;

    const inputListener = term.onData((data) => {
      if (sessionIdRef.current !== sessionId) return;
      terminalCommands.write(sessionId, data).catch(() => undefined);
    });

    const resizeListener = term.onResize(({ cols, rows }) => {
      if (sessionIdRef.current !== sessionId) return;
      terminalCommands.resize(sessionId, cols, rows).catch(() => undefined);
    });

    const boot = async () => {
      updateStatus("starting");
      term.reset();
      term.clear();
      term.write(`\x1b[1;34m── ${tab.label} ──\x1b[0m\r\n`);
      term.write(`\x1b[90m${tab.cwd}\x1b[0m\r\n`);
      if (tab.command) {
        term.write(
          `\x1b[90m$ ${[tab.command, ...(tab.args ?? [])].join(" ")}\x1b[0m\r\n\r\n`
        );
      } else {
        term.write("\r\n");
      }

      try {
        const [stopData, stopExit] = await Promise.all([
          listen<TerminalDataEvent>("terminal:data", (event) => {
            if (event.payload.session_id !== sessionId || cancelled) return;
            xtermRef.current?.write(event.payload.data);
          }),
          listen<TerminalExitEvent>("terminal:exit", (event) => {
            if (event.payload.session_id !== sessionId || cancelled) return;
            updateStatus("closed");
            xtermRef.current?.write(
              `\r\n\x1b[90m[process exited with code ${event.payload.code}]\x1b[0m\r\n`
            );
          }),
        ]);

        if (cancelled) {
          stopData();
          stopExit();
          return;
        }

        unlistenData = stopData;
        unlistenExit = stopExit;

        fitAddon.fit();
        await terminalCommands.start(
          sessionId,
          tab.cwd,
          Math.max(term.cols, 20),
          Math.max(term.rows, 8),
          tab.command,
          tab.args
        );

        if (!cancelled) updateStatus("ready");
      } catch (error) {
        if (cancelled) return;
        updateStatus("error");
        term.write(`\x1b[31mFailed to start terminal: ${String(error)}\x1b[0m\r\n`);
      }
    };

    void boot();

    return () => {
      cancelled = true;
      inputListener.dispose();
      resizeListener.dispose();
      unlistenData?.();
      unlistenExit?.();
      if (sessionIdRef.current === sessionId) {
        sessionIdRef.current = null;
      }
      terminalCommands.stop(sessionId).catch(() => undefined);
    };
  }, [
    setStatuses,
    tab.args,
    tab.command,
    tab.cwd,
    tab.id,
    tab.label,
    tab.restartNonce,
  ]);

  useEffect(() => {
    if (!active) return;
    const term = xtermRef.current;
    const fitAddon = fitAddonRef.current;
    if (!term || !fitAddon) return;

    fitAddon.fit();
    term.focus();
    const sessionId = sessionIdRef.current;
    if (sessionId) {
      terminalCommands
        .resize(sessionId, Math.max(term.cols, 20), Math.max(term.rows, 8))
        .catch(() => undefined);
    }
  }, [active]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: active ? "block" : "none",
        padding: 4,
        background: "#1e1e1e",
      }}
      onClick={() => xtermRef.current?.focus()}
    >
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          overflow: "hidden",
          cursor: "text",
        }}
      />
    </div>
  );
});
