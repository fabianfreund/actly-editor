-- Add workspace_id to remaining tables for multi-workspace support
-- Add indexes for common query patterns

-- Add workspace_id to sessions table
ALTER TABLE sessions ADD COLUMN workspace_id TEXT DEFAULT NULL;

-- Add workspace_id to task_events table
ALTER TABLE task_events ADD COLUMN workspace_id TEXT DEFAULT NULL;

-- Add workspace_id to task_attachments table
ALTER TABLE task_attachments ADD COLUMN workspace_id TEXT DEFAULT NULL;

-- Indexes for tasks table
CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_agent ON tasks(assigned_agent_id);

-- Indexes for task_events table
CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events(task_id);
CREATE INDEX IF NOT EXISTS idx_task_events_created ON task_events(created_at);
CREATE INDEX IF NOT EXISTS idx_task_events_workspace ON task_events(workspace_id);

-- Indexes for sessions table
CREATE INDEX IF NOT EXISTS idx_sessions_task ON sessions(task_id);
CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_id);

-- Index for task_attachments
CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON task_attachments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_attachments_workspace ON task_attachments(workspace_id);