import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { apiFetch } from "@/api/http";
import { DisplayAmountCell } from "@/components/DisplayAmountCell";
import { Button, Card } from "@/components/ui";
import { useDisplayCurrency } from "@/context/DisplayCurrencyContext";
import { convertWithUsdMvrRate } from "@/lib/displayFx";
import { formatMoney } from "@/lib/money";

type CashflowAccountRow = {
  account_id: string;
  name: string;
  currency: string;
  money_in: number;
  money_out: number;
  net_flow: number;
};

type CashflowRes = {
  from: string;
  to: string;
  accounts: CashflowAccountRow[];
};

function sumConverted(
  rows: CashflowAccountRow[],
  field: "money_in" | "money_out" | "net_flow",
  displayCurrency: string,
  rate: number,
) {
  return rows.reduce(
    (s, r) => s + convertWithUsdMvrRate(r[field], r.currency || "USD", displayCurrency, rate),
    0,
  );
}

export function ReportsCashflowTab() {
  const { displayCurrency, globalUsdMvrRate } = useDisplayCurrency();
  const today = new Date();
  const defaultFrom = format(new Date(today.getFullYear(), today.getMonth(), 1), "yyyy-MM-dd");
  const defaultTo = format(today, "yyyy-MM-dd");

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [applied, setApplied] = useState({ from: defaultFrom, to: defaultTo });
  const [rows, setRows] = useState<CashflowAccountRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { from: f, to: t } = applied;
    try {
      const data = await apiFetch<CashflowRes>(
        `/api/reports/cashflow?from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}`,
      );
      setRows(data.accounts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }, [applied]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    return {
      in: sumConverted(rows, "money_in", displayCurrency, globalUsdMvrRate),
      out: sumConverted(rows, "money_out", displayCurrency, globalUsdMvrRate),
      net: sumConverted(rows, "net_flow", displayCurrency, globalUsdMvrRate),
    };
  }, [displayCurrency, globalUsdMvrRate, rows]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-slate-900">Cash flow statement</h3>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="text-slate-600">From</span>
            <input
              type="date"
              className="mt-1 block rounded-xl border border-slate-300 px-3 py-2 text-sm"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-600">To</span>
            <input
              type="date"
              className="mt-1 block rounded-xl border border-slate-300 px-3 py-2 text-sm"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <Button type="button" onClick={() => setApplied({ from, to })}>
            Apply
          </Button>
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-slate-900">By account</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="py-2 pr-3">Account</th>
                <th className="py-2 pr-3">Ccy</th>
                <th className="py-2 pr-2 text-right">In</th>
                <th className="py-2 pr-2 text-right">Out</th>
                <th className="py-2 text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className="py-4 text-slate-500" colSpan={5}>
                    No accounts yet.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.account_id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 text-slate-800">{r.name}</td>
                    <td className="py-2 pr-3 text-slate-500">{r.currency}</td>
                    <td className="py-2 pr-2 text-right">
                      <DisplayAmountCell
                        amount={r.money_in}
                        nativeCurrency={r.currency || "USD"}
                        className="font-medium text-emerald-700"
                      />
                    </td>
                    <td className="py-2 pr-2 text-right">
                      <DisplayAmountCell
                        amount={r.money_out}
                        nativeCurrency={r.currency || "USD"}
                        className="font-medium text-orange-700"
                      />
                    </td>
                    <td className="py-2 text-right">
                      <DisplayAmountCell
                        amount={r.net_flow}
                        nativeCurrency={r.currency || "USD"}
                        className={
                          r.net_flow >= 0 ? "font-medium text-emerald-800" : "font-medium text-orange-800"
                        }
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 ? (
              <tfoot>
                <tr className="border-t border-slate-200 font-semibold text-slate-900">
                  <td className="py-2 pr-3" colSpan={2}>
                    Totals (converted)
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums text-emerald-800">
                    {formatMoney(totals.in, displayCurrency)}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums text-orange-800">
                    {formatMoney(totals.out, displayCurrency)}
                  </td>
                  <td className="py-2 text-right tabular-nums">{formatMoney(totals.net, displayCurrency)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </Card>
    </div>
  );
}
