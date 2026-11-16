import {
  ALL_WORKSPACE_MODULES,
  type WorkspaceModuleId,
} from "../lib/workspaces.js";
import type { HttpMethod, McpToolDef } from "./catalog.js";

export type McpUserPermissions = {
  canRead: boolean;
  canWrite: boolean;
  enabledModules: WorkspaceModuleId[];
};

/** Unlike org modules, empty means no module access. */
export function normalizeMcpModules(raw: string[] | null | undefined): WorkspaceModuleId[] {
  const seen = new Set<WorkspaceModuleId>();
  for (const m of raw ?? []) {
    if ((ALL_WORKSPACE_MODULES as readonly string[]).includes(m)) {
      seen.add(m as WorkspaceModuleId);
    }
  }
  return ALL_WORKSPACE_MODULES.filter((m) => seen.has(m));
}

export function isWriteMethod(method: HttpMethod): boolean {
  return method !== "GET";
}

/** Core tools (settings) need read/write only — no module gate. */
export function toolAllowed(
  def: McpToolDef,
  perms: McpUserPermissions,
  orgModules: WorkspaceModuleId[],
): boolean {
  if (isWriteMethod(def.method)) {
    if (!perms.canWrite) return false;
  } else if (!perms.canRead) {
    return false;
  }

  if (def.module === "core") return true;

  const orgOk = orgModules.includes(def.module);
  const userOk = perms.enabledModules.includes(def.module);
  return orgOk && userOk;
}

export function receiptUploadAllowed(perms: McpUserPermissions, orgModules: WorkspaceModuleId[]): boolean {
  return (
    perms.canWrite &&
    perms.enabledModules.includes("accounts") &&
    orgModules.includes("accounts")
  );
}

export function receiptReadAllowed(perms: McpUserPermissions, orgModules: WorkspaceModuleId[]): boolean {
  return (
    perms.canRead &&
    perms.enabledModules.includes("accounts") &&
    orgModules.includes("accounts")
  );
}
