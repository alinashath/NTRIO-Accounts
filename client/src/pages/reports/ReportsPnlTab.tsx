import { useCallback, useEffect, useState } from "react";
import { eachMonthOfInterval, format, parseISO } from "date-fns";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch } from "@/api/http";
import { Button, Card } from "@/components/ui";
import { useDisplayCurrency } from "@/context/DisplayCurrencyContext";
import { formatMoney } from "@/lib/money";
import { useAuthStore } from "@/store/auth";

type Pnl = {
  from: string;
  to: string;
  total_income: number;
  total_expenses: number;
  net: number;
  display_currency?: string | null;
};

type Cat = {
  kind: string;
  name: string;
  total: number;
  pct_of_kind: number;
};

export function ReportsPnlTab() {
  const { displayCurrency } = useDisplayCurrency();
  const today = new Date();
  const defaultFrom = format(new Date(today.getFullYear(), 0, 1), "yyyy-MM-dd");
  const defaultTo = format(today, "yyyy-MM-dd");

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [applied, setApplied] = useState({ from: defaultFrom, to: defaultTo });
  const [pnl, setPnl] = useState<Pnl | null>(null);
  const [cats, setCats] = useState<Cat[]>([]);
  const [trend, setTrend] = useState<Array<{ month: string; income: number; expense: number; net: number }>>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const dc = encodeURIComponent(displayCurrency);
    const { from: f, to: t } = applied;
    try {
      const [p, c] = await Promise.all([
        apiFetch<Pnl>(
          `/api/reports/pnl?from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}&display_currency=${dc}`,
        ),
        apiFetch<{ rows: Cat[] }>(
          `/api/reports/category-breakdown?from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}&display_currency=${dc}`,
        ),
      ]);
      setPnl(p);
      setCats(c.rows);

      const months = eachMonthOfInterval({
        start: parseISO(f),
        end: parseISO(t),
      });

      const points: Array<{ month: string; income: number; expense: number; net: number }> = [];
      for (const m of months) {
        const ms = format(m, "yyyy-MM-01");
        const me = format(new Date(m.getFullYear(), m.getMonth() + 1, 0), "yyyy-MM-dd");
        const row = await apiFetch<Pnl>(
          `/api/reports/pnl?from=${encodeURIComponent(ms)}&to=${encodeURIComponent(me)}&display_currency=${dc}`,
        );
        points.push({
          month: format(m, "MMM yyyy"),
          income: row.total_income,
          expense: row.total_expenses,
          net: row.net,
        });
      }
      setTrend(points);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }, [applied, displayCurrency]);

  useEffect(() => {
    void load();
  }, [load]);

  async function downloadCsv() {
    const token = useAuthStore.getState().session?.access_token;
    const res = await fetch("/api/reports/export", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ format: "csv", from, to }),
    });
    if (!res.ok) {
      setError("Export failed");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `export-${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <h3 className="text-base font-semibold text-slate-900">Profit &amp; loss</h3>
      <p className="text-sm text-slate-600">
        Income is counted by <strong>earned date</strong>; expenses by <strong>bill date</strong> (including unpaid
        pay-later).
      </p>

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
          <Button type="button" variant="ghost" onClick={() => void downloadCsv()}>
            Export CSV
          </Button>
        </div>
      </Card>

      {pnl ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <p className="text-xs uppercase text-slate-500">Income</p>
            <p className="mt-2 text-2xl font-bold text-emerald-700">
              {formatMoney(pnl.total_income, displayCurrency)}
            </p>
          </Card>
          <Card>
            <p className="text-xs uppercase text-slate-500">Expenses</p>
            <p className="mt-2 text-2xl font-bold text-orange-700">
              {formatMoney(pnl.total_expenses, displayCurrency)}
            </p>
          </Card>
          <Card>
            <p className="text-xs uppercase text-slate-500">Net</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{formatMoney(pnl.net, displayCurrency)}</p>
          </Card>
        </div>
      ) : null}

      <Card>
        <h3 className="text-sm font-semibold text-slate-900">Trend by month</h3>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => formatMoney(v, displayCurrency)} />
              <Legend />
              <Line type="monotone" dataKey="income" stroke="#16a34a" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="expense" stroke="#f97316" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="net" stroke="#0f172a" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-slate-900">Category breakdown</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="py-2 pr-3">Kind</th>
                <th className="py-2 pr-3">Category</th>
                <th className="py-2 pr-3 text-right">Total</th>
                <th className="py-2 text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {cats.map((r, i) => (
                <tr key={`${r.kind}-${r.name}-${i}`} className="border-b border-slate-100">
                  <td className="py-2 pr-3">{r.kind}</td>
                  <td className="py-2 pr-3">{r.name}</td>
                  <td className="py-2 pr-3 text-right">{formatMoney(r.total, displayCurrency)}</td>
                  <td className="py-2 text-right">{r.pct_of_kind.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
