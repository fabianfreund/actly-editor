import { open } from "@tauri-apps/plugin-dialog";
import { useWorkspaceStore } from "../store/workspace";

export default function ProjectSplash() {
  const { openWorkspace } = useWorkspaceStore();

  const handleOpen = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") {
      openWorkspace(selected);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        gap: 24,
        background: "var(--bg-base)",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <h1
          style={{
            fontSize: 32,
            fontWeight: 700,
            color: "var(--text-primary)",
            margin: "0 0 8px",
            letterSpacing: "-0.02em",
          }}
        >
          Actly Editor
        </h1>
        <p style={{ color: "var(--text-secondary)", margin: 0, fontSize: "var(--font-size-md)" }}>
          Visual workspace for AI-assisted coding
        </p>
      </div>

      <button className="btn btn-primary" onClick={handleOpen} style={{ padding: "8px 20px", fontSize: 14 }}>
        Open project folder
      </button>

      <p style={{ color: "var(--text-muted)", fontSize: "var(--font-size-xs)", margin: 0 }}>
        Requires Codex CLI to be installed and in PATH
      </p>
    </div>
  );
}
