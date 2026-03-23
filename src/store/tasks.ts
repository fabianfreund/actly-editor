import { create } from "zustand";

export type TaskStatus = "icebox" | "improving" | "planned" | "todo" | "in_progress" | "done" | "blocked" | "failed";

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  assigned_agent_id: string | null;
  refs_json: string; // JSON: Array<{ label: string; url: string }>
  created_at: string;
  updated_at: string;
}

export type TaskEventType =
  | "state_change"
  | "agent_message"
  | "user_comment"
  | "agent_question"
  | "approval";

export interface TaskEvent {
  id: string;
  task_id: string;
  type: TaskEventType;
  content: string;
  actor: string;
  metadata: string | null;
  created_at: string;
}

export interface TaskAttachment {
  id: string;
  task_id: string;
  name: string;
  path: string;
  mime: string;
  created_at: string;
}

interface TasksState {
  tasks: Task[];
  events: Record<string, TaskEvent[]>;
  attachments: Record<string, TaskAttachment[]>;
  setTasks: (tasks: Task[]) => void;
  upsertTask: (task: Task) => void;
  removeTask: (taskId: string) => void;
  setEvents: (taskId: string, events: TaskEvent[]) => void;
  addEvent: (event: TaskEvent) => void;
  setAttachments: (taskId: string, attachments: TaskAttachment[]) => void;
  addAttachment: (attachment: TaskAttachment) => void;
  removeAttachment: (taskId: string, attachmentId: string) => void;
}

export const useTasksStore = create<TasksState>((set) => ({
  tasks: [],
  events: {},
  attachments: {},

  setTasks: (tasks) => set({ tasks }),

  upsertTask: (task) =>
    set((s) => {
      const existing = s.tasks.findIndex((t) => t.id === task.id);
      if (existing >= 0) {
        const next = [...s.tasks];
        next[existing] = task;
        return { tasks: next };
      }
      return { tasks: [task, ...s.tasks] };
    }),

  removeTask: (taskId) =>
    set((s) => {
      const nextEvents = { ...s.events };
      const nextAttachments = { ...s.attachments };
      delete nextEvents[taskId];
      delete nextAttachments[taskId];
      return {
        tasks: s.tasks.filter((task) => task.id !== taskId),
        events: nextEvents,
        attachments: nextAttachments,
      };
    }),

  setEvents: (taskId, events) =>
    set((s) => ({ events: { ...s.events, [taskId]: events } })),

  addEvent: (event) =>
    set((s) => {
      const existing = s.events[event.task_id] ?? [];
      return { events: { ...s.events, [event.task_id]: [...existing, event] } };
    }),

  setAttachments: (taskId, attachments) =>
    set((s) => ({ attachments: { ...s.attachments, [taskId]: attachments } })),

  addAttachment: (attachment) =>
    set((s) => {
      const existing = s.attachments[attachment.task_id] ?? [];
      return { attachments: { ...s.attachments, [attachment.task_id]: [...existing, attachment] } };
    }),

  removeAttachment: (taskId, attachmentId) =>
    set((s) => {
      const existing = s.attachments[taskId] ?? [];
      return { attachments: { ...s.attachments, [taskId]: existing.filter((a) => a.id !== attachmentId) } };
    }),
}));
