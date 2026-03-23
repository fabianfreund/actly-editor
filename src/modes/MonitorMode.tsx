import { lazy, Suspense } from "react";

const Terminal = lazy(() => import("../panels/Terminal/index"));
const GitPanel = lazy(() => import("../panels/GitPanel/index"));

const FALLBACK = (
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
);

export default function MonitorMode() {
  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <div style={{ flex: 1, overflow: "hidden", borderRight: "1px solid var(--border-default)" }}>
        <Suspense fallback={FALLBACK}>
          <Terminal />
        </Suspense>
      </div>
      <div style={{ width: 300, overflow: "hidden", flexShrink: 0 }}>
        <Suspense fallback={FALLBACK}>
          <GitPanel />
        </Suspense>
      </div>
    </div>
  );
}
