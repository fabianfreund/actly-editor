import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useAgentsStore, Agent } from "../../store/agents";
import { useWorkspaceStore } from "../../store/workspace";
import { dbListAgents, dbUpsertAgent } from "../../services/db";
import { codexCommands } from "../../services/tauri";
import { load } from "@tauri-apps/plugin-store";
import { SUPPORTED_MODELS, normalizeAgentModel } from "../../registries/models.registry";

const PROVIDERS = ["openai", "minimax", "azure", "anthropic"];
const APPROVAL_MODES = ["auto", "full", "readonly", "never"] as const;

export default function Settings() {
  const { agents, setAgents } = useAgentsStore();
  const { codexPath, setCodexPath } = useWorkspaceStore();
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [draftCodexPath, setDraftCodexPath] = useState(codexPath ?? "");
  const [codexStatus, setCodexStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  // Sync draft when store hydrates
  useEffect(() => {
    setDraftCodexPath(codexPath ?? "");
  }, [codexPath]);

  const handleBrowseCodex = async () => {
    const selected = await open({ directory: false, multiple: false });
    if (typeof selected === "string") setDraftCodexPath(selected);
  };

  const handleTestCodex = async () => {
    setCodexStatus(null);
    try {
      const version = await codexCommands.checkPath(draftCodexPath || null);
      setCodexStatus({ ok: true, msg: version });
    } catch (e) {
      setCodexStatus({ ok: false, msg: String(e) });
    }
  };

  const handleSaveCodexPath = () => {
    setCodexPath(draftCodexPath || null);
    setCodexStatus(null);
  };

  useEffect(() => {
    dbListAgents().then(setAgents).catch(console.error);
    // Load stored API keys
    load("workspace.json", { defaults: {}, autoSave: false }).then(async (store) => {
      const keys = await store.get<Record<string, string>>("apiKeys");
      if (keys) setApiKeys(keys);
    }).catch(() => {});
  }, [setAgents]);

  const handleSaveApiKeys = async () => {
    try {
      const store = await load("workspace.json", { defaults: {}, autoSave: true });
      await store.set("apiKeys", apiKeys);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveAgent = async (agent: Agent) => {
    try {
      await dbUpsertAgent(agent);
      setAgents(agents.map((a) => (a.id === agent.id ? agent : a)));
    } catch (e) {
      console.error(e);
    }
  };

  const usedModels = Array.from(new Set([
    ...SUPPORTED_MODELS,
    ...agents.map((agent) => normalizeAgentModel(agent.model)),
  ]));

  return (
    <div className="panel-full">
<div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 20, padding: 16 }}>
        {/* Codex CLI */}
        <section>
          <h3 style={{ margin: "0 0 12px", fontSize: "var(--font-size-sm)", fontWeight: 600, color: "var(--text-secondary)" }}>
            Codex CLI
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <FieldRow label='Binary path (leave empty to use "codex" from PATH)'>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  className="input"
                  placeholder="codex"
                  value={draftCodexPath}
                  onChange={(e) => { setDraftCodexPath(e.target.value); setCodexStatus(null); }}
                  style={{ flex: 1 }}
                />
                <button className="btn btn-ghost" onClick={handleBrowseCodex} style={{ flexShrink: 0 }}>
                  Browse…
                </button>
              </div>
            </FieldRow>
            {codexStatus && (
              <div style={{
                fontSize: "var(--font-size-xs)",
                color: codexStatus.ok ? "var(--text-success)" : "var(--text-error)",
                padding: "4px 8px",
                background: codexStatus.ok ? "rgba(137,209,133,0.08)" : "rgba(244,135,113,0.08)",
                borderRadius: 3,
                wordBreak: "break-all",
              }}>
                {codexStatus.ok ? "✓ " : "✗ "}{codexStatus.msg}
              </div>
            )}
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn btn-ghost" onClick={handleTestCodex}>
                Test
              </button>
              <button className="btn btn-primary" onClick={handleSaveCodexPath}>
                <Save size={12} />
                Save
              </button>
            </div>
          </div>
        </section>

        {/* API Keys */}
        <section>
          <h3
            style={{
              margin: "0 0 12px",
              fontSize: "var(--font-size-sm)",
              fontWeight: 600,
              color: "var(--text-secondary)",
            }}
          >
            API Keys
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {["OPENAI_API_KEY", "MINIMAX_API_KEY"].map((key) => (
              <div key={key} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <label
                  htmlFor={key}
                  style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}
                >
                  {key}
                </label>
                <input
                  id={key}
                  type="password"
                  className="input"
                  placeholder={`${key}…`}
                  value={apiKeys[key] ?? ""}
                  onChange={(e) => setApiKeys((prev) => ({ ...prev, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <button
            className="btn btn-primary"
            onClick={handleSaveApiKeys}
            style={{ marginTop: 10 }}
          >
            <Save size={12} />
            {saved ? "Saved!" : "Save Keys"}
          </button>
        </section>

        {/* Agents */}
        <section>
          <h3
            style={{
              margin: "0 0 12px",
              fontSize: "var(--font-size-sm)",
              fontWeight: 600,
              color: "var(--text-secondary)",
            }}
          >
            Agents
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {agents.map((agent) => (
              <AgentEditor key={agent.id} agent={agent} usedModels={usedModels} onSave={handleSaveAgent} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function AgentEditor({
  agent,
  usedModels,
  onSave,
}: {
  agent: Agent;
  usedModels: string[];
  onSave: (a: Agent) => void;
}) {
  const [draft, setDraft] = useState({ ...agent, model: normalizeAgentModel(agent.model) });

  const update = <K extends keyof Agent>(key: K, value: Agent[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: 4,
        padding: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontWeight: 600, fontSize: "var(--font-size-sm)", color: "var(--text-primary)" }}>
          {agent.name}
        </span>
        <span className={`badge badge-${agent.role === "builder" ? "in_progress" : agent.role === "initializer" ? "icebox" : "todo"}`}>
          {agent.role}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <FieldRow label="Model">
          <select
            value={draft.model}
            onChange={(e) => update("model", e.target.value)}
            style={{
              background: "var(--bg-input)",
              border: "1px solid var(--border-default)",
              borderRadius: 3,
              color: "var(--text-primary)",
              fontSize: "var(--font-size-base)",
              padding: "4px 8px",
              width: "100%",
            }}
          >
            {usedModels.map((model) => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>
        </FieldRow>
        <FieldRow label="Provider">
          <select
            value={draft.provider}
            onChange={(e) => update("provider", e.target.value)}
            style={{
              background: "var(--bg-input)",
              border: "1px solid var(--border-default)",
              borderRadius: 3,
              color: "var(--text-primary)",
              fontSize: "var(--font-size-base)",
              padding: "4px 8px",
              width: "100%",
            }}
          >
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </FieldRow>
        <FieldRow label="Approval">
          <select
            value={draft.approval_mode}
            onChange={(e) => update("approval_mode", e.target.value as Agent["approval_mode"])}
            style={{
              background: "var(--bg-input)",
              border: "1px solid var(--border-default)",
              borderRadius: 3,
              color: "var(--text-primary)",
              fontSize: "var(--font-size-base)",
              padding: "4px 8px",
              width: "100%",
            }}
          >
            {APPROVAL_MODES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </FieldRow>
        <FieldRow label="System Prompt">
          <textarea
            className="input"
            value={draft.system_prompt ?? ""}
            onChange={(e) => update("system_prompt", e.target.value || null)}
            rows={3}
            style={{ resize: "vertical", fontFamily: "var(--font-mono)" }}
            placeholder="Optional system prompt…"
          />
        </FieldRow>
      </div>

      <button
        className="btn btn-primary"
        onClick={() => onSave(draft)}
        style={{ marginTop: 10 }}
      >
        <Save size={12} />
        Save
      </button>
    </div>
  );
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <label style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
        {label}
      </label>
      {children}
    </div>
  );
}
