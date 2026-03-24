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

// ─── Terminal ────────────────────────────────────────────────────────────────

export const terminalCommands = {
  start: (
    sessionId: string,
    cwd: string,
    cols: number,
    rows: number,
    command?: string,
    args?: string[]
  ) =>
    invoke<void>("start_terminal_session", {
      sessionId,
      cwd,
      cols,
      rows,
      command: command ?? null,
      args: args ?? null,
    }),

  stop: (sessionId: string) =>
    invoke<void>("stop_terminal_session", { sessionId }),

  write: (sessionId: string, data: string) =>
    invoke<void>("write_terminal_session", { sessionId, data }),

  resize: (sessionId: string, cols: number, rows: number) =>
    invoke<void>("resize_terminal_session", { sessionId, cols, rows }),
};

export interface TerminalDataEvent {
  session_id: string;
  data: string;
}

export interface TerminalExitEvent {
  session_id: string;
  code: number;
}

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

export interface FsDirEntry {
  name: string;
  path: string;
  is_dir: boolean;
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

// ─── Filesystem ───────────────────────────────────────────────────────────────

export const fsCommands = {
  exists: (path: string) =>
    invoke<boolean>("fs_exists", { path }),

  readText: (path: string) =>
    invoke<string>("fs_read_text", { path }),

  writeText: (path: string, content: string) =>
    invoke<void>("fs_write_text", { path, content }),

  mkdir: (path: string) =>
    invoke<void>("fs_mkdir", { path }),

  listDir: (path: string) =>
    invoke<FsDirEntry[]>("fs_list_dir", { path }),
};
