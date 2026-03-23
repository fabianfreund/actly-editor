-- Add workspace scoping to tasks
ALTER TABLE tasks ADD COLUMN workspace_id TEXT DEFAULT NULL;
