-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'todo',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Task timeline events
CREATE TABLE IF NOT EXISTS task_events (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    actor TEXT NOT NULL DEFAULT 'user',
    metadata TEXT DEFAULT NULL,
    created_at TEXT NOT NULL
);

-- Agent definitions
CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT 'gpt-4o',
    provider TEXT NOT NULL DEFAULT 'openai',
    approval_mode TEXT NOT NULL DEFAULT 'auto',
    system_prompt TEXT DEFAULT NULL,
    config_json TEXT DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Agent sessions (one per task + agent pair)
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    codex_thread_id TEXT DEFAULT NULL,
    worktree_path TEXT DEFAULT NULL,
    status TEXT NOT NULL DEFAULT 'idle',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Seed default agents
INSERT OR IGNORE INTO agents (id, name, role, model, provider, approval_mode, created_at, updated_at)
VALUES
    ('agent-planner', 'Planner', 'planner', 'gpt-4o', 'openai', 'auto',
     datetime('now'), datetime('now')),
    ('agent-builder', 'Bob (Builder)', 'builder', 'codex-1', 'openai', 'auto',
     datetime('now'), datetime('now'));
