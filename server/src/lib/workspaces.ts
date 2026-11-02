export const ALL_WORKSPACE_MODULES = ["accounts", "occupancy", "kitchen", "stock"] as const;
export type WorkspaceModuleId = (typeof ALL_WORKSPACE_MODULES)[number];

const MODULE_SET = new Set<string>(ALL_WORKSPACE_MODULES);

export function normalizeEnabledModules(raw: string[] | null | undefined): WorkspaceModuleId[] {
  const seen = new Set<WorkspaceModuleId>();
  for (const m of raw ?? []) {
    if (MODULE_SET.has(m)) seen.add(m as WorkspaceModuleId);
  }
  if (seen.size === 0) {
    return [...ALL_WORKSPACE_MODULES];
  }
  return ALL_WORKSPACE_MODULES.filter((m) => seen.has(m));
}

export function parseModulesInput(raw: unknown): WorkspaceModuleId[] {
  if (!Array.isArray(raw)) {
    throw Object.assign(new Error("enabled_modules must be an array"), { status: 400 });
  }
  if (raw.length === 0) {
    throw Object.assign(new Error("At least one workspace module must be enabled"), { status: 400 });
  }
  const normalized = normalizeEnabledModules(raw.map(String));
  const validCount = raw.filter((m) => MODULE_SET.has(String(m))).length;
  if (validCount === 0) {
    throw Object.assign(new Error("At least one workspace module must be enabled"), { status: 400 });
  }
  return normalized;
}
