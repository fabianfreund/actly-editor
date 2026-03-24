import { fsCommands, type FsDirEntry } from "./tauri";

export interface ImportantFile {
  label: string;
  path: string;
  description: string;
  group: "root" | "docs";
}

const IMPORTANT_FILE_SPECS = [
  { relativePath: "README.md", label: "README", description: "Project overview and setup", group: "root" as const },
  { relativePath: "AGENTS.md", label: "AGENTS", description: "Agent guidance and repository context", group: "root" as const },
  { relativePath: "package.json", label: "package.json", description: "Scripts and package metadata", group: "root" as const },
  { relativePath: "docs/architecture.md", label: "Architecture", description: "System structure and data flow", group: "docs" as const },
  { relativePath: "docs/tasks.md", label: "Tasks", description: "Roadmap and tracked work", group: "docs" as const },
];

const MARKDOWN_EXTENSIONS = [".md", ".markdown", ".mdown"];

function normalize(path: string) {
  return path.replace(/\\/g, "/");
}

function mapEntries(entries: FsDirEntry[]) {
  return new Map(entries.map((entry) => [entry.name.toLowerCase(), entry]));
}

export function isMarkdownFile(path: string) {
  const lower = path.toLowerCase();
  return MARKDOWN_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function getFileName(path: string) {
  const normalized = normalize(path);
  return normalized.split("/").pop() ?? normalized;
}

export function isPathInsideProject(path: string, projectPath: string) {
  const normalizedPath = normalize(path);
  const normalizedProjectPath = normalize(projectPath).replace(/\/+$/, "");
  return normalizedPath === normalizedProjectPath || normalizedPath.startsWith(`${normalizedProjectPath}/`);
}

export function getRelativeProjectPath(path: string, projectPath: string) {
  const normalizedPath = normalize(path);
  const normalizedProjectPath = normalize(projectPath).replace(/\/+$/, "");
  if (normalizedPath === normalizedProjectPath) return ".";
  if (normalizedPath.startsWith(`${normalizedProjectPath}/`)) {
    return normalizedPath.slice(normalizedProjectPath.length + 1);
  }
  return normalizedPath;
}

export async function readProjectFile(path: string) {
  return fsCommands.readText(path);
}

export async function writeProjectFile(path: string, content: string) {
  return fsCommands.writeText(path, content);
}

export async function listImportantFiles(projectPath: string): Promise<ImportantFile[]> {
  const rootEntries = await fsCommands.listDir(projectPath).catch(() => []);
  const rootMap = mapEntries(rootEntries);

  let docsMap = new Map<string, FsDirEntry>();
  const docsDir = rootMap.get("docs");
  if (docsDir?.is_dir) {
    docsMap = mapEntries(await fsCommands.listDir(docsDir.path).catch(() => []));
  }

  const files: ImportantFile[] = [];

  for (const spec of IMPORTANT_FILE_SPECS) {
    if (spec.group === "root") {
      const entry = rootMap.get(spec.relativePath.toLowerCase());
      if (entry && !entry.is_dir) {
        files.push({
          label: spec.label,
          path: entry.path,
          description: spec.description,
          group: spec.group,
        });
      }
      continue;
    }

    const fileName = spec.relativePath.split("/").pop()?.toLowerCase() ?? spec.relativePath.toLowerCase();
    const entry = docsMap.get(fileName);
    if (entry && !entry.is_dir) {
      files.push({
        label: spec.label,
        path: entry.path,
        description: spec.description,
        group: spec.group,
      });
    }
  }

  return files;
}
