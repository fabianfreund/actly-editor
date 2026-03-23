/**
 * Typed wrappers around Tauri invoke() calls.
 * Keeps all command names in one place — easy to find and rename.
 */
import { invoke } from "@tauri-apps/api/core";

// ─── Codex ────────────────────────────────────────────────────────────────────

export const codexCommands = {
  checkPath: (path: string | null) =>
    invoke<string>("check_codex_path", { path }),

  startServer: (sessionId: string, projectPath: string, codexPath?: string | null) =>
    invoke<number>("start_codex_server", { sessionId, projectPath, codexPath: codexPath ?? null }),

  stopServer: (sessionId: string) =>
    invoke<void>("stop_codex_server", { sessionId }),

  getPort: (sessionId: string) =>
    invoke<number | null>("get_codex_port", { sessionId }),

  debugLog: (message: string) =>
    invoke<void>("debug_log", { message }),
};

// ─── Git ──────────────────────────────────────────────────────────────────────

export interface GitFile {
  path: string;
  status: "added" | "modified" | "deleted" | "untracked";
  staged: boolean;
}

export interface GitDiff {
  path: string;
  patch: string;
}

export interface GitBranch {
  name: string;
  is_current: boolean;
}

export const gitCommands = {
  status: (projectPath: string) =>
    invoke<GitFile[]>("git_status", { projectPath }),

  diff: (projectPath: string, staged: boolean) =>
    invoke<GitDiff[]>("git_diff", { projectPath, staged }),

  stage: (projectPath: string, paths: string[]) =>
    invoke<void>("git_stage", { projectPath, paths }),

  commit: (projectPath: string, message: string) =>
    invoke<string>("git_commit", { projectPath, message }),

  branches: (projectPath: string) =>
    invoke<GitBranch[]>("git_branches", { projectPath }),
};
