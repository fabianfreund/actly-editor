import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";

export type NotificationKind =
  | "agent_message"
  | "turn_completed"
  | "approval_request"
  | "task_state_change";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  taskId: string;
  taskTitle: string;
  agentName?: string;
  content: string;
  read: boolean;
  createdAt: string;
  // For approval_request
  sessionId?: string;
  requestId?: string;
}

interface NotificationsState {
  notifications: AppNotification[];
  unreadCount: number;
  addNotification: (n: Omit<AppNotification, "id" | "read" | "createdAt">) => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
  dismissAll: () => void;
}

export const useNotificationsStore = create<NotificationsState>((set) => ({
  notifications: [],
  unreadCount: 0,

  addNotification: (n) =>
    set((s) => {
      const notification: AppNotification = {
        ...n,
        id: uuidv4(),
        read: false,
        createdAt: new Date().toISOString(),
      };
      const notifications = [notification, ...s.notifications];
      return { notifications, unreadCount: notifications.filter((x) => !x.read).length };
    }),

  markAllRead: () =>
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),

  markRead: (id) =>
    set((s) => {
      const notifications = s.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      );
      return { notifications, unreadCount: notifications.filter((x) => !x.read).length };
    }),

  dismissAll: () => set({ notifications: [], unreadCount: 0 }),
}));
