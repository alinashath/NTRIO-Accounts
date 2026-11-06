import { useEffect, useState } from "react";
import { apiFetch } from "@/api/http";
import { Button, Card, TextField } from "@/components/ui";
import { useDisplayCurrency } from "@/context/DisplayCurrencyContext";
import { useOrganization } from "@/context/OrganizationContext";
import type { SettingsDto, TaxableActivityDto } from "../../../../shared/types";
import { SettingsSubpage } from "./SettingsSubpage";

type ActivityDraft = { number: string; name: string };

function toDrafts(list: TaxableActivityDto[] | undefined): ActivityDraft[] {
  if (!list?.length) return [{ number: "", name: "" }];
  return list.map((a) => ({ number: a.number, name: a.name ?? "" }));
}

export function SettingsOrganizationPage() {
  const { refreshFx, setOrganizationTitleLocal: setDisplayOrgTitle } = useDisplayCurrency();
  const { organizationTitle, refreshOrganizations, setOrganizationTitleLocal } = useOrganization();
  const [orgInput, setOrgInput] = useState(organizationTitle);
  const [gstTin, setGstTin] = useState("");
  const [gstRegisteredName, setGstRegisteredName] = useState("");
  const [gstReturnCurrency, setGstReturnCurrency] = useState("MVR");
  const [greenTaxEnabled, setGreenTaxEnabled] = useState(false);
  const [greenTaxCollectGuests, setGreenTaxCollectGuests] = useState(false);
  const [activities, setActivities] = useState<ActivityDraft[]>([{ number: "", name: "" }]);
  const [loading, setLoading] = useState(true);
  const [orgBusy, setOrgBusy] = useState(false);
  const [taxBusy, setTaxBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedTitle, setSavedTitle] = useState(false);
  const [savedTax, setSavedTax] = useState(false);

  useEffect(() => {
    setOrgInput(organizationTitle);
  }, [organizationTitle]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void apiFetch<SettingsDto>("/api/settings")
      .then((s) => {
        if (cancelled) return;
        setGstTin(s.gst_tin ?? "");
        setGstRegisteredName(s.gst_registered_name ?? "");
        setGstReturnCurrency(s.gst_return_currency?.trim() || "MVR");
        setGreenTaxEnabled(Boolean(s.green_tax_enabled));
        setGreenTaxCollectGuests(Boolean(s.green_tax_collect_guests));
        setActivities(toDrafts(s.taxable_activities));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load settings");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SettingsSubpage
      title="Organization"
      caption="Wordmark, GST registration details, and taxable activity numbers for MIRA filings."
    >
      {error ? <p className="text-sm text-debit">{error}</p> : null}
      {savedTitle ? <p className="text-sm text-credit">Title saved.</p> : null}
      {savedTax ? <p className="text-sm text-credit">Tax information saved.</p> : null}

      <Card>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const title = orgInput.trim();
            if (!title) {
              setError("Enter an organization title.");
              setSavedTitle(false);
              return;
            }
            if (title.length > 64) {
              setError("Organization title must be 64 characters or fewer.");
              setSavedTitle(false);
              return;
            }
            setOrgBusy(true);
            setError(null);
            setSavedTitle(false);
            void apiFetch("/api/settings", {
              method: "PATCH",
              body: JSON.stringify({ organization_title: title }),
            })
              .then(async () => {
                setOrganizationTitleLocal(title);
                setDisplayOrgTitle(title);
                setSavedTitle(true);
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

      <Card>
        <h2 className="mb-1 text-section font-semibold text-ink">GST / tax information</h2>
        <p className="mb-4 text-caption">
          Used on MIRA Input/Output Tax Statement exports. Enter details from your GST registration
          certificate.
        </p>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const cleaned = activities
                .map((a) => ({
                  number: a.number.trim(),
                  name: a.name.trim() || null,
                }))
                .filter((a) => a.number);
              const currency = gstReturnCurrency.trim().toUpperCase() || "MVR";
              if (currency.length > 8) {
                setError("Return currency must be 8 characters or fewer.");
                setSavedTax(false);
                return;
              }
              setTaxBusy(true);
              setError(null);
              setSavedTax(false);
              void apiFetch<SettingsDto>("/api/settings", {
                method: "PATCH",
                body: JSON.stringify({
                  gst_tin: gstTin.trim() || null,
                  gst_registered_name: gstRegisteredName.trim() || null,
                  gst_return_currency: currency,
                  taxable_activities: cleaned,
                  green_tax_enabled: greenTaxEnabled,
                  green_tax_collect_guests: greenTaxEnabled ? greenTaxCollectGuests : false,
                }),
              })
                .then((s) => {
                  setGstTin(s.gst_tin ?? "");
                  setGstRegisteredName(s.gst_registered_name ?? "");
                  setGstReturnCurrency(s.gst_return_currency?.trim() || "MVR");
                  setGreenTaxEnabled(Boolean(s.green_tax_enabled));
                  setGreenTaxCollectGuests(Boolean(s.green_tax_collect_guests));
                  setActivities(toDrafts(s.taxable_activities));
                  setSavedTax(true);
                })
                .catch((err) => setError(err instanceof Error ? err.message : "Failed"))
                .finally(() => setTaxBusy(false));
            }}
          >
            <TextField
              label="GST TIN"
              value={gstTin}
              onChange={(e) => setGstTin(e.target.value)}
              maxLength={64}
              placeholder="e.g. 1001234GST001"
              autoComplete="off"
              hint="Taxpayer identification number on your GST certificate."
            />
            <TextField
              label="Registered name"
              value={gstRegisteredName}
              onChange={(e) => setGstRegisteredName(e.target.value)}
              maxLength={160}
              placeholder="Legal name if different from organization title"
              autoComplete="organization"
            />
            <TextField
              label="GST return currency"
              value={gstReturnCurrency}
              onChange={(e) => setGstReturnCurrency(e.target.value.toUpperCase())}
              maxLength={8}
              placeholder="MVR"
              autoComplete="off"
              hint="Usually MVR for Maldives GST returns."
            />

            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-[var(--radius)] border border-border px-3 py-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0 accent-ink"
                checked={greenTaxEnabled}
                onChange={(e) => {
                  const on = e.target.checked;
                  setGreenTaxEnabled(on);
                  if (!on) setGreenTaxCollectGuests(false);
                }}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">Enable Green Tax</span>
                <span className="mt-0.5 block text-caption">
                  When on, GST income wizards can optionally add Green Tax (check-in/out, amount, MIRA
                  form). Green Tax is excluded from the GST taxable subtotal.
                </span>
              </span>
            </label>

            {greenTaxEnabled ? (
              <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-[var(--radius)] border border-border px-3 py-3 sm:ml-6">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 shrink-0 accent-ink"
                  checked={greenTaxCollectGuests}
                  onChange={(e) => setGreenTaxCollectGuests(e.target.checked)}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">
                    Collect guest details for Information Sheet
                  </span>
                  <span className="mt-0.5 block text-caption">
                    Capture guest name, nationality / country, category, and optional ID / reg. no. on
                    each Green Tax income — matching the MIRA Green Tax Information Sheet template.
                  </span>
                </span>
              </label>
            ) : null}

            <div className="space-y-3">
              <div>
                <p className="mb-1.5 text-sm font-medium text-ink">Taxable activities</p>
                <p className="text-caption">
                  Activity numbers from your registration certificate. The first number is used as
                  the default “Your Taxable Activity No.” on Output Tax exports.
                </p>
              </div>
              {activities.map((row, index) => (
                <div
                  key={index}
                  className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-end"
                >
                  <div className="min-w-0 flex-1">
                    <TextField
                      label={`Activity number${index === 0 ? " (default)" : ""}`}
                      value={row.number}
                      onChange={(e) => {
                        const next = [...activities];
                        next[index] = { ...next[index]!, number: e.target.value };
                        setActivities(next);
                      }}
                      maxLength={32}
                      placeholder="e.g. 1"
                      autoComplete="off"
                    />
                  </div>
                  <div className="min-w-0 flex-[1.4]">
                    <TextField
                      label="Activity name (optional)"
                      value={row.name}
                      onChange={(e) => {
                        const next = [...activities];
                        next[index] = { ...next[index]!, name: e.target.value };
                        setActivities(next);
                      }}
                      maxLength={120}
                      placeholder="Description"
                      autoComplete="off"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full sm:w-auto"
                    disabled={activities.length <= 1}
                    onClick={() => setActivities(activities.filter((_, i) => i !== index))}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={() => setActivities([...activities, { number: "", name: "" }])}
              >
                Add activity
              </Button>
            </div>

            <Button type="submit" className="w-full sm:w-auto" disabled={taxBusy}>
              {taxBusy ? "Saving…" : "Save tax information"}
            </Button>
          </form>
        )}
      </Card>
    </SettingsSubpage>
  );
}
