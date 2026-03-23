export const SUPPORTED_MODELS = [
  "gpt-5.4-mini",
  "gpt-5.4",
  "gpt-5.3-codex",
  "o4-mini",
] as const;

export const LEGACY_MODEL_MIGRATIONS: Record<string, string> = {
  "codex-1": "gpt-5.4",
  "gpt-4o": "gpt-5.4-mini",
};

export function normalizeAgentModel(model: string): string {
  return LEGACY_MODEL_MIGRATIONS[model] ?? model;
}
