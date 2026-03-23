import { lazy, Suspense } from "react";

const ActionPanel = lazy(() => import("../panels/ActionPanel/index"));
const Terminal = lazy(() => import("../panels/Terminal/index"));

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

export default function LaunchMode() {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div
        style={{
          flexShrink: 0,
          borderBottom: "1px solid var(--border-default)",
          overflow: "auto",
          maxHeight: "50%",
        }}
      >
        <Suspense fallback={FALLBACK}>
          <ActionPanel />
        </Suspense>
      </div>
      <div style={{ flex: 1, overflow: "hidden", minHeight: 200 }}>
        <Suspense fallback={FALLBACK}>
          <Terminal />
        </Suspense>
      </div>
    </div>
  );
}
