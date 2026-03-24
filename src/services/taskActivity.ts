import type { Task, TaskStatus } from "../store/tasks";
import { dbAddTaskEvent, dbUpdateTaskStatus } from "./db";
import { useTasksStore } from "../store/tasks";

function statusLabel(status: TaskStatus): string {
  return status.replace(/_/g, " ");
}

export async function updateTaskStatusWithActivity(task: Task, status: TaskStatus): Promise<void> {
  if (task.status === status) return;

  const workspaceId = task.workspace_id ?? task.id;
  await dbUpdateTaskStatus(task.id, status);
  useTasksStore.getState().upsertTask({ ...task, status });
  await dbAddTaskEvent(task.id, workspaceId, "state_change", `Moved to ${statusLabel(status)}`).catch(() => null);
}
