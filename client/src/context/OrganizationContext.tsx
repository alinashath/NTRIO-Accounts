import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiFetch } from "@/api/http";
import {
  applyDocumentTitle,
  clearOrganizationChoiceRequired,
  clearStoredActiveOrganization,
  getStoredActiveOrganizationId,
  getStoredOrganizationTitle,
  isOrganizationChoiceRequired,
  markOrganizationChoiceRequired,
  setStoredActiveOrganization,
  setStoredOrganizationTitle,
} from "@/lib/orgStorage";
import {
  ALL_WORKSPACE_MODULES,
  normalizeEnabledModules,
  type WorkspaceModuleId,
} from "@/lib/workspaces";

export type OrgOption = {
  id: string;
  title: string;
  enabled_modules?: WorkspaceModuleId[];
};

export type PendingOrgRequest = {
  id: string;
  organization_title: string;
  status: string;
  created_at: string;
  rejection_reason: string | null;
};

type Ctx = {
  ready: boolean;
  organizations: OrgOption[];
  activeOrganizationId: string | null;
  organizationTitle: string;
  /** Workspace modules enabled for the active organization. */
  enabledModules: WorkspaceModuleId[];
  needsSelection: boolean;
  /** No tenant membership yet (waiting for system admin). */
  needsApproval: boolean;
  /** Organizations could not be loaded (API down or request failed). */
  loadError: string | null;
  pendingRequest: PendingOrgRequest | null;
  isSystemAdmin: boolean;
  selectOrganization: (organizationId: string) => Promise<void>;
  refreshOrganizations: () => Promise<void>;
  requireOrgPickOnLogin: () => void;
  setOrganizationTitleLocal: (title: string) => void;
};

const OrganizationContext = createContext<Ctx | null>(null);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [organizations, setOrganizations] = useState<OrgOption[]>([]);
  const [activeOrganizationId, setActiveOrganizationId] = useState<string | null>(() =>
    isOrganizationChoiceRequired() ? null : getStoredActiveOrganizationId(),
  );
  const [organizationTitle, setOrganizationTitle] = useState(getStoredOrganizationTitle);
  const [enabledModules, setEnabledModules] = useState<WorkspaceModuleId[]>([
    ...ALL_WORKSPACE_MODULES,
  ]);
  const [pendingRequest, setPendingRequest] = useState<PendingOrgRequest | null>(null);
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const applyActive = useCallback((org: OrgOption) => {
    setActiveOrganizationId(org.id);
    setOrganizationTitle(org.title);
    setEnabledModules(normalizeEnabledModules(org.enabled_modules));
    setStoredActiveOrganization(org);
  }, []);

  const setOrganizationTitleLocal = useCallback((title: string) => {
    setOrganizationTitle(setStoredOrganizationTitle(title));
  }, []);

  useEffect(() => {
    applyDocumentTitle(organizationTitle);
  }, [organizationTitle]);

  const refreshOrganizations = useCallback(async () => {
    let data: {
      organizations: OrgOption[];
      active_organization_id: string | null;
      enabled_modules?: WorkspaceModuleId[];
      pending_request?: PendingOrgRequest | null;
      is_system_admin?: boolean;
    };
    try {
      data = await apiFetch<{
      organizations: OrgOption[];
      active_organization_id: string | null;
      enabled_modules?: WorkspaceModuleId[];
      pending_request?: PendingOrgRequest | null;
      is_system_admin?: boolean;
    }>("/api/settings/organizations");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load organizations");
      throw e;
    }

    setLoadError(null);
    const orgs = data.organizations ?? [];
    setOrganizations(orgs);
    setPendingRequest(data.pending_request ?? null);
    setIsSystemAdmin(Boolean(data.is_system_admin));

    const stored = getStoredActiveOrganizationId();
    const storedOrg = stored ? orgs.find((o) => o.id === stored) : undefined;

    if (orgs.length === 0) {
      clearOrganizationChoiceRequired();
      setActiveOrganizationId(null);
      setEnabledModules([...ALL_WORKSPACE_MODULES]);
      return;
    }

    if (orgs.length === 1) {
      clearOrganizationChoiceRequired();
      applyActive(orgs[0]);
      if (data.enabled_modules?.length) {
        setEnabledModules(normalizeEnabledModules(data.enabled_modules));
      }
      if (orgs[0].id !== data.active_organization_id) {
        void apiFetch("/api/settings/active-organization", {
          method: "POST",
          body: JSON.stringify({ organization_id: orgs[0].id }),
        }).catch(() => {});
      }
      return;
    }

    if (isOrganizationChoiceRequired()) {
      clearStoredActiveOrganization();
      setActiveOrganizationId(null);
      if (data.enabled_modules?.length) {
        setEnabledModules(normalizeEnabledModules(data.enabled_modules));
      }
      return;
    }

    if (storedOrg) {
      applyActive(storedOrg);
      if (data.enabled_modules?.length && data.active_organization_id === storedOrg.id) {
        setEnabledModules(normalizeEnabledModules(data.enabled_modules));
      }
      return;
    }

    setActiveOrganizationId(null);
    if (data.enabled_modules?.length) {
      setEnabledModules(normalizeEnabledModules(data.enabled_modules));
    }
  }, [applyActive]);

  useEffect(() => {
    let cancelled = false;
    void refreshOrganizations()
      .catch((e: unknown) => {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Could not load organizations");
        }
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshOrganizations]);

  const selectOrganization = useCallback(
    async (organizationId: string) => {
      const data = await apiFetch<{
        organization_id: string;
        organization_title: string;
        enabled_modules?: WorkspaceModuleId[];
      }>("/api/settings/active-organization", {
        method: "POST",
        body: JSON.stringify({ organization_id: organizationId }),
      });
      clearOrganizationChoiceRequired();
      applyActive({
        id: data.organization_id,
        title: data.organization_title,
        enabled_modules: data.enabled_modules,
      });
      await refreshOrganizations().catch(() => {});
    },
    [applyActive, refreshOrganizations],
  );

  const requireOrgPickOnLogin = useCallback(() => {
    markOrganizationChoiceRequired();
    setActiveOrganizationId(null);
  }, []);

  const needsApproval = ready && !loadError && organizations.length === 0;
  const needsSelection =
    ready &&
    organizations.length > 1 &&
    !organizations.some((o) => o.id === activeOrganizationId);

  const value = useMemo(
    () => ({
      ready,
      organizations,
      activeOrganizationId,
      organizationTitle,
      enabledModules,
      needsSelection,
      needsApproval,
      loadError,
      pendingRequest,
      isSystemAdmin,
      selectOrganization,
      refreshOrganizations,
      requireOrgPickOnLogin,
      setOrganizationTitleLocal,
    }),
    [
      ready,
      organizations,
      activeOrganizationId,
      organizationTitle,
      enabledModules,
      needsSelection,
      needsApproval,
      loadError,
      pendingRequest,
      isSystemAdmin,
      selectOrganization,
      refreshOrganizations,
      requireOrgPickOnLogin,
      setOrganizationTitleLocal,
    ],
  );

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
}

export function useOrganization() {
  const v = useContext(OrganizationContext);
  if (!v) {
    throw new Error("useOrganization must be used inside OrganizationProvider");
  }
  return v;
}
