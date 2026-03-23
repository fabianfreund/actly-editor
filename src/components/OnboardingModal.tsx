import { useState } from "react";
import { FolderOpen, Sparkles, ChevronRight } from "lucide-react";
import { scaffoldActlyFolder, detectProjectScripts, writeActlyActions } from "../services/actlyFs";
import { useActionsStore } from "../store/actions";
import { useTasksStore } from "../store/tasks";
import { useAgentsStore } from "../store/agents";
import { useWorkspaceStore } from "../store/workspace";
import { startAgent } from "../services/agentRunner";
import { dbCreateTask, dbUpdateTask, dbListAgents } from "../services/db";
import { navigateMode } from "../services/layoutEvents";

type Step = "welcome" | "ai-init";

const ONBOARDING_PROMPT = `\
You are initializing an Actly project workspace. Analyze this repository carefully, then:

1. Overwrite \`.actly/AGENTS.md\` with a complete version containing:
   - A 2–3 paragraph project overview (what it does, tech stack, purpose)
   - Key files and directories with short descriptions
   - Practical coding guidelines for AI agents (conventions, patterns, gotchas)
   - A references table linking to docs files

2. Overwrite \`.actly/docs/architecture.md\` with:
   - Tech stack and major dependencies
   - High-level data flow or request lifecycle
   - Key architectural decisions and why they were made

3. Read \`package.json\` (or Makefile) and write \`.actly/actions.json\` as a JSON array:
   [{"id":"dev","label":"Dev Server","command":"npm","args":["run","dev"]}, ...]
   Include all useful scripts (dev, build, test, lint, typecheck, preview, etc).
   Output only the JSON array in this file — no markdown.

Be concise and practical. Do not add placeholders — if you cannot determine something, omit it.
Start working immediately without asking questions.`;

interface Props {
  projectPath: string;
  onDone: () => void;
}

export default function OnboardingModal({ projectPath, onDone }: Props) {
  const [step, setStep] = useState<Step>("welcome");
  const [scaffoldError, setScaffoldError] = useState<string | null>(null);
  const [aiStarting, setAiStarting] = useState(false);

  const { codexPath } = useWorkspaceStore();
  const { loadActions } = useActionsStore();

  const handleScaffold = async () => {
    setScaffoldError(null);
    try {
      await scaffoldActlyFolder(projectPath);
      setStep("ai-init");
    } catch (e) {
      setScaffoldError(String(e));
    }
  };

  const handleAiInit = async () => {
    setAiStarting(true);
    setScaffoldError(null);
    try {
      // Load agents — needs at least one configured
      const agents = await dbListAgents();
      const agent = agents.find((a) => a.role === "builder") ?? agents[0];
      if (!agent) throw new Error("No agents configured. Go to Settings to add one first.");

      // Create "Initialize project" task in planned, then immediately in_progress
      const task = await dbCreateTask("Initialize project", projectPath, ONBOARDING_PROMPT);

      // Add to store so kanban shows it right away
      useTasksStore.getState().upsertTask({ ...task, status: "in_progress" });

      // Navigate to plan so user sees the task
      useWorkspaceStore.getState().setActiveTaskId(task.id);
      navigateMode("plan");
      onDone();

      // Kick off the agent (async — runs in background)
      await startAgent({
        taskId: task.id,
        agentId: agent.id,
        task: { ...task, description: ONBOARDING_PROMPT },
        agent,
        projectPath,
        codexPath,
        onSessionCreated: (session) => {
          const store = useAgentsStore.getState();
          store.setSessions([...store.sessions, session]);
        },
        onTurnCompleted: async () => {
          // Mark task done and reload discovered actions
          await dbUpdateTask(task.id, { status: "done" });
          useTasksStore.getState().upsertTask({ ...task, status: "done" });
          await loadActions(projectPath).catch(async () => {
            const detected = await detectProjectScripts(projectPath);
            if (detected.length > 0) {
              await writeActlyActions(projectPath, detected);
              await loadActions(projectPath);
            }
          });
        },
      });
    } catch (e) {
      setScaffoldError(String(e));
      setAiStarting(false);
    }
  };

  const handleSkip = async () => {
    try {
      const detected = await detectProjectScripts(projectPath);
      if (detected.length > 0) {
        await writeActlyActions(projectPath, detected);
        await loadActions(projectPath);
      }
    } catch {
      // best effort
    }
    onDone();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
      }}
    >
      <div
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          borderRadius: 8,
          width: 480,
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 48px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div style={{ padding: "20px 24px 0", display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div
            style={{
              width: 36, height: 36, borderRadius: 8,
              background: "var(--accent)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {step === "welcome"
              ? <FolderOpen size={18} color="#fff" />
              : <Sparkles size={18} color="#fff" />}
          </div>
          <div>
            <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, color: "var(--text-primary)" }}>
              {step === "welcome" ? "Set up project" : "Initialize with AI"}
            </div>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--text-muted)", marginTop: 2 }}>
              {step === "welcome"
                ? "This project doesn't have an .actly folder yet."
                : "An AI agent will analyze the repo and set up docs and actions."}
            </div>
          </div>
        </div>

        {/* Step dots */}
        <div style={{ display: "flex", gap: 6, padding: "14px 24px 0" }}>
          {(["welcome", "ai-init"] as Step[]).map((s) => (
            <div
              key={s}
              style={{
                width: step === s ? 20 : 6,
                height: 6,
                borderRadius: 3,
                background: step === s
                  ? "var(--accent)"
                  : s === "welcome" && step === "ai-init"
                  ? "var(--text-success)"
                  : "var(--bg-overlay)",
                transition: "width 0.2s, background 0.2s",
              }}
            />
          ))}
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px" }}>
          {step === "welcome" && <WelcomeStep projectPath={projectPath} error={scaffoldError} />}
          {step === "ai-init" && <AiStep error={scaffoldError} />}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid var(--border-default)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          {step === "welcome" && (
            <button className="btn btn-primary" onClick={handleScaffold} style={{ gap: 6 }}>
              Create project structure
              <ChevronRight size={14} />
            </button>
          )}

          {step === "ai-init" && !aiStarting && (
            <>
              <button
                className="btn btn-ghost"
                onClick={handleSkip}
                style={{ color: "var(--text-muted)" }}
              >
                Skip for now
              </button>
              <button className="btn btn-primary" onClick={handleAiInit} style={{ gap: 6 }}>
                <Sparkles size={14} />
                Initialize with AI
              </button>
            </>
          )}

          {step === "ai-init" && aiStarting && (
            <button className="btn btn-primary" disabled style={{ gap: 6, opacity: 0.7 }}>
              <span
                style={{
                  width: 12, height: 12, borderRadius: "50%",
                  border: "2px solid rgba(255,255,255,0.3)",
                  borderTopColor: "#fff",
                  display: "inline-block",
                  animation: "spin 0.7s linear infinite",
                }}
              />
              Starting…
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function WelcomeStep({ projectPath, error }: { projectPath: string; error: string | null }) {
  const name = projectPath.split("/").filter(Boolean).pop() ?? "project";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ margin: 0, fontSize: "var(--font-size-sm)", color: "var(--text-secondary)", lineHeight: 1.6 }}>
        Actly will create an <code style={{ color: "var(--text-link)" }}>.actly/</code> folder
        in <strong style={{ color: "var(--text-primary)" }}>{name}</strong> to store project
        docs, agent guidelines, and action scripts.
      </p>

      <div
        style={{
          background: "var(--bg-base)",
          border: "1px solid var(--border-default)",
          borderRadius: 6,
          padding: "12px 14px",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--font-size-xs)",
          lineHeight: 1.8,
        }}
      >
        {[
          { indent: 0, name: ".actly/", muted: false },
          { indent: 1, name: "AGENTS.md", muted: true, note: "agent guidelines & overview" },
          { indent: 1, name: "docs/", muted: false },
          { indent: 2, name: "architecture.md", muted: true },
          { indent: 2, name: "tasks.md", muted: true },
          { indent: 1, name: "actions.json", muted: true, note: "run scripts (detected by AI)" },
        ].map((e, i) => (
          <div key={i} style={{ paddingLeft: e.indent * 16, color: e.muted ? "var(--text-secondary)" : "var(--text-link)" }}>
            {e.name}
            {e.note && <span style={{ color: "var(--text-muted)", marginLeft: 10 }}>— {e.note}</span>}
          </div>
        ))}
      </div>

      {error && (
        <div
          style={{
            padding: "8px 10px",
            background: "rgba(244,135,113,0.1)",
            border: "1px solid var(--text-error)",
            borderRadius: 4,
            fontSize: "var(--font-size-xs)",
            color: "var(--text-error)",
            fontFamily: "var(--font-mono)",
            wordBreak: "break-all",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

function AiStep({ error }: { error: string | null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ margin: 0, fontSize: "var(--font-size-sm)", color: "var(--text-secondary)", lineHeight: 1.6 }}>
        The AI agent will scan your repository and write{" "}
        <code style={{ color: "var(--text-link)" }}>AGENTS.md</code>,{" "}
        <code style={{ color: "var(--text-link)" }}>architecture.md</code>, and detect your
        available scripts automatically.
      </p>
      <p style={{ margin: 0, fontSize: "var(--font-size-sm)", color: "var(--text-secondary)", lineHeight: 1.6 }}>
        A task <strong style={{ color: "var(--text-primary)" }}>Initialize project</strong> will
        be created and you'll be taken to the Plan view so you can watch it run in real time.
      </p>

      {error && (
        <div
          style={{
            padding: "8px 10px",
            background: "rgba(244,135,113,0.1)",
            border: "1px solid var(--text-error)",
            borderRadius: 4,
            fontSize: "var(--font-size-xs)",
            color: "var(--text-error)",
            fontFamily: "var(--font-mono)",
            wordBreak: "break-all",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
