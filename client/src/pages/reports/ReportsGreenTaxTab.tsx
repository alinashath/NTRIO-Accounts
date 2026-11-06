import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { apiFetch, apiFetchBlob } from "@/api/http";
import { PeriodFilterBar } from "@/components/PeriodFilterBar";
import { Button, Card } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { type RangePreset, thisMonthRange } from "@/lib/reportPeriod";
import type { SettingsDto } from "../../../../shared/types";

type GreenTaxGuestReportRow = {
  income_id: string;
  income_date: string;
  invoice_number: string | null;
  description: string | null;
  guest_reg_no: string | null;
  name: string;
  category: "1" | "2" | "3";
  identification_no: string | null;
  nationality: string;
  booking_method: string | null;
  check_in: string | null;
  check_out: string | null;
  green_tax_amount: number | null;
  currency: string;
};

type MiraGreenTaxPreview = {
  from: string;
  to: string;
  enabled: boolean;
  collect_guests: boolean;
  organization: {
    gst_tin: string | null;
    gst_registered_name: string | null;
    organization_title: string;
  };
  summary: {
    invoice_count: number;
    guest_count: number;
    total_green_tax: number;
    category_1_guests: number;
    category_2_guests: number;
    category_3_guests: number;
  };
  rows: GreenTaxGuestReportRow[];
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatLocalDt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const CATEGORY_LABEL: Record<"1" | "2" | "3", string> = {
  "1": "1 Taxable",
  "2": "2 Maldivian",
  "3": "3 Exempt",
};

export function ReportsGreenTaxTab() {
  const initialRange = thisMonthRange();
  const [rangePreset, setRangePreset] = useState<RangePreset>("this_month");
  const [applied, setApplied] = useState(initialRange);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [preview, setPreview] = useState<MiraGreenTaxPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void apiFetch<SettingsDto>("/api/settings")
      .then((s) => {
        if (!cancelled) setEnabled(Boolean(s.green_tax_enabled));
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    if (!enabled) return;
    setError(null);
    setLoading(true);
    const q = new URLSearchParams({ from: applied.from, to: applied.to });
    try {
      const data = await apiFetch<MiraGreenTaxPreview>(
        `/api/reports/mira-green-tax?${q.toString()}`,
      );
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [applied.from, applied.to, enabled]);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  async function downloadCsv() {
    setExporting(true);
    setError(null);
    const q = new URLSearchParams({ from: applied.from, to: applied.to });
    try {
      const { blob, filename } = await apiFetchBlob(
        `/api/reports/mira-green-tax/export?${q.toString()}`,
      );
      downloadBlob(blob, filename ?? `mira-green-tax-${applied.from}_${applied.to}.csv`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  if (enabled === false) {
    return <Navigate to="/accounts/reports/pnl" replace />;
  }

  if (enabled === null) {
    return <p className="text-caption text-muted-label">Loading…</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">MIRA Green Tax</h3>
          <p className="mt-0.5 text-caption text-muted-label">
            Guest rows from income Green Tax for the MIRA Information Sheet. Period uses check-out
            date when set, otherwise the income date.
          </p>
        </div>
        <PeriodFilterBar
          from={applied.from}
          to={applied.to}
          preset={rangePreset}
          onApply={({ from, to, preset }) => {
            setRangePreset(preset);
            setApplied({ from, to });
          }}
          actions={
            <Button
              type="button"
              disabled={exporting || loading}
              onClick={() => void downloadCsv()}
            >
              {exporting ? "Preparing…" : "Export CSV"}
            </Button>
          }
        />
      </div>

      {error ? (
        <p className="rounded-sm border border-border bg-debit-bg px-3 py-2 text-sm text-debit">
          {error}
        </p>
      ) : null}

      {loading && !preview ? (
        <p className="text-caption text-muted-label">Loading…</p>
      ) : preview ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Card className="space-y-1 p-3">
              <p className="text-label">Invoices</p>
              <p className="font-num text-amount-lg font-bold text-ink">
                {preview.summary.invoice_count}
              </p>
            </Card>
            <Card className="space-y-1 p-3">
              <p className="text-label">Guest rows</p>
              <p className="font-num text-amount-lg font-bold text-ink">
                {preview.summary.guest_count}
              </p>
            </Card>
            <Card className="space-y-1 p-3">
              <p className="text-label">Green Tax total</p>
              <p className="font-num text-amount-lg font-bold text-ink">
                {preview.summary.total_green_tax.toFixed(2)}
              </p>
            </Card>
            <Card className="space-y-1 p-3">
              <p className="text-label">Categories 1 / 2 / 3</p>
              <p className="font-num text-sm font-semibold text-ink">
                {preview.summary.category_1_guests} / {preview.summary.category_2_guests} /{" "}
                {preview.summary.category_3_guests}
              </p>
            </Card>
          </div>

          <Card className="space-y-3">
            <div>
              <h4 className="text-sm font-semibold text-ink">Information Sheet rows</h4>
              <p className="mt-0.5 text-caption text-muted-label">
                {preview.collect_guests
                  ? "Guest name and nationality from invoices where Green Tax was captured."
                  : "Guest detail collection is off — enable it under Settings → Organization to capture name and country on each invoice."}
              </p>
            </div>
            {preview.rows.length === 0 ? (
              <p className="text-caption text-muted-label">
                No Green Tax income in this period.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[48rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-caption text-muted-label">
                      <th className="py-2 pr-2 font-medium">Name</th>
                      <th className="py-2 pr-2 font-medium">Country</th>
                      <th className="py-2 pr-2 font-medium">Cat.</th>
                      <th className="py-2 pr-2 font-medium">Check-in</th>
                      <th className="py-2 pr-2 font-medium">Check-out</th>
                      <th className="py-2 pr-2 font-medium">Invoice</th>
                      <th className="py-2 text-right font-medium">Green Tax</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 50).map((r, i) => (
                      <tr key={`${r.income_id}-${i}`} className="border-b border-border/70">
                        <td className="max-w-[10rem] truncate py-2 pr-2">{r.name}</td>
                        <td className="py-2 pr-2">{r.nationality}</td>
                        <td className="py-2 pr-2 text-caption">{CATEGORY_LABEL[r.category]}</td>
                        <td className="py-2 pr-2 font-num text-caption">
                          {formatLocalDt(r.check_in)}
                        </td>
                        <td className="py-2 pr-2 font-num text-caption">
                          {formatLocalDt(r.check_out)}
                        </td>
                        <td className="py-2 pr-2 font-num text-caption">
                          {r.invoice_number ?? "—"}
                        </td>
                        <td className="py-2 text-right font-num text-caption">
                          {r.green_tax_amount != null
                            ? formatMoney(r.green_tax_amount, r.currency)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.rows.length > 50 ? (
                  <p className="mt-2 text-caption text-muted-label">
                    Showing 50 of {preview.rows.length} — full list is in the CSV export.
                  </p>
                ) : null}
              </div>
            )}
          </Card>

          <Card className="space-y-2">
            <p className="text-sm font-semibold text-ink">Before you file</p>
            <ul className="list-disc space-y-1 pl-5 text-caption text-muted-label">
              <li>
                CSV columns follow the MIRA Green Tax Information Sheet (guest reg., name, category,
                ID, nationality, booking method, check-in/out).
              </li>
              <li>
                Organization:{" "}
                {preview.organization.gst_tin ? (
                  <span className="font-num text-ink">{preview.organization.gst_tin}</span>
                ) : (
                  <>
                    TIN not set — add under{" "}
                    <Link
                      className="font-medium text-ink underline"
                      to="/accounts/settings/organization"
                    >
                      Settings → Organization
                    </Link>
                  </>
                )}
                .
              </li>
              <li>
                Official MIRA 501 return and MIRAconnect upload still use forms from{" "}
                <a
                  className="font-medium text-ink underline"
                  href="https://www.mira.gov.mv"
                  target="_blank"
                  rel="noreferrer"
                >
                  mira.gov.mv
                </a>
                ; this export helps assemble the Information Sheet.
              </li>
            </ul>
          </Card>
        </>
      ) : null}
    </div>
  );
}
