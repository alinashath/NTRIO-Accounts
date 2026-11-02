import { useEffect, useState } from "react";
import { apiFetch } from "@/api/http";
import { Button, Card, TextField } from "@/components/ui";
import { useDisplayCurrency } from "@/context/DisplayCurrencyContext";
import { useOrganization } from "@/context/OrganizationContext";
import { SettingsSubpage } from "./SettingsSubpage";

export function SettingsOrganizationPage() {
  const { refreshFx, setOrganizationTitleLocal: setDisplayOrgTitle } = useDisplayCurrency();
  const { organizationTitle, refreshOrganizations, setOrganizationTitleLocal } = useOrganization();
  const [orgInput, setOrgInput] = useState(organizationTitle);
  const [orgBusy, setOrgBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setOrgInput(organizationTitle);
  }, [organizationTitle]);

  return (
    <SettingsSubpage
      title="Organization"
      caption="Wordmark and browser tab title for this organization."
    >
      {error ? <p className="text-sm text-debit">{error}</p> : null}
      {saved ? <p className="text-sm text-credit">Title saved.</p> : null}

      <Card>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const title = orgInput.trim();
            if (!title) {
              setError("Enter an organization title.");
              setSaved(false);
              return;
            }
            if (title.length > 64) {
              setError("Organization title must be 64 characters or fewer.");
              setSaved(false);
              return;
            }
            setOrgBusy(true);
            setError(null);
            setSaved(false);
            void apiFetch("/api/settings", {
              method: "PATCH",
              body: JSON.stringify({ organization_title: title }),
            })
              .then(async () => {
                setOrganizationTitleLocal(title);
                setDisplayOrgTitle(title);
                setSaved(true);
                await refreshOrganizations().catch(() => {});
                return refreshFx();
              })
              .catch((err) => setError(err instanceof Error ? err.message : "Failed"))
              .finally(() => setOrgBusy(false));
          }}
        >
          <TextField
            label="Organization title"
            value={orgInput}
            onChange={(e) => setOrgInput(e.target.value)}
            maxLength={64}
            placeholder="NTRIO"
            autoComplete="organization"
          />
          <Button type="submit" className="w-full sm:w-auto" disabled={orgBusy}>
            {orgBusy ? "Saving…" : "Save title"}
          </Button>
        </form>
      </Card>
    </SettingsSubpage>
  );
}
