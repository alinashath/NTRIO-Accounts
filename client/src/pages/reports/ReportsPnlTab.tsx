import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  eachMonthOfInterval,
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
  subMonths,
} from "date-fns";
import clsx from "clsx";
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
  category_id: string | null;
  previous_total?: number;
  change?: number;
  change_pct?: number | null;
};

type CategoryBreakdownRes = {
  rows: Cat[];
  previous_period?: { from: string; to: string };
};

type RangePreset = "this_month" | "last_month" | "custom";

function thisMonthRange(now = new Date()) {
  return {
    from: format(startOfMonth(now), "yyyy-MM-dd"),
    to: format(now, "yyyy-MM-dd"),
  };
}

function lastMonthRange(now = new Date()) {
  const ref = subMonths(now, 1);
  return {
    from: format(startOfMonth(ref), "yyyy-MM-dd"),
    to: format(endOfMonth(ref), "yyyy-MM-dd"),
  };
}

function inferPreset(fromStr: string, toStr: string): RangePreset {
  const now = new Date();
  const tm = thisMonthRange(now);
  const lm = lastMonthRange(now);
  if (fromStr === tm.from && toStr === tm.to) return "this_month";
  if (fromStr === lm.from && toStr === lm.to) return "last_month";
  return "custom";
}

export function ReportsPnlTab() {
  const { displayCurrency } = useDisplayCurrency();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialRange = thisMonthRange();

  const [rangePreset, setRangePreset] = useState<RangePreset>("this_month");
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [applied, setApplied] = useState(initialRange);
  const [pnl, setPnl] = useState<Pnl | null>(null);
  const [cats, setCats] = useState<Cat[]>([]);
  const [prevPeriod, setPrevPeriod] = useState<{ from: string; to: string } | null>(null);
  const [trend, setTrend] = useState<Array<{ month: string; income: number; expense: number; net: number }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const qf = searchParams.get("from");
    const qt = searchParams.get("to");
    if (qf && qt) {
      setFrom(qf);
      setTo(qt);
      setApplied({ from: qf, to: qt });
      setRangePreset(inferPreset(qf, qt));
    }
  }, [searchParams]);

  const load = useCallback(async () => {
    setError(null);
    const dc = encodeURIComponent(displayCurrency);
    const { from: f, to: t } = applied;
    try {
      const [p, c] = await Promise.all([
        apiFetch<Pnl>(
          `/api/reports/pnl?from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}&display_currency=${dc}`,
        ),
        apiFetch<CategoryBreakdownRes>(
          `/api/reports/category-breakdown?from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}&display_currency=${dc}&compare=true`,
        ),
      ]);
      setPnl(p);
      setCats(c.rows);
      setPrevPeriod(c.previous_period ?? null);

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

  function applyRange() {
    setApplied({ from, to });
    setSearchParams({ from, to });
    setRangePreset("custom");
  }

  function applyPreset(preset: RangePreset) {
    setRangePreset(preset);
    if (preset === "this_month") {
      const r = thisMonthRange();
      setFrom(r.from);
      setTo(r.to);
      setApplied(r);
      setSearchParams({ from: r.from, to: r.to });
      return;
    }
    if (preset === "last_month") {
      const r = lastMonthRange();
      setFrom(r.from);
      setTo(r.to);
      setApplied(r);
      setSearchParams({ from: r.from, to: r.to });
    }
  }

  async function downloadCsv() {
    const token = useAuthStore.getState().session?.access_token;
    const { from: af, to: at } = applied;
    const res = await fetch("/api/reports/export", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ format: "csv", from: af, to: at }),
    });
    if (!res.ok) {
      setError("Export failed");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `export-${af}_${at}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function categoryHref(r: Cat) {
    const id = r.category_id ?? "uncategorized";
    const q = new URLSearchParams();
    q.set("kind", r.kind);
    q.set("from", applied.from);
    q.set("to", applied.to);
    return `/reports/categories/${encodeURIComponent(id)}?${q.toString()}`;
  }

  function categoryAmountCell(r: Cat) {
    const hasCompare = prevPeriod != null;
    const changeTone =
      r.change == null ? "text-slate-500" : r.change >= 0 ? "text-orange-700" : "text-emerald-700";
    return (
      <div className="text-right tabular-nums">
        <div className="font-medium text-slate-900">{formatMoney(r.total, displayCurrency)}</div>
        {hasCompare ? (
          <div className="mt-1 space-y-0.5">
            <div className="text-xs text-slate-500">
              Prev{" "}
              {r.previous_total != null ? formatMoney(r.previous_total, displayCurrency) : "—"}
            </div>
            {r.change != null ? (
              <div className={`text-xs font-medium ${changeTone}`}>
                {r.change >= 0 ? "+" : ""}
                {formatMoney(r.change, displayCurrency)}
              </div>
            ) : (
              <div className="text-xs text-slate-500">—</div>
            )}
            <div className="text-[11px] leading-tight text-slate-500">
              {r.change_pct != null ? `${r.change_pct >= 0 ? "+" : ""}${r.change_pct.toFixed(1)}%` : "—"}
            </div>
          </div>
        ) : null}
      </div>
    );
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
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Period</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => applyPreset("this_month")}
            className={clsx(
              "min-h-11 touch-manipulation rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-[0.99]",
              rangePreset === "this_month"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-800 hover:bg-slate-200",
            )}
          >
            This month
          </button>
          <button
            type="button"
            onClick={() => applyPreset("last_month")}
            className={clsx(
              "min-h-11 touch-manipulation rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-[0.99]",
              rangePreset === "last_month"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-800 hover:bg-slate-200",
            )}
          >
            Last month
          </button>
          <button
            type="button"
            onClick={() => setRangePreset("custom")}
            className={clsx(
              "min-h-11 touch-manipulation rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-[0.99]",
              rangePreset === "custom"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-800 hover:bg-slate-200",
            )}
          >
            Custom
          </button>
        </div>

        {rangePreset === "custom" ? (
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="text-slate-600">From</span>
              <input
                type="date"
                className="mt-1 block rounded-xl border border-slate-300 px-3 py-2 text-sm"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setRangePreset("custom");
                }}
              />
            </label>
            <label className="text-sm">
              <span className="text-slate-600">To</span>
              <input
                type="date"
                className="mt-1 block rounded-xl border border-slate-300 px-3 py-2 text-sm"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setRangePreset("custom");
                }}
              />
            </label>
            <Button type="button" onClick={() => applyRange()}>
              Apply
            </Button>
            <Button type="button" variant="ghost" onClick={() => void downloadCsv()}>
              Export CSV
            </Button>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-700">
              <span className="text-slate-500">Showing </span>
              {format(parseISO(from), "MMM d, yyyy")}
              <span className="text-slate-500"> – </span>
              {format(parseISO(to), "MMM d, yyyy")}
            </p>
            <Button type="button" variant="ghost" onClick={() => void downloadCsv()}>
              Export CSV
            </Button>
          </div>
        )}
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
        {prevPeriod ? (
          <p className="mt-1 text-xs text-slate-500">
            vs prior period {prevPeriod.from} → {prevPeriod.to}
          </p>
        ) : null}
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="py-2 pr-3">Kind</th>
                <th className="py-2 pr-3">Category</th>
                <th className="py-2 pr-3 text-right align-bottom">Amount</th>
                <th className="py-2 text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {cats.map((r, i) => (
                <tr key={`${r.kind}-${r.name}-${i}`} className="border-b border-slate-100 hover:bg-slate-50/80">
                  <td className="py-2 pr-3 align-top">{r.kind}</td>
                  <td className="py-2 pr-3 align-top">
                    <Link to={categoryHref(r)} className="font-medium text-sky-700 hover:underline">
                      {r.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 align-top">{categoryAmountCell(r)}</td>
                  <td className="py-2 text-right align-top tabular-nums">{r.pct_of_kind.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
