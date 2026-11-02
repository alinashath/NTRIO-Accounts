import { useEffect, useMemo } from "react";
import { BedDouble, Package, UtensilsCrossed, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ListRow, PanelCard } from "@/components/design";
import { Button } from "@/components/ui";
import { useOrganization } from "@/context/OrganizationContext";
import { ALL_WORKSPACE_MODULES, WORKSPACE_META, type WorkspaceModuleId } from "@/lib/workspaces";

const ICONS: Record<WorkspaceModuleId, typeof Wallet> = {
  accounts: Wallet,
  occupancy: BedDouble,
  kitchen: UtensilsCrossed,
  stock: Package,
};

export function HubPage() {
  const navigate = useNavigate();
  const {
    ready,
    organizationTitle,
    organizations,
    requireOrgPickOnLogin,
    isSystemAdmin,
    enabledModules,
    needsSelection,
  } = useOrganization();

  const visible = useMemo(
    () => ALL_WORKSPACE_MODULES.filter((id) => enabledModules.includes(id)),
    [enabledModules],
  );
  const singlePath = visible.length === 1 ? WORKSPACE_META[visible[0]].to : null;

  useEffect(() => {
    if (!ready || needsSelection || !singlePath || !visible[0]) return;
    localStorage.setItem("ntrio_workspace", visible[0]);
    navigate(singlePath, { replace: true });
  }, [ready, needsSelection, singlePath, visible, navigate]);

  if (!ready || needsSelection) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center text-muted-label">Loading…</div>
    );
  }

  if (visible.length <= 1) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center text-muted-label">Opening…</div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[960px] flex-col px-4 pb-8 pt-[max(0.5rem,env(safe-area-inset-top,0px))]">
      <header className="-mx-4 mb-6 border-b border-border bg-surface px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-ink">{organizationTitle}</p>
            <h1 className="mt-1 text-page-title text-ink">Workspaces</h1>
            <p className="mt-1 text-caption">
              {visible.map((id) => WORKSPACE_META[id].title).join(" · ")}
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-1">
            {isSystemAdmin ? (
              <Button type="button" variant="ghost" onClick={() => navigate("/admin")}>
                Admin
              </Button>
            ) : null}
            {organizations.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  requireOrgPickOnLogin();
                  navigate("/select-organization");
                }}
              >
                Switch org
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-4">
        <PanelCard title="Open">
          {visible.map((id) => {
            const meta = WORKSPACE_META[id];
            const Icon = ICONS[id];
            return (
              <ListRow
                key={id}
                primary={meta.title}
                secondary={meta.description}
                right={
                  <span
                    className="inline-flex min-h-11 min-w-11 items-center justify-center text-muted-label"
                    aria-hidden
                  >
                    <Icon className="h-5 w-5" strokeWidth={1.8} />
                  </span>
                }
                onClick={() => {
                  localStorage.setItem("ntrio_workspace", id);
                  navigate(meta.to);
                }}
              />
            );
          })}
        </PanelCard>
      </div>
    </div>
  );
}
