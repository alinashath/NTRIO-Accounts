import type { WorkspaceModuleId } from "../../../shared/types";
import { ALL_WORKSPACE_MODULES, WORKSPACE_MODULE_PATH } from "../../../shared/types";

export type { WorkspaceModuleId };
export { ALL_WORKSPACE_MODULES, WORKSPACE_MODULE_PATH };

export const WORKSPACE_META: Record<
  WorkspaceModuleId,
  { title: string; description: string; to: string }
> = {
  accounts: {
    title: "Accounts",
    description: "Income, expenses, debts, and financial reports",
    to: WORKSPACE_MODULE_PATH.accounts,
  },
  occupancy: {
    title: "Occupancy",
    description: "Stay calendar, rooms, and guest occupancy",
    to: WORKSPACE_MODULE_PATH.occupancy,
  },
  kitchen: {
    title: "Kitchen",
    description: "Breakfast, lunch & dinner extras, server summary, KOT",
    to: WORKSPACE_MODULE_PATH.kitchen,
  },
  stock: {
    title: "Stock",
    description: "Inventory, shopping list, and cost reports",
    to: WORKSPACE_MODULE_PATH.stock,
  },
};

export function normalizeEnabledModules(raw: string[] | null | undefined): WorkspaceModuleId[] {
  const set = new Set(ALL_WORKSPACE_MODULES);
  const seen = new Set<WorkspaceModuleId>();
  for (const m of raw ?? []) {
    if (set.has(m as WorkspaceModuleId)) seen.add(m as WorkspaceModuleId);
  }
  if (seen.size === 0) return [...ALL_WORKSPACE_MODULES];
  return ALL_WORKSPACE_MODULES.filter((m) => seen.has(m));
}

export function pathForModule(id: WorkspaceModuleId): string {
  return WORKSPACE_MODULE_PATH[id];
}

export function moduleFromPath(pathname: string): WorkspaceModuleId | null {
  if (pathname === "/accounts" || pathname.startsWith("/accounts/")) return "accounts";
  if (pathname === "/occupancy" || pathname.startsWith("/occupancy/")) return "occupancy";
  if (pathname === "/kitchen" || pathname.startsWith("/kitchen/")) return "kitchen";
  if (pathname === "/stock" || pathname.startsWith("/stock/")) return "stock";
  return null;
}
