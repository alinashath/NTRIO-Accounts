import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Button, Card } from "@/components/ui";
import { useOrganization } from "@/context/OrganizationContext";

export function SelectOrganizationPage() {
  const navigate = useNavigate();
  const { ready, organizations, selectOrganization, activeOrganizationId, needsSelection } =
    useOrganization();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!ready) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-ground text-muted-label">
        Loading organizations…
      </div>
    );
  }

  if (!needsSelection && activeOrganizationId) {
    return <Navigate to="/" replace />;
  }

  if (organizations.length === 0) {
    return <Navigate to="/" replace />;
  }

  if (organizations.length === 1) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center px-4 py-8">
      <div className="mb-6 text-center">
        <h1 className="text-page-title text-ink">Choose organization</h1>
        <p className="mt-1 text-caption">
          This account belongs to more than one organization. Pick which one to work in.
        </p>
      </div>

      {error ? <p className="mb-3 text-sm text-debit">{error}</p> : null}

      <Card className="overflow-hidden p-0">
        <ul className="divide-y divide-border">
          {organizations.map((org) => (
            <li key={org.id}>
              <button
                type="button"
                disabled={busyId !== null}
                className="flex min-h-11 w-full touch-manipulation items-center justify-between gap-3 px-4 py-3 text-left hover:bg-neutral-bg/60 disabled:opacity-50"
                onClick={() => {
                  setError(null);
                  setBusyId(org.id);
                  void selectOrganization(org.id)
                    .then(() => navigate("/", { replace: true }))
                    .catch((e) => setError(e instanceof Error ? e.message : "Failed"))
                    .finally(() => setBusyId(null));
                }}
              >
                <span className="text-sm font-semibold uppercase tracking-[0.06em] text-ink">
                  {org.title}
                </span>
                <span className="text-caption">
                  {busyId === org.id ? "Opening…" : "Continue"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      {!needsSelection && activeOrganizationId ? (
        <Button
          type="button"
          variant="ghost"
          className="mt-4 w-full"
          onClick={() => navigate("/", { replace: true })}
          disabled={busyId !== null}
        >
          Cancel
        </Button>
      ) : null}
    </div>
  );
}
