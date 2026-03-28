/**
 * Helpers for reading/writing the .actly project folder.
 * Uses Rust-side Tauri commands (fs_helpers) to avoid plugin-fs scope issues.
 */
import { invoke } from "@tauri-apps/api/core";
import type { ActionDef } from "../panels/ActionPanel/index";

const fsExists = (path: string): Promise<boolean> => invoke<boolean>("fs_exists", { path }).catch(() => false);
const fsReadText = (path: string): Promise<string> => invoke("fs_read_text", { path });
const fsWriteText = (path: string, content: string): Promise<void> =>
  invoke("fs_write_text", { path, content });
const fsMkdir = (path: string): Promise<void> => invoke("fs_mkdir", { path });

export function actlyDir(projectPath: string) {
  return `${projectPath}/.actly`;
}

export async function hasActlyFolder(projectPath: string): Promise<boolean> {
  return fsExists(actlyDir(projectPath));
}

// ─── Scaffold ─────────────────────────────────────────────────────────────────

const AGENTS_MD = (name: string) => `\
# AGENTS.md — ${name}

This file is the primary reference for AI agents working on this project.
It is automatically generated and maintained by Actly.

## Project Overview

> _Run the AI initialization to populate this section._

## Key Files & Directories

> _Run the AI initialization to populate this section._

## Architecture

See [docs/architecture.md](docs/architecture.md) for the full architecture overview.

## Coding Guidelines

- Read the architecture docs before making changes.
- Prefer small, focused commits.
- Check existing patterns before introducing new dependencies.

## References

| Document | Description |
|---|---|
| [docs/architecture.md](docs/architecture.md) | System architecture and data flow |
| [docs/tasks.md](docs/tasks.md) | Task backlog and roadmap |
`;

const ARCHITECTURE_MD = `\
# Architecture

> _Run the AI initialization to populate this section._
`;

const TASKS_MD = `\
# Tasks & Roadmap

> _Tasks are managed in Actly. This file is a reference export._
`;

export async function scaffoldActlyFolder(projectPath: string): Promise<void> {
  const dir = actlyDir(projectPath);
  const docsDir = `${dir}/docs`;

  await fsMkdir(dir);
  await fsMkdir(docsDir);

  const name = projectPath.split("/").filter(Boolean).pop() ?? "Project";
  await fsWriteText(`${dir}/AGENTS.md`, AGENTS_MD(name));
  await fsWriteText(`${docsDir}/architecture.md`, ARCHITECTURE_MD);
  await fsWriteText(`${docsDir}/tasks.md`, TASKS_MD);
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export async function readActlyActions(projectPath: string): Promise<ActionDef[] | null> {
  try {
    const raw = await fsReadText(`${actlyDir(projectPath)}/actions.json`);
    return JSON.parse(raw) as ActionDef[];
  } catch {
    return null;
  }
}

export async function writeActlyActions(projectPath: string, actions: ActionDef[]): Promise<void> {
  await fsWriteText(`${actlyDir(projectPath)}/actions.json`, JSON.stringify(actions, null, 2));
}

// ─── Script detection ─────────────────────────────────────────────────────────

export async function detectProjectScripts(projectPath: string): Promise<ActionDef[]> {
  const actions: ActionDef[] = [];

  // package.json
  try {
    const raw = await fsReadText(`${projectPath}/package.json`);
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
    if (pkg.scripts) {
      const priority = ["dev", "start", "build", "test", "lint", "typecheck", "type-check", "preview", "format"];
      const scriptNames = [
        ...priority.filter((k) => k in pkg.scripts!),
        ...Object.keys(pkg.scripts).filter((k) => !priority.includes(k)),
      ];
      for (const name of scriptNames) {
        actions.push({
          id: `npm:${name}`,
          label: name.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          command: "npm",
          args: ["run", name],
        });
      }
    }
  } catch {
    // no package.json
  }

  // Makefile targets
  if (actions.length === 0) {
    try {
      const raw = await fsReadText(`${projectPath}/Makefile`);
      const targets = raw
        .split("\n")
        .map((l) => l.match(/^([a-zA-Z][a-zA-Z0-9_-]*):/)?.[1])
        .filter(Boolean) as string[];
      for (const t of targets.slice(0, 12)) {
        actions.push({
          id: `make:${t}`,
          label: t.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          command: "make",
          args: [t],
        });
      }
    } catch {
      // no Makefile
    }
  }

  return actions;
}
