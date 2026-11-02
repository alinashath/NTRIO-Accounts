import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { apiFetch } from "@/api/http";
import { Button, Card, TextField } from "@/components/ui";
import { useOrganization } from "@/context/OrganizationContext";
import {
  ALL_WORKSPACE_MODULES,
  WORKSPACE_META,
  type WorkspaceModuleId,
} from "@/lib/workspaces";

type OrgRequest = {
  id: string;
  requester_email: string;
  organization_title: string;
  contact_name: string | null;
  status: string;
  rejection_reason: string | null;
  created_at: string;
};

type AdminOrg = {
  id: string;
  title: string;
  enabled_modules: WorkspaceModuleId[];
  member_count: number;
  member_emails?: (string | null)[];
  created_at: string;
};

export function AdminOrgRequestsPage() {
  const { isSystemAdmin, ready, refreshOrganizations } = useOrganization();
  const [rows, setRows] = useState<OrgRequest[]>([]);
  const [orgs, setOrgs] = useState<AdminOrg[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [list, orgPayload] = await Promise.all([
        apiFetch<OrgRequest[]>("/api/admin/org-requests?status=pending"),
        apiFetch<{ organizations: AdminOrg[] }>("/api/admin/organizations"),
      ]);
      setRows(list);
      setOrgs(orgPayload.organizations ?? []);
    } catch (e) {
      setRows([]);
      setOrgs([]);
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    if (ready && isSystemAdmin) void refresh();
  }, [ready, isSystemAdmin, refresh]);

  async function toggleModule(org: AdminOrg, moduleId: WorkspaceModuleId) {
    const has = org.enabled_modules.includes(moduleId);
    const next = has
      ? org.enabled_modules.filter((m) => m !== moduleId)
      : [...org.enabled_modules, moduleId];
    if (next.length === 0) {
      setError("Keep at least one workspace module enabled.");
      return;
    }
    setBusyId(org.id);
    setError(null);
    try {
      const updated = await apiFetch<{ id: string; enabled_modules: WorkspaceModuleId[] }>(
        `/api/admin/organizations/${org.id}/modules`,
        {
          method: "PATCH",
          body: JSON.stringify({ enabled_modules: next }),
        },
      );
      setOrgs((prev) =>
        prev.map((o) =>
          o.id === org.id ? { ...o, enabled_modules: updated.enabled_modules } : o,
        ),
      );
      await refreshOrganizations().catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update modules");
    } finally {
      setBusyId(null);
    }
  }

  if (!ready) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center text-muted-label">Loading…</div>
    );
  }

  if (!isSystemAdmin) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <p className="text-sm text-debit">Dedicated admin area — system admin only.</p>
        <Link to="/" className="mt-4 inline-block font-semibold text-action">
          Back
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[960px] space-y-6 px-4 py-6">
      <div className="flex items-start gap-2">
        <Link
          to="/"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm text-ink hover:bg-neutral-bg"
          aria-label="Back"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={1.8} />
        </Link>
        <div>
          <h1 className="text-page-title text-ink">System admin</h1>
          <p className="mt-0.5 text-caption">
            Dedicated admin area — approve tenants and enable workspace modules.
          </p>
        </div>
      </div>

      {error ? <p className="text-sm text-debit">{error}</p> : null}

      <section className="space-y-2">
        <h2 className="text-section text-ink">Organization setup requests</h2>
        <Card className="overflow-hidden p-0">
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="space-y-3 px-4 py-4">
                <div>
                  <p className="text-sm font-semibold text-ink">{r.organization_title}</p>
                  <p className="text-caption">
                    {r.requester_email}
                    {r.contact_name ? ` · ${r.contact_name}` : ""}
                  </p>
                  <p className="text-caption">{new Date(r.created_at).toLocaleString()}</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    className="sm:flex-1"
                    disabled={busyId !== null}
                    onClick={() => {
                      setBusyId(r.id);
                      setError(null);
                      void apiFetch(`/api/admin/org-requests/${r.id}/approve`, {
                        method: "POST",
                        body: "{}",
                      })
                        .then(() => refresh())
                        .catch((e) => setError(e instanceof Error ? e.message : "Failed"))
                        .finally(() => setBusyId(null));
                    }}
                  >
                    {busyId === r.id ? "Working…" : "Approve"}
                  </Button>
                  <div className="flex flex-1 flex-col gap-2 sm:flex-row">
                    <TextField
                      label="Reject reason (optional)"
                      value={rejectReasons[r.id] ?? ""}
                      onChange={(e) =>
                        setRejectReasons((prev) => ({ ...prev, [r.id]: e.target.value }))
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-debit sm:self-end"
                      disabled={busyId !== null}
                      onClick={() => {
                        setBusyId(r.id);
                        setError(null);
                        void apiFetch(`/api/admin/org-requests/${r.id}/reject`, {
                          method: "POST",
                          body: JSON.stringify({ reason: rejectReasons[r.id] || undefined }),
                        })
                          .then(() => refresh())
                          .catch((e) => setError(e instanceof Error ? e.message : "Failed"))
                          .finally(() => setBusyId(null));
                      }}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              </li>
            ))}
            {!rows.length ? (
              <li className="px-4 py-8 text-center text-caption">No pending organization requests.</li>
            ) : null}
          </ul>
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className="text-section text-ink">Workspace modules</h2>
        <p className="text-caption">
          Enable or disable modules per organization. If only one module is on, users open it
          directly.
        </p>
        <Card className="overflow-hidden p-0">
          <ul className="divide-y divide-border">
            {orgs.map((org) => (
              <li key={org.id} className="space-y-3 px-4 py-4">
                <div>
                  <p className="text-sm font-semibold text-ink">{org.title}</p>
                  <p className="text-caption">
                    {(org.member_emails ?? []).filter(Boolean).join(" · ") ||
                      `${org.member_count} member${org.member_count === 1 ? "" : "s"}`}
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {ALL_WORKSPACE_MODULES.map((moduleId) => {
                    const on = org.enabled_modules.includes(moduleId);
                    return (
                      <button
                        key={moduleId}
                        type="button"
                        disabled={busyId === org.id}
                        onClick={() => void toggleModule(org, moduleId)}
                        className={`flex min-h-11 items-center justify-between rounded-sm border px-3 text-left text-sm font-semibold touch-manipulation ${
                          on
                            ? "border-ink bg-ink text-white"
                            : "border-border bg-surface text-ink hover:bg-neutral-bg"
                        }`}
                        aria-pressed={on}
                      >
                        <span>{WORKSPACE_META[moduleId].title}</span>
                        <span className="text-caption font-medium opacity-80">
                          {on ? "On" : "Off"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
            {!orgs.length ? (
              <li className="px-4 py-8 text-center text-caption">No organizations yet.</li>
            ) : null}
          </ul>
        </Card>
      </section>
    </div>
  );
}
