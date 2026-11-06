import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch, apiFetchBlob } from "@/api/http";
import { SegmentedControl } from "@/components/design";
import { PeriodFilterBar } from "@/components/PeriodFilterBar";
import { Button, Card } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { type RangePreset, thisMonthRange } from "@/lib/reportPeriod";

type MiraGstLine = {
  id: string;
  counterparty_tin: string | null;
  counterparty_name: string;
  invoice_number: string | null;
  invoice_date: string;
  invoice_total: number;
  currency: string;
  gst_rate: number | null;
  mira_rate_bucket: number | null;
  taxable_value: number | null;
  gst_amount: number | null;
  zero_rated_amount: number | null;
  description: string | null;
};

type MiraGstSide = {
  row_count: number;
  total_invoice: number;
  total_gst: number;
  total_zero_rated: number;
  rows: MiraGstLine[];
};

type MiraGstPreview = {
  from: string;
  to: string;
  organization?: {
    gst_tin: string | null;
    gst_registered_name: string | null;
    gst_return_currency: string;
    taxable_activities: { number: string; name: string | null }[];
  };
  input: MiraGstSide;
  output: MiraGstSide;
};

type MiraSheetTab = "input" | "output";

const SHEET_TABS = [
  { value: "input" as const, label: "Input" },
  { value: "output" as const, label: "Output" },
];

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function StatementSummary({
  title,
  subtitle,
  data,
}: {
  title: string;
  subtitle: string;
  data: MiraGstSide;
}) {
  return (
    <Card className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-ink">{title}</h4>
        <p className="mt-0.5 text-caption text-muted-label">{subtitle}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <p className="text-label">Invoices</p>
          <p className="font-num text-sm font-semibold text-ink">{data.row_count}</p>
        </div>
        <div>
          <p className="text-label">Invoice totals</p>
          <p className="font-num text-sm font-semibold text-ink">{data.total_invoice.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-label">GST</p>
          <p className="font-num text-sm font-semibold text-ink">{data.total_gst.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-label">Zero-rated</p>
          <p className="font-num text-sm font-semibold text-ink">{data.total_zero_rated.toFixed(2)}</p>
        </div>
      </div>
      {data.rows.length === 0 ? (
        <p className="text-caption text-muted-label">
          No GST / invoice-tagged entries in this period.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-caption text-muted-label">
                <th className="py-2 pr-2 font-medium">Date</th>
                <th className="py-2 pr-2 font-medium">Party</th>
                <th className="py-2 pr-2 font-medium">Invoice</th>
                <th className="py-2 pr-2 font-medium">Rate</th>
                <th className="py-2 pr-2 text-right font-medium">GST</th>
                <th className="py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.slice(0, 25).map((r) => (
                <tr key={r.id} className="border-b border-border/70">
                  <td className="py-2 pr-2 font-num text-caption">{r.invoice_date}</td>
                  <td className="max-w-[10rem] truncate py-2 pr-2">{r.counterparty_name}</td>
                  <td className="py-2 pr-2 font-num text-caption">{r.invoice_number ?? "—"}</td>
                  <td className="py-2 pr-2 font-num text-caption">
                    {r.gst_rate != null ? `${r.gst_rate}%` : "—"}
                  </td>
                  <td className="py-2 pr-2 text-right font-num text-caption">
                    {r.gst_amount != null ? formatMoney(r.gst_amount, r.currency) : "—"}
                  </td>
                  <td className="py-2 text-right font-num text-caption">
                    {formatMoney(r.invoice_total, r.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.rows.length > 25 ? (
            <p className="mt-2 text-caption text-muted-label">
              Showing 25 of {data.rows.length} — full list is in the Excel download.
            </p>
          ) : null}
        </div>
      )}
    </Card>
  );
}

export function ReportsMiraGstTab() {
  const initialRange = thisMonthRange();
  const [rangePreset, setRangePreset] = useState<RangePreset>("this_month");
  const [applied, setApplied] = useState(initialRange);
  const [sheetTab, setSheetTab] = useState<MiraSheetTab>("input");
  const [preview, setPreview] = useState<MiraGstPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    const q = new URLSearchParams({ from: applied.from, to: applied.to });
    try {
      const data = await apiFetch<MiraGstPreview>(`/api/reports/mira-gst?${q.toString()}`);
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [applied.from, applied.to]);

  useEffect(() => {
    void load();
  }, [load]);

  async function downloadExcel() {
    setExporting(true);
    setError(null);
    const q = new URLSearchParams({ from: applied.from, to: applied.to });
    try {
      const { blob, filename } = await apiFetchBlob(`/api/reports/mira-gst/export?${q.toString()}`);
      downloadBlob(blob, filename ?? `mira-gst-statements-${applied.from}_${applied.to}.xlsx`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">MIRA GST statements</h3>
          <p className="mt-0.5 text-caption text-muted-label">
            Export Input Tax (purchases) and Output Tax (sales) Excel sheets for Maldives Inland
            Revenue filing.
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
              onClick={() => void downloadExcel()}
            >
              {exporting ? "Preparing…" : "Download Excel"}
            </Button>
          }
        />
      </div>

      <SegmentedControl
        aria-label="MIRA GST statement type"
        className="w-full sm:w-auto"
        options={SHEET_TABS}
        value={sheetTab}
        onChange={setSheetTab}
      />

      {error ? (
        <p className="rounded-sm border border-border bg-debit-bg px-3 py-2 text-sm text-debit">
          {error}
        </p>
      ) : null}

      {loading && !preview ? (
        <p className="text-caption text-muted-label">Loading…</p>
      ) : preview ? (
        <>
          {sheetTab === "input" ? (
            <StatementSummary
              title="Input Tax Statement"
              subtitle="Expense invoices with GST / invoice fields (bill date in period)"
              data={preview.input}
            />
          ) : (
            <StatementSummary
              title="Output Tax Statement"
              subtitle="Income invoices with GST / invoice fields (earned date in period)"
              data={preview.output}
            />
          )}
          <Card className="space-y-2">
            <p className="text-sm font-semibold text-ink">Before you file</p>
            <ul className="list-disc space-y-1 pl-5 text-caption text-muted-label">
              {sheetTab === "input" ? (
                <>
                  <li>
                    Input Tax covers purchases — rate columns match MIRA Input Tax Statement v25.1
                    (6 / 8 / 12 / 16 / 17%).
                  </li>
                  <li>Fill vendor contact TGST numbers so Supplier TIN columns populate.</li>
                </>
              ) : (
                <>
                  <li>
                    Output Tax covers sales invoices — normally only to other GST-registered
                    customers (TIN on contact).
                  </li>
                  <li>
                    “Your Taxable Activity No.” is filled from{" "}
                    <Link
                      className="font-medium text-ink underline"
                      to="/accounts/settings/organization"
                    >
                      Settings → Organization
                    </Link>{" "}
                    (first taxable activity number).
                  </li>
                </>
              )}
              <li>
                Organization TIN / registered name:{" "}
                {preview.organization?.gst_tin ? (
                  <span className="font-num text-ink">{preview.organization.gst_tin}</span>
                ) : (
                  <>
                    not set — add under{" "}
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
                Excel download includes both Input and Output sheets plus Notes. Prefer the
                official workbook from{" "}
                <a
                  className="font-medium text-ink underline"
                  href="https://www.mira.gov.mv"
                  target="_blank"
                  rel="noreferrer"
                >
                  mira.gov.mv
                </a>{" "}
                when MIRAconnect expects an exact template version.
              </li>
            </ul>
          </Card>
        </>
      ) : null}
    </div>
  );
}
