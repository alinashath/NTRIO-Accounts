import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  eachMonthOfInterval,
  format,
  parseISO,
} from "date-fns";
import clsx from "clsx";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch } from "@/api/http";
import { DateBasisToggle, dateBasisSubtitle, type DateBasis } from "@/components/DateBasisToggle";
import { PeriodFilterBar } from "@/components/PeriodFilterBar";
import { StatementHeader, StatementRow } from "@/components/StatementRow";
import { Button, Card } from "@/components/ui";
import { useDisplayCurrency } from "@/context/DisplayCurrencyContext";
import { chartAxisProps, chartTheme } from "@/lib/chartTheme";
import { formatMoney } from "@/lib/money";
import {
  lastMonthRange,
  type RangePreset,
  thisMonthRange,
} from "@/lib/reportPeriod";
import { useAuthStore } from "@/store/auth";

type IncomeLine = {
  key: string;
  label: string;
  amount: number;
  category_id: string | null;
  pct_of_total: number;
};

type Pnl = {
  from: string;
  to: string;
  total_income: number;
  total_expenses: number;
  net: number;
  net_income?: number;
  display_currency?: string | null;
  basis?: string;
  income_lines?: IncomeLine[];
  expense_lines?: IncomeLine[];
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
  const [applied, setApplied] = useState(initialRange);
  const [dateBasis, setDateBasis] = useState<DateBasis>("accrual");
  const [pnl, setPnl] = useState<Pnl | null>(null);
  const [cats, setCats] = useState<Cat[]>([]);
  const [prevPeriod, setPrevPeriod] = useState<{ from: string; to: string } | null>(null);
  const [trend, setTrend] = useState<Array<{ month: string; income: number; expense: number; net: number }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const qf = searchParams.get("from");
    const qt = searchParams.get("to");
    const qb = searchParams.get("date_basis");
    if (qf && qt) {
      setApplied({ from: qf, to: qt });
      setRangePreset(inferPreset(qf, qt));
    }
    if (qb === "accrual" || qb === "cash") setDateBasis(qb);
  }, [searchParams]);

  const load = useCallback(async () => {
    setError(null);
    const dc = encodeURIComponent(displayCurrency);
    const db = encodeURIComponent(dateBasis);
    const { from: f, to: t } = applied;
    try {
      const [p, c] = await Promise.all([
        apiFetch<Pnl>(
          `/api/reports/pnl?from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}&display_currency=${dc}&date_basis=${db}`,
        ),
        apiFetch<CategoryBreakdownRes>(
          `/api/reports/category-breakdown?from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}&display_currency=${dc}&compare=true&date_basis=${db}`,
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
          `/api/reports/pnl?from=${encodeURIComponent(ms)}&to=${encodeURIComponent(me)}&display_currency=${dc}&date_basis=${db}`,
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
  }, [applied, dateBasis, displayCurrency]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyPeriod(next: { from: string; to: string; preset: RangePreset }) {
    setRangePreset(next.preset);
    setApplied({ from: next.from, to: next.to });
    setSearchParams({ from: next.from, to: next.to, date_basis: dateBasis });
  }

  function applyDateBasis(next: DateBasis) {
    setDateBasis(next);
    setSearchParams({ from: applied.from, to: applied.to, date_basis: next });
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
    return `/accounts/reports/categories/${encodeURIComponent(id)}?${q.toString()}`;
  }

  function categoryAmountCell(r: Cat) {
    const hasCompare = prevPeriod != null;
    // Income up = good (green); expense up = bad (red)
    const changeTone =
      r.change == null
        ? "text-muted-foreground"
        : r.kind === "expense"
          ? r.change > 0
            ? "text-negative"
            : r.change < 0
              ? "text-positive"
              : "text-muted-foreground"
          : r.change > 0
            ? "text-positive"
            : r.change < 0
              ? "text-negative"
              : "text-muted-foreground";
    return (
      <div className="text-right tabular-nums">
        <div
          className={clsx(
            "font-medium",
            r.kind === "income" ? "text-positive" : "text-negative",
          )}
        >
          {formatMoney(r.total, displayCurrency)}
        </div>
        {hasCompare ? (
          <div className="mt-1 space-y-0.5">
            <div className="text-xs text-muted-foreground">
              Prev{" "}
              {r.previous_total != null ? formatMoney(r.previous_total, displayCurrency) : "—"}
            </div>
            {r.change != null ? (
              <div className={`text-xs font-medium ${changeTone}`}>
                {r.change >= 0 ? "+" : ""}
                {formatMoney(r.change, displayCurrency)}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">—</div>
            )}
            <div className={`text-[11px] leading-tight ${changeTone}`}>
              {r.change_pct != null ? `${r.change_pct >= 0 ? "+" : ""}${r.change_pct.toFixed(1)}%` : "—"}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  const ccy = pnl?.display_currency ?? displayCurrency;
  const netIncome = pnl?.net_income ?? pnl?.net ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Income statement</h3>
        <PeriodFilterBar
          from={applied.from}
          to={applied.to}
          preset={rangePreset}
          onApply={applyPeriod}
          actions={
            <>
              <DateBasisToggle value={dateBasis} onChange={applyDateBasis} />
              <Button type="button" variant="ghost" onClick={() => void downloadCsv()}>
                CSV
              </Button>
            </>
          }
        />
      </div>

      <p className="text-xs text-muted-foreground">{dateBasisSubtitle(dateBasis)}</p>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {pnl ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Total income
              </p>
              <p className="mt-2 text-xl font-extrabold tabular-nums text-positive sm:text-2xl">
                {formatMoney(pnl.total_income, ccy)}
              </p>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Total expenses
              </p>
              <p className="mt-2 text-xl font-extrabold tabular-nums text-negative sm:text-2xl">
                {formatMoney(pnl.total_expenses, ccy)}
              </p>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Net income
              </p>
              <p
                className={`mt-2 text-xl font-extrabold tabular-nums sm:text-2xl ${
                  netIncome >= 0 ? "text-positive" : "text-negative"
                }`}
              >
                {formatMoney(netIncome, ccy)}
              </p>
              {pnl.total_income > 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {((netIncome / pnl.total_income) * 100).toFixed(0)}% of income retained
                </p>
              ) : null}
            </Card>
          </div>

          <Card className="mx-auto max-w-2xl">
            <StatementHeader
              title="Income Statement"
              subtitle={`${format(parseISO(pnl.from), "MMM d, yyyy")} – ${format(parseISO(pnl.to), "MMM d, yyyy")} · ${dateBasisSubtitle(dateBasis)} · ${ccy}`}
            />
            <div className="mt-2">
              <StatementRow label="Income" currency={ccy} depth={0} />
              {(pnl.income_lines ?? []).length ? (
                (pnl.income_lines ?? []).map((l) => (
                  <StatementRow
                    key={`inc-${l.key}`}
                    label={`${l.label} (${l.pct_of_total.toFixed(0)}%)`}
                    amount={l.amount}
                    currency={ccy}
                    depth={1}
                  />
                ))
              ) : (
                <StatementRow label="No income in period" amount={0} currency={ccy} depth={1} muted />
              )}
              <StatementRow
                label="Total income"
                amount={pnl.total_income}
                currency={ccy}
                bold
                borderTop
              />

              <StatementRow label="Expenses" currency={ccy} depth={0} />
              {(pnl.expense_lines ?? []).length ? (
                (pnl.expense_lines ?? []).map((l) => (
                  <StatementRow
                    key={`exp-${l.key}`}
                    label={`${l.label} (${l.pct_of_total.toFixed(0)}%)`}
                    amount={l.amount}
                    currency={ccy}
                    depth={1}
                  />
                ))
              ) : (
                <StatementRow label="No expenses in period" amount={0} currency={ccy} depth={1} muted />
              )}
              <StatementRow
                label="Total expenses"
                amount={pnl.total_expenses}
                currency={ccy}
                bold
                borderTop
              />

              <StatementRow
                label="Net income"
                amount={netIncome}
                currency={ccy}
                depth={2}
                borderDouble
                negativeAsParen
              />
            </div>
          </Card>
        </>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-foreground">Trend by month</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Green income · red expense · blue net
            </p>
          </div>
        </div>
        <div className="mt-4 h-72 sm:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="pnlIncomeFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartTheme.income} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={chartTheme.income} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="pnlExpenseFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartTheme.expense} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={chartTheme.expense} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} vertical={false} />
              <XAxis dataKey="month" {...chartAxisProps} />
              <YAxis
                {...chartAxisProps}
                width={44}
                tickFormatter={(v: number) =>
                  Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                }
              />
              <Tooltip
                formatter={(v: number, name: string) => [
                  formatMoney(v, displayCurrency),
                  name === "income" ? "Income" : name === "expense" ? "Expense" : "Net",
                ]}
                contentStyle={{
                  borderRadius: 10,
                  borderColor: chartTheme.tooltipBorder,
                  background: chartTheme.tooltipBg,
                  fontSize: 12,
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 12 }}
                formatter={(value) =>
                  value === "income" ? "Income" : value === "expense" ? "Expense" : "Net"
                }
              />
              <Area
                type="monotone"
                dataKey="income"
                name="income"
                stroke={chartTheme.income}
                strokeWidth={2}
                fill="url(#pnlIncomeFill)"
                dot={false}
              />
              <Area
                type="monotone"
                dataKey="expense"
                name="expense"
                stroke={chartTheme.expense}
                strokeWidth={2}
                strokeDasharray="6 4"
                fill="url(#pnlExpenseFill)"
                dot={false}
              />
              <Area
                type="monotone"
                dataKey="net"
                name="net"
                stroke={chartTheme.net}
                strokeWidth={2}
                strokeDasharray="2 4"
                fill="transparent"
                dot={{ r: 3, strokeWidth: 0, fill: chartTheme.net }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {trend.length > 0 ? (
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3 sm:grid-cols-3">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Best net month
              </dt>
              <dd className="mt-0.5 text-sm font-bold text-foreground">
                {[...trend].sort((a, b) => b.net - a.net)[0]?.month ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Highest spend
              </dt>
              <dd className="mt-0.5 text-sm font-bold text-foreground">
                {[...trend].sort((a, b) => b.expense - a.expense)[0]?.month ?? "—"}
              </dd>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Avg monthly net
              </dt>
              <dd className="mt-0.5 text-sm font-bold tabular-nums text-foreground">
                {formatMoney(
                  trend.reduce((s, r) => s + r.net, 0) / Math.max(trend.length, 1),
                  displayCurrency,
                )}
              </dd>
            </div>
          </dl>
        ) : null}
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
