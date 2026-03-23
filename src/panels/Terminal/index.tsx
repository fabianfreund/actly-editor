import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useWorkspaceStore } from "../../store/workspace";
import { useAgentsStore } from "../../store/agents";
import { getCodexClient } from "../../services/codex";

export default function Terminal() {
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const { codexPort, activeTaskId } = useWorkspaceStore();
  const { events, sessions } = useAgentsStore();

  // Initialize xterm
  useEffect(() => {
    if (!termRef.current || xtermRef.current) return;

    const term = new XTerm({
      theme: {
        background: "#1e1e1e",
        foreground: "#cccccc",
        cursor: "#cccccc",
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
        brightWhite: "#d4d4d4",
      },
      fontFamily: "var(--font-mono)",
      fontSize: 12,
      lineHeight: 1.4,
      cursorBlink: true,
      allowTransparency: false,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(termRef.current);
    fitAddon.fit();

    term.writeln("\x1b[1;34m── Actly Terminal ──\x1b[0m");
    term.writeln("\x1b[90mWaiting for agent activity…\x1b[0m\r\n");

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    return () => {
      term.dispose();
      xtermRef.current = null;
    };
  }, []);

  // Resize observer
  useEffect(() => {
    if (!termRef.current) return;
    const ro = new ResizeObserver(() => {
      fitAddonRef.current?.fit();
    });
    ro.observe(termRef.current);
    return () => ro.disconnect();
  }, []);

  // Mirror codex command_exec events to terminal
  useEffect(() => {
    if (!codexPort || !activeTaskId) return;
    const activeSession = sessions.find(
      (s) => s.task_id === activeTaskId && s.status !== "completed"
    );
    if (!activeSession) return;

    const sessionEvents = events[activeSession.id] ?? [];
    const term = xtermRef.current;
    if (!term) return;

    // Only process the last event (already rendered previous ones)
    const last = sessionEvents[sessionEvents.length - 1];
    if (!last) return;

    const payload = last.payload as Record<string, unknown>;
    if (last.type === "item.command_exec" && payload.item) {
      const item = payload.item as Record<string, unknown>;
      const cmd = (item.command as string[])?.join(" ") ?? "";
      const output = item.output as string ?? "";
      term.writeln(`\x1b[1;36m$ ${cmd}\x1b[0m`);
      if (output) {
        output.split("\n").forEach((line) => term.writeln(line));
      }
    } else if (last.type === "item.file_change" && payload.item) {
      const item = payload.item as Record<string, unknown>;
      term.writeln(`\x1b[33m[file] ${item.path as string}\x1b[0m`);
    } else if (last.type === "turn.started") {
      term.writeln(`\x1b[90m[agent] thinking…\x1b[0m`);
    } else if (last.type === "turn.completed") {
      term.writeln(`\x1b[32m[agent] done\x1b[0m`);
    } else if (last.type === "turn.failed") {
      term.writeln(`\x1b[31m[agent] failed: ${payload.message ?? ""}\x1b[0m`);
    }
  }, [events, activeTaskId, sessions, codexPort]);

  return (
    <div className="panel-full">
      <div className="panel-header">
        <button
          className="btn btn-ghost"
          style={{ marginLeft: "auto", padding: "2px 6px", fontSize: "var(--font-size-xs)" }}
          onClick={() => {
            xtermRef.current?.clear();
          }}
        >
          Clear
        </button>
      </div>
      <div
        ref={termRef}
        style={{
          flex: 1,
          padding: "4px",
          background: "#1e1e1e",
          overflow: "hidden",
        }}
      />
    </div>
  );
}
