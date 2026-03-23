import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  Actions,
  DockLocation,
  IJsonModel,
  Layout,
  Model,
  TabNode,
} from "flexlayout-react";
import "flexlayout-react/style/dark.css";
import { getPanelById, PANELS } from "../layout/panels.registry";
import MenuBar from "../components/MenuBar";
import { useWorkspaceStore } from "../store/workspace";
import { onFocusPanel } from "../services/layoutEvents";

const DEFAULT_LAYOUT: IJsonModel = {
  global: {
    tabSetMinWidth: 100,
    tabSetMinHeight: 100,
    borderMinSize: 100,
    splitterSize: 3,
    splitterExtra: 8,
  },
  borders: [],
  layout: {
    type: "row",
    weight: 100,
    children: [
      {
        type: "tabset",
        weight: 20,
        minWidth: 220,
        children: [{ type: "tab", name: "Tasks", component: "task-board" }],
      },
      {
        type: "column",
        weight: 80,
        children: [
          {
            type: "row",
            weight: 65,
            children: [
              {
                type: "tabset",
                weight: 50,
                children: [{ type: "tab", name: "Task Detail", component: "task-detail" }],
              },
              {
                type: "tabset",
                weight: 50,
                children: [{ type: "tab", name: "Agent", component: "agent-thread" }],
              },
            ],
          },
          {
            type: "row",
            weight: 35,
            children: [
              {
                type: "tabset",
                weight: 50,
                children: [{ type: "tab", name: "Terminal", component: "terminal" }],
              },
              {
                type: "tabset",
                weight: 25,
                children: [{ type: "tab", name: "Git", component: "git-panel" }],
              },
              {
                type: "tabset",
                weight: 25,
                children: [{ type: "tab", name: "Actions", component: "action-panel" }],
              },
            ],
          },
        ],
      },
    ],
  },
};

function getLayoutKey(workspaceId: string | null) {
  return workspaceId ? `actly:layout:${workspaceId}` : "actly:layout";
}

function loadModel(workspaceId: string | null): Model {
  try {
    const key = getLayoutKey(workspaceId);
    const saved =
      localStorage.getItem(key) ??
      (workspaceId ? localStorage.getItem("actly:layout") : null);
    if (saved) return Model.fromJson(JSON.parse(saved));
  } catch {
    // ignore
  }
  return Model.fromJson(DEFAULT_LAYOUT);
}

function getOpenPanelIds(model: Model): Set<string> {
  const ids = new Set<string>();
  model.visitNodes((node) => {
    if (node instanceof TabNode) {
      const comp = node.getComponent();
      if (comp) ids.add(comp);
    }
  });
  return ids;
}

const panelComponents: Record<string, ReturnType<typeof lazy>> = {};

function getPanelComponent(id: string) {
  if (!panelComponents[id]) {
    const def = getPanelById(id);
    if (def) panelComponents[id] = lazy(def.component);
  }
  return panelComponents[id];
}

export default function CustomMode() {
  const { activeId } = useWorkspaceStore();
  const [model] = useState<Model>(() => loadModel(activeId));
  const [openPanelIds, setOpenPanelIds] = useState<Set<string>>(() => getOpenPanelIds(model));
  const layoutRef = useRef<Layout>(null);

  const saveLayout = useCallback(() => {
    try {
      const key = getLayoutKey(activeId);
      localStorage.setItem(key, JSON.stringify(model.toJson()));
      setOpenPanelIds(getOpenPanelIds(model));
    } catch {
      // ignore
    }
  }, [model, activeId]);

  const activatePanel = useCallback(
    (panelId: string) => {
      let found: string | null = null;
      model.visitNodes((node) => {
        if (node instanceof TabNode && node.getComponent() === panelId) {
          found = node.getId();
        }
      });
      if (found) {
        model.doAction(Actions.selectTab(found));
      } else {
        const def = PANELS.find((p) => p.id === panelId);
        if (!def) return;
        const activeTabset = model.getActiveTabset(Model.MAIN_WINDOW_ID);
        const root = model.getRoot(Model.MAIN_WINDOW_ID);
        const targetId = activeTabset?.getId() ?? root.getChildren()[0]?.getId();
        if (!targetId) return;
        try {
          model.doAction(
            Actions.addNode(
              { type: "tab", name: def.label, component: def.id },
              targetId,
              DockLocation.CENTER,
              -1,
              true
            )
          );
          saveLayout();
        } catch {
          /* ignore */
        }
      }
    },
    [model, saveLayout]
  );

  useEffect(() => {
    onFocusPanel(activatePanel);
  }, [activatePanel]);

  const factory = useCallback((node: TabNode) => {
    const component = node.getComponent() ?? "";
    const PanelComponent = getPanelComponent(component);

    if (!PanelComponent) {
      return (
        <div
          className="panel-full panel-body"
          style={{ color: "var(--text-muted)", padding: 16 }}
        >
          Unknown panel: {component}
        </div>
      );
    }

    return (
      <Suspense
        fallback={
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--text-muted)",
              fontSize: "var(--font-size-sm)",
            }}
          >
            Loading…
          </div>
        }
      >
        <PanelComponent />
      </Suspense>
    );
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <MenuBar model={model} openPanelIds={openPanelIds} onLayoutChanged={saveLayout} />
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <Layout ref={layoutRef} model={model} factory={factory} onModelChange={saveLayout} />
      </div>
    </div>
  );
}
