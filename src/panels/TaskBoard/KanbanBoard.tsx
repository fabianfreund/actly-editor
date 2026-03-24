import { useEffect } from "react";
import { useTasksStore, type TaskStatus } from "../../store/tasks";
import { useAgentsStore } from "../../store/agents";
import { useWorkspaceStore } from "../../store/workspace";
import { dbListTasks, dbCreateTask, dbListAgents, dbListSessions } from "../../services/db";
import { useMemo, useCallback } from "react";
import KanbanColumn from "./KanbanColumn";
import { getTaskRunState } from "../../components/TaskRunState";

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "icebox", label: "Icebox" },
  { status: "planned", label: "Planned" },
  { status: "in_progress", label: "In Progress" },
  { status: "done", label: "Done" },
];

export default function KanbanBoard() {
  const { tasks, setTasks, upsertTask } = useTasksStore();
  const { agents, sessions, setAgents, setSessions } = useAgentsStore();
  const { activeTaskId, setActiveTaskId, projectPath } = useWorkspaceStore();

  const taskRunStates = useMemo(
    () => Object.fromEntries(tasks.map((task) => [task.id, getTaskRunState(task, sessions)])),
    [sessions]
  );

  useEffect(() => {
    if (projectPath) dbListTasks(projectPath).then(setTasks).catch(console.error);
    dbListAgents().then(setAgents).catch(console.error);
    dbListSessions().then(setSessions).catch(console.error);
  }, [projectPath, setTasks, setAgents, setSessions]);

  const handleTaskClick = useCallback((taskId: string) => {
    setActiveTaskId(taskId);
  }, [setActiveTaskId]);

  const handleAddTask = useCallback(async (title: string, status: TaskStatus) => {
    try {
      if (!projectPath) return;
      const task = await dbCreateTask(title, projectPath);
      // Override status if not the default
      const finalTask = status === "planned" ? task : { ...task, status };
      upsertTask(finalTask);
      setActiveTaskId(finalTask.id);
    } catch (e) {
      console.error("Failed to create task:", e);
    }
  }, [projectPath, upsertTask, setActiveTaskId]);

  return (
    <div
      onClick={() => setActiveTaskId(null)}
      style={{
        display: "flex",
        gap: 12,
        padding: 16,
        height: "100%",
        overflowX: "auto",
        overflowY: "hidden",
        alignItems: "flex-start",
      }}
    >
      {COLUMNS.map(({ status, label }) => (
        <KanbanColumn
          key={status}
          title={label}
          status={status}
          tasks={tasks.filter((t) => t.status === status)}
          agents={agents}
          activeTaskId={activeTaskId}
          taskRunStates={taskRunStates}
          onTaskClick={handleTaskClick}
          onAddTask={handleAddTask}
        />
      ))}
    </div>
  );
}
