import { useEffect, useMemo, useState } from "react";
import { Save, KeyRound, Bot, TerminalSquare, ChevronDown, ChevronRight, ListTodo, Pencil, Trash2 } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { load } from "@tauri-apps/plugin-store";
import { useAgentsStore, type Agent } from "../../store/agents";
import { useWorkspaceStore } from "../../store/workspace";
import { useTemplatesStore, type CustomTaskTemplate } from "../../store/templates";
import { TASK_TEMPLATES, type TaskTemplate } from "../../registries/tasks.registry";
import { dbListAgents, dbUpsertAgent } from "../../services/db";
import { codexCommands } from "../../services/tauri";
import { SUPPORTED_MODELS, normalizeAgentModel } from "../../registries/models.registry";
import { getAgentDefaultSystemPrompt, getAgentWorkflow } from "../../registries/agents.registry";

const PROVIDERS = ["openai", "minimax", "azure", "anthropic"];
const APPROVAL_MODES = ["auto", "full", "readonly", "never"] as const;

type SettingsSectionId = "codex" | "agents" | "prompts" | "tasks";

interface SettingsSection {
  id: SettingsSectionId;
  label: string;
  description: string;
  Icon: React.ComponentType<{ size?: number }>;
}

const SECTIONS: SettingsSection[] = [
  {
    id: "codex",
    label: "General",
    description: "Codex CLI, API keys, and runtime settings",
    Icon: TerminalSquare,
  },
  {
    id: "agents",
    label: "Agents",
    description: "Models, approval, prompts",
    Icon: Bot,
  },
  {
    id: "prompts",
    label: "Prompts",
    description: "Read-only effective instructions",
    Icon: Bot,
  },
  {
    id: "tasks",
    label: "Tasks",
    description: "Builtin and custom templates",
    Icon: ListTodo,
  },
];

export default function Settings() {
  const { agents, setAgents } = useAgentsStore();
  const { codexPath, setCodexPath, projectPath, yoloMode, setYoloMode } = useWorkspaceStore();
  const { customTemplates, addTemplate, updateTemplate, removeTemplate } = useTemplatesStore();
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("codex");
  const [editingTemplate, setEditingTemplate] = useState<CustomTaskTemplate | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [draftCodexPath, setDraftCodexPath] = useState(codexPath ?? "");
  const [codexStatus, setCodexStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    setDraftCodexPath(codexPath ?? "");
  }, [codexPath]);

  useEffect(() => {
    dbListAgents().then(setAgents).catch(console.error);
    load("workspace.json", { defaults: {}, autoSave: false })
      .then(async (store) => {
        const keys = await store.get<Record<string, string>>("apiKeys");
        if (keys) setApiKeys(keys);
      })
      .catch(() => {});
  }, [setAgents]);

  const usedModels = useMemo(
    () =>
      Array.from(
        new Set([...SUPPORTED_MODELS, ...agents.map((agent) => normalizeAgentModel(agent.model))])
      ),
    [agents]
  );

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

  const activeMeta = SECTIONS.find((section) => section.id === activeSection) ?? SECTIONS[0];

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <section
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          className="panel-header"
          style={{ justifyContent: "space-between", padding: "10px 12px", borderBottom: "1px solid var(--border-default)" }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Settings</span>
            <span style={{ color: "var(--text-muted)", fontSize: "var(--font-size-xs)" }}>
              {activeMeta.description}
            </span>
          </div>
        </div>

        <div className="panel-body" style={{ padding: 16 }}>
          {activeSection === "codex" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <SettingsSectionCard title="Yolo Mode" description="Auto-approve all agent actions. When enabled, agents never pause for confirmation." fullWidth>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <label style={{ position: "relative", display: "inline-block", width: 36, height: 20, flexShrink: 0 }}>
                  <input
                    type="checkbox"
                    checked={yoloMode}
                    onChange={(e) => void setYoloMode(e.target.checked)}
                    style={{ opacity: 0, width: 0, height: 0, position: "absolute" }}
                  />
                  <span
                    style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: 20,
                      background: yoloMode ? "var(--accent)" : "var(--bg-elevated)",
                      border: "1px solid var(--border-default)",
                      cursor: "pointer",
                      transition: "background 0.2s",
                    }}
                  />
                  <span
                    style={{
                      position: "absolute",
                      top: 3,
                      left: yoloMode ? 18 : 3,
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      background: "white",
                      transition: "left 0.2s",
                      pointerEvents: "none",
                    }}
                  />
                </label>
                <span style={{ fontSize: "var(--font-size-sm)", color: yoloMode ? "var(--text-primary)" : "var(--text-muted)" }}>
                  {yoloMode ? "Enabled — agents auto-approve everything" : "Disabled — agents respect per-agent approval mode"}
                </span>
              </div>
            </SettingsSectionCard>
            <SettingsSectionCard title="Codex CLI" description='Choose a custom binary path or fall back to "codex" from PATH.' fullWidth>
              <FieldRow label='Binary path (leave empty to use "codex" from PATH)'>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    className="input"
                    placeholder="codex"
                    value={draftCodexPath}
                    onChange={(e) => {
                      setDraftCodexPath(e.target.value);
                      setCodexStatus(null);
                    }}
                    style={{ flex: 1 }}
                  />
                  <button className="btn btn-ghost" onClick={() => void handleBrowseCodex()} style={{ flexShrink: 0 }}>
                    Browse…
                  </button>
                </div>
              </FieldRow>

              {codexStatus && (
                <div
                  style={{
                    fontSize: "var(--font-size-xs)",
                    color: codexStatus.ok ? "var(--text-success)" : "var(--text-error)",
                    padding: "6px 8px",
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-default)",
                    borderRadius: 4,
                    wordBreak: "break-all",
                  }}
                >
                  {codexStatus.ok ? "OK: " : "Error: "}
                  {codexStatus.msg}
                </div>
              )}

              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn btn-ghost" onClick={() => void handleTestCodex()}>
                  Test
                </button>
                <button className="btn btn-primary" onClick={handleSaveCodexPath}>
                  <Save size={12} />
                  Save
                </button>
              </div>
            </SettingsSectionCard>
            <SettingsSectionCard title="API Keys" description="Keys are stored in the local workspace store on this machine." fullWidth>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {["OPENAI_API_KEY", "MINIMAX_API_KEY"].map((key) => (
                  <FieldRow key={key} label={key}>
                    <input
                      id={key}
                      type="password"
                      className="input"
                      placeholder={`${key}…`}
                      value={apiKeys[key] ?? ""}
                      onChange={(e) => setApiKeys((prev) => ({ ...prev, [key]: e.target.value }))}
                    />
                  </FieldRow>
                ))}
              </div>
              <div>
                <button className="btn btn-primary" onClick={handleSaveApiKeys}>
                  <Save size={12} />
                  {saved ? "Saved" : "Save Keys"}
                </button>
              </div>
            </SettingsSectionCard>
            </div>
          )}

          {activeSection === "agents" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {agents.map((agent) => (
                <AgentEditor key={agent.id} agent={agent} usedModels={usedModels} onSave={handleSaveAgent} />
              ))}
            </div>
          )}

          {activeSection === "tasks" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <SettingsSectionCard title="Built-in templates" description="These templates are always available and cannot be modified." fullWidth>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {TASK_TEMPLATES.map((template) => (
                    <TemplateRow key={template.id} template={template} agents={agents} />
                  ))}
                </div>
              </SettingsSectionCard>

              <SettingsSectionCard title="Custom templates" description="Add your own reusable task templates." fullWidth>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {customTemplates.map((template) => (
                    <TemplateRow
                      key={template.id}
                      template={template}
                      agents={agents}
                      onEdit={() => {
                        setEditingTemplate(template);
                        setShowAddForm(false);
                      }}
                      onDelete={() => void removeTemplate(template.id)}
                    />
                  ))}
                  {customTemplates.length === 0 && !showAddForm && (
                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", padding: "8px 0" }}>
                      No custom templates yet.
                    </div>
                  )}
                </div>

                {editingTemplate && (
                  <TemplateEditor
                    initial={editingTemplate}
                    agents={agents}
                    onSave={async (t) => {
                      await updateTemplate({ ...t, id: editingTemplate.id, isCustom: true });
                      setEditingTemplate(null);
                    }}
                    onCancel={() => setEditingTemplate(null)}
                  />
                )}

                {showAddForm && (
                  <TemplateEditor
                    agents={agents}
                    onSave={async (t) => {
                      await addTemplate(t);
                      setShowAddForm(false);
                    }}
                    onCancel={() => setShowAddForm(false)}
                  />
                )}

                {!showAddForm && !editingTemplate && (
                  <div>
                    <button className="btn btn-ghost" onClick={() => setShowAddForm(true)}>
                      + Add template
                    </button>
                  </div>
                )}
              </SettingsSectionCard>
            </div>
          )}

          {activeSection === "prompts" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <SettingsSectionCard
                title="Project instruction sources"
                description="These are not directly editable here, but they affect every agent run."
                fullWidth
              >
                <ReadOnlyPromptField
                  label="Repository instructions"
                  value={
                    projectPath
                      ? `.actly/AGENTS.md or AGENTS.md in ${projectPath}`
                      : ".actly/AGENTS.md or AGENTS.md in the active workspace"
                  }
                  rows={2}
                />
                <ReadOnlyPromptField
                  label="Actly runtime behavior"
                  value={
                    "Actly combines the agent system prompt and the role workflow prompt, then appends them under \"Agent instructions:\" before sending the turn to Codex."
                  }
                  rows={3}
                />
              </SettingsSectionCard>

              {agents.map((agent) => (
                <PromptInspector key={agent.id} agent={agent} />
              ))}
            </div>
          )}
        </div>
      </section>

      <aside
        style={{
          width: 220,
          flexShrink: 0,
          borderLeft: "1px solid var(--border-default)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: "var(--bg-surface)",
        }}
      >
        <div className="panel-header" style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-default)" }}>
          <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Sections</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", padding: 8, gap: 4 }}>
          {SECTIONS.map(({ id, label, description, Icon }) => {
            const isActive = activeSection === id;
            return (
              <button
                key={id}
                onClick={() => setActiveSection(id)}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  width: "100%",
                  padding: "10px 10px",
                  background: isActive ? "var(--bg-active)" : "transparent",
                  border: `1px solid ${isActive ? "var(--border-default)" : "transparent"}`,
                  borderRadius: 6,
                  color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <Icon size={16} />
                <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <span style={{ fontSize: "var(--font-size-sm)", fontWeight: 500 }}>{label}</span>
                  <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                    {description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

function SettingsSectionCard({
  title,
  description,
  fullWidth,
  children,
}: {
  title?: string;
  description?: string;
  fullWidth?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        width: "100%",
        maxWidth: fullWidth ? "none" : undefined,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 14,
        border: "1px solid var(--border-default)",
        borderRadius: 6,
        background: "var(--bg-surface)",
      }}
    >
      {(title || description) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {title && (
            <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 600, color: "var(--text-primary)" }}>
              {title}
            </div>
          )}
          {description && (
            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
              {description}
            </div>
          )}
        </div>
      )}
      {children}
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
  const [expanded, setExpanded] = useState(agent.role === "builder");

  const update = <K extends keyof Agent>(key: K, value: Agent[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  return (
    <SettingsSectionCard fullWidth>
      <button
        onClick={() => setExpanded((value) => !value)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          padding: 0,
          background: "transparent",
          border: "none",
          color: "inherit",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <div style={{ display: "flex", flex: 1, minWidth: 0, alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: "var(--font-size-sm)", fontWeight: 600, color: "var(--text-primary)" }}>
            {agent.name}
          </span>
          <span className={`badge badge-${agent.role === "builder" ? "in_progress" : agent.role === "initializer" ? "icebox" : "todo"}`}>
            {agent.role}
          </span>
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
            {draft.model} · {draft.provider} · {draft.approval_mode}
          </span>
        </div>
      </button>

      {expanded && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <FieldRow label="Model">
              <select value={draft.model} onChange={(e) => update("model", e.target.value)} className="input">
                {usedModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </FieldRow>

            <FieldRow label="Provider">
              <select value={draft.provider} onChange={(e) => update("provider", e.target.value)} className="input">
                {PROVIDERS.map((provider) => (
                  <option key={provider} value={provider}>
                    {provider}
                  </option>
                ))}
              </select>
            </FieldRow>

            <FieldRow label="Approval">
              <select
                value={draft.approval_mode}
                onChange={(e) => update("approval_mode", e.target.value as Agent["approval_mode"])}
                className="input"
              >
                {APPROVAL_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
            </FieldRow>

            <FieldRow label="System Prompt">
              <textarea
                className="input"
                value={draft.system_prompt ?? ""}
                onChange={(e) => update("system_prompt", e.target.value || null)}
                rows={5}
                style={{ resize: "vertical", fontFamily: "var(--font-mono)" }}
                placeholder="Optional system prompt…"
              />
            </FieldRow>
          </div>

          <div>
            <button className="btn btn-primary" onClick={() => onSave(draft)}>
              <Save size={12} />
              Save
            </button>
          </div>
        </>
      )}
    </SettingsSectionCard>
  );
}

function PromptInspector({ agent }: { agent: Agent }) {
  const [expanded, setExpanded] = useState(agent.role === "initializer");
  const defaultSystemPrompt = getAgentDefaultSystemPrompt(agent) ?? "";
  const workflowPrompt = getAgentWorkflow(agent).executionPrompt;
  const effectiveSystemPrompt = agent.system_prompt?.trim() || defaultSystemPrompt;
  const combinedPrompt = [effectiveSystemPrompt, workflowPrompt].filter(Boolean).join("\n\n");

  return (
    <SettingsSectionCard fullWidth>
      <button
        onClick={() => setExpanded((value) => !value)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          padding: 0,
          background: "transparent",
          border: "none",
          color: "inherit",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <div style={{ display: "flex", flex: 1, minWidth: 0, alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: "var(--font-size-sm)", fontWeight: 600, color: "var(--text-primary)" }}>
            {agent.name}
          </span>
          <span className={`badge badge-${agent.role === "builder" ? "in_progress" : agent.role === "initializer" ? "icebox" : "todo"}`}>
            {agent.role}
          </span>
        </div>
      </button>

      {expanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <ReadOnlyPromptField
            label="System prompt"
            value={effectiveSystemPrompt || "No system prompt configured."}
          />
          <ReadOnlyPromptField
            label="Workflow prompt"
            value={workflowPrompt}
          />
          <ReadOnlyPromptField
            label="Combined Actly agent instructions"
            value={combinedPrompt || "No instructions configured."}
            rows={10}
          />
        </div>
      )}
    </SettingsSectionCard>
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
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <label
        style={{
          fontSize: "var(--font-size-xs)",
          color: "var(--text-secondary)",
          minWidth: 140,
          flexShrink: 0,
        }}
      >
        {label}
      </label>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

function TemplateRow({
  template,
  agents,
  onEdit,
  onDelete,
}: {
  template: TaskTemplate;
  agents: Agent[];
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const assignedAgent = agents.find((a) => a.id === template.assigned_agent_id);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "8px 10px",
        border: "1px solid var(--border-default)",
        borderRadius: 4,
        background: "var(--bg-base)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 500, color: "var(--text-primary)", marginBottom: 2 }}>
          {template.title}
        </div>
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {template.description.split("\n")[0]}
        </div>
        {assignedAgent && (
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", marginTop: 2 }}>
            Agent: {assignedAgent.name}
          </div>
        )}
      </div>
      {(onEdit || onDelete) && (
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          {onEdit && (
            <button
              className="btn btn-ghost"
              onClick={onEdit}
              title="Edit"
              style={{ padding: "2px 6px" }}
            >
              <Pencil size={12} />
            </button>
          )}
          {onDelete && (
            <button
              className="btn btn-ghost"
              onClick={onDelete}
              title="Delete"
              style={{ padding: "2px 6px", color: "var(--text-error)" }}
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TemplateEditor({
  initial,
  agents,
  onSave,
  onCancel,
}: {
  initial?: Omit<TaskTemplate, "id">;
  agents: Agent[];
  onSave: (t: Omit<TaskTemplate, "id">) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [assignedAgentId, setAssignedAgentId] = useState<string | null>(initial?.assigned_agent_id ?? null);

  const handleSave = async () => {
    if (!title.trim()) return;
    await onSave({ title: title.trim(), description, assigned_agent_id: assignedAgentId });
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "10px 12px",
        border: "1px solid var(--border-default)",
        borderRadius: 4,
        background: "var(--bg-base)",
      }}
    >
      <FieldRow label="Title">
        <input
          className="input"
          placeholder="Template title…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </FieldRow>
      <FieldRow label="Description">
        <textarea
          className="input"
          placeholder="Optional description…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          style={{ resize: "vertical" }}
        />
      </FieldRow>
      <FieldRow label="Assigned agent">
        <select
          className="input"
          value={assignedAgentId ?? ""}
          onChange={(e) => setAssignedAgentId(e.target.value || null)}
        >
          <option value="">None</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </FieldRow>
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn btn-primary" onClick={() => void handleSave()}>
          <Save size={12} />
          Save
        </button>
        <button className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function ReadOnlyPromptField({
  label,
  value,
  rows = 6,
}: {
  label: string;
  value: string;
  rows?: number;
}) {
  return (
    <FieldRow label={label}>
      <textarea
        className="input"
        value={value}
        readOnly
        rows={rows}
        style={{
          resize: "vertical",
          fontFamily: "var(--font-mono)",
          color: "var(--text-secondary)",
          background: "var(--bg-base)",
        }}
      />
    </FieldRow>
  );
}
