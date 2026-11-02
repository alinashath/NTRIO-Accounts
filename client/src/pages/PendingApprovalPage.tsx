import { Button, Card } from "@/components/ui";
import { useOrganization } from "@/context/OrganizationContext";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/auth";

export function PendingApprovalPage() {
  const { pendingRequest, refreshOrganizations, isSystemAdmin } = useOrganization();
  const setSession = useAuthStore((s) => s.setSession);

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-4 py-8">
      <div className="mb-6 text-center">
        <h1 className="text-page-title text-ink">Awaiting approval</h1>
        <p className="mt-1 text-caption">
          New organizations must be approved by the system admin before you can work in the app.
        </p>
      </div>

      <Card className="space-y-3">
        {pendingRequest ? (
          <>
            <p className="text-sm text-ink">
              <span className="font-semibold">Organization:</span> {pendingRequest.organization_title}
            </p>
            <p className="text-sm text-ink">
              <span className="font-semibold">Status:</span> {pendingRequest.status}
            </p>
            {pendingRequest.status === "rejected" && pendingRequest.rejection_reason ? (
              <p className="text-sm text-debit">Reason: {pendingRequest.rejection_reason}</p>
            ) : null}
            <p className="text-caption">
              Submitted {new Date(pendingRequest.created_at).toLocaleString()}
            </p>
          </>
        ) : (
          <p className="text-caption">
            No organization membership found. Ask the system admin to approve your setup request, or
            to add your account to an existing organization.
          </p>
        )}

        <div className="flex flex-col gap-2 pt-2">
          <Button type="button" onClick={() => void refreshOrganizations()}>
            Check status
          </Button>
          {isSystemAdmin ? (
            <Button type="button" variant="secondary" onClick={() => (window.location.href = "/admin")}>
              Open admin area
            </Button>
          ) : null}
          <Button type="button" variant="ghost" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </Card>
    </div>
  );
}
