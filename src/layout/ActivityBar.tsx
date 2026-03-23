import { Bell, ClipboardList, Code2, Eye, Rocket, LayoutGrid, Settings } from "lucide-react";
import { useUiStore, type AppMode } from "../store/ui";
import { useNotificationsStore } from "../store/notifications";
import { useWorkspaceStore } from "../store/workspace";

interface BarItem {
  mode: AppMode;
  Icon: React.FC<{ size?: number }>;
  label: string;
}

const ITEMS: BarItem[] = [
  { mode: "activity", Icon: Bell, label: "Activity" },
  { mode: "plan", Icon: ClipboardList, label: "Plan" },
  { mode: "develop", Icon: Code2, label: "Develop" },
  { mode: "monitor", Icon: Eye, label: "Monitor" },
  { mode: "launch", Icon: Rocket, label: "Launch" },
  { mode: "custom", Icon: LayoutGrid, label: "Custom" },
];

export default function ActivityBar() {
  const { activeMode, setMode } = useUiStore();
  const { unreadCount } = useNotificationsStore();
  const { activeId } = useWorkspaceStore();

  return (
    <div className="activity-bar">
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {ITEMS.map(({ mode, Icon, label }) => (
          <button
            key={mode}
            className={`activity-bar-item${activeMode === mode ? " active" : ""}`}
            onClick={() => setMode(mode, activeId)}
            title={label}
          >
            <div style={{ position: "relative" }}>
              <Icon size={20} />
              {mode === "activity" && unreadCount > 0 && (
                <span className="activity-bar-badge">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      <div>
        <button
          className={`activity-bar-item${activeMode === "settings" ? " active" : ""}`}
          onClick={() => setMode("settings", activeId)}
          title="Settings"
        >
          <Settings size={20} />
        </button>
      </div>
    </div>
  );
}
