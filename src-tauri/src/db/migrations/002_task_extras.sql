-- Add agent assignment to tasks
ALTER TABLE tasks ADD COLUMN assigned_agent_id TEXT DEFAULT NULL;

-- Add references (JSON array of {label, url} objects)
ALTER TABLE tasks ADD COLUMN refs_json TEXT NOT NULL DEFAULT '[]';

-- Attachments table (file paths / URLs attached to a task)
CREATE TABLE IF NOT EXISTS task_attachments (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    mime TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
