/**
 * Action button registry.
 * Add new actions here — each entry becomes a button in the Action Panel.
 */
export interface ActionDef {
  id: string;
  label: string;
  command: string;
  args?: string[];
  description?: string;
}

export const ACTIONS: ActionDef[] = [
  {
    id: "dev",
    label: "Dev Server",
    command: "npm",
    args: ["run", "dev"],
    description: "Start the development server",
  },
  {
    id: "build",
    label: "Build",
    command: "npm",
    args: ["run", "build"],
    description: "Build for production",
  },
  {
    id: "test",
    label: "Test",
    command: "npm",
    args: ["test", "--", "--run"],
    description: "Run tests once",
  },
  {
    id: "lint",
    label: "Lint",
    command: "npm",
    args: ["run", "lint"],
    description: "Lint and check code style",
  },
  {
    id: "type-check",
    label: "Type Check",
    command: "npx",
    args: ["tsc", "--noEmit"],
    description: "TypeScript type checking",
  },
];
