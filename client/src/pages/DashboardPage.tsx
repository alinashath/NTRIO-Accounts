import { useEffect, useMemo, useState } from "react";
import { eachDayOfInterval, format, parseISO, startOfWeek, differenceInCalendarDays } from "date-fns";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch } from "@/api/http";
import { DisplayAmountCell } from "@/components/DisplayAmountCell";
import { PeriodFilterBar } from "@/components/PeriodFilterBar";
import { ReceiptPreviewIcon } from "@/components/ReceiptPreviewIcon";
import { SkeletonCard, SkeletonLine } from "@/components/Skeleton";
import { Card, StatCard } from "@/components/ui";
import { useDisplayCurrency } from "@/context/DisplayCurrencyContext";
import { chartAxisProps, chartTheme } from "@/lib/chartTheme";
import { convertWithUsdMvrRate } from "@/lib/displayFx";
import { formatMoney, formatMoneyAmountOnly } from "@/lib/money";
import {
  formatSharePct,
  formatVsPrior,
} from "@/lib/periodCompare";
import {
  comparablePriorPeriod,
  DASHBOARD_PERIOD_PRESETS,
  type RangePreset,
  thisMonthRange,
} from "@/lib/reportPeriod";
import type { AccountDto, DebtDto, ExpenseEntryDto, IncomeEntryDto } from "../../../shared/types";

type Pnl = {
  total_income: number;
  total_expenses: number;
  net: number;
  display_currency?: string | null;
};

type NetWorth = {
  net_worth: number;
  cash_and_accounts: number;
  outstanding_i_owe: number;
  outstanding_owed_to_me: number;
  pay_later_unpaid: number | null;
  display_currency?: string | null;
};

type CatRow = {
  kind: string;
  name: string;
  total: number;
};

function useCompactCharts() {
  const [compact, setCompact] = useState(
    () => (typeof window !== "undefined" ? window.matchMedia("(max-width: 639px)").matches : true),
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const onChange = () => setCompact(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return compact;
}

export function DashboardPage() {
  const { displayCurrency, getUsdMvrRateForDate } = useDisplayCurrency();
  const compactCharts = useCompactCharts();
  const initial = thisMonthRange();

  const [rangePreset, setRangePreset] = useState<RangePreset>("this_month");
  const [applied, setApplied] = useState(initial);

  const [accounts, setAccounts] = useState<AccountDto[]>([]);
  const [pnl, setPnl] = useState<Pnl | null>(null);
  const [pnlPrev, setPnlPrev] = useState<Pnl | null>(null);
  const [nw, setNw] = useState<NetWorth | null>(null);
  const [nwPrev, setNwPrev] = useState<NetWorth | null>(null);
  const [prevPeriodLabel, setPrevPeriodLabel] = useState<string | null>(null);
  const [income, setIncome] = useState<IncomeEntryDto[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntryDto[]>([]);
  const [debts, setDebts] = useState<DebtDto[]>([]);
  const [cats, setCats] = useState<CatRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const periodFrom = applied.from;
  const periodTo = applied.to;
  const asOf = applied.to;
  const periodDays =
    differenceInCalendarDays(parseISO(periodTo), parseISO(periodFrom)) + 1;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const prev = comparablePriorPeriod(periodFrom, periodTo, rangePreset);
      try {
        const [accs, pnlRes, pnlPrior, nwRes, nwPrior, inc, exp, d, br] = await Promise.all([
          apiFetch<AccountDto[]>("/api/accounts"),
          apiFetch<Pnl>(
            `/api/reports/pnl?from=${encodeURIComponent(periodFrom)}&to=${encodeURIComponent(periodTo)}&display_currency=${encodeURIComponent(displayCurrency)}`,
          ),
          apiFetch<Pnl>(
            `/api/reports/pnl?from=${encodeURIComponent(prev.from)}&to=${encodeURIComponent(prev.to)}&display_currency=${encodeURIComponent(displayCurrency)}`,
          ),
          apiFetch<NetWorth>(
            `/api/reports/net-worth?as_of=${encodeURIComponent(asOf)}&display_currency=${encodeURIComponent(displayCurrency)}`,
          ),
          apiFetch<NetWorth>(
            `/api/reports/net-worth?as_of=${encodeURIComponent(prev.to)}&display_currency=${encodeURIComponent(displayCurrency)}`,
          ),
          apiFetch<IncomeEntryDto[]>(
            `/api/income?from=${encodeURIComponent(periodFrom)}&to=${encodeURIComponent(periodTo)}`,
          ),
          apiFetch<ExpenseEntryDto[]>(
            `/api/expenses?from=${encodeURIComponent(periodFrom)}&to=${encodeURIComponent(periodTo)}`,
          ),
          apiFetch<DebtDto[]>("/api/debts?status=open"),
          apiFetch<{ rows: CatRow[] }>(
            `/api/reports/category-breakdown?from=${encodeURIComponent(periodFrom)}&to=${encodeURIComponent(periodTo)}&display_currency=${encodeURIComponent(displayCurrency)}`,
          ),
        ]);
        if (cancelled) return;
        setAccounts(accs);
        setPnl(pnlRes);
        setPnlPrev(pnlPrior);
        setNw(nwRes);
        setNwPrev(nwPrior);
        setPrevPeriodLabel(`${prev.from} → ${prev.to}`);
        setIncome(inc);
        setExpenses(exp);
        setDebts(d);
        setCats(br.rows.filter((r) => r.kind === "expense").slice(0, 5));
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [asOf, displayCurrency, periodFrom, periodTo, rangePreset]);

  const compares = useMemo(() => {
    if (!pnl || !pnlPrev || !nw || !nwPrev) return null;
    const incomeKept = formatSharePct(pnl.net, pnl.total_income, "of income kept");
    const expenseShare = formatSharePct(pnl.total_expenses, pnl.total_income, "of income");
    return {
      netWorth: formatVsPrior(nw.net_worth, nwPrev.net_worth, { higherIsBetter: true }),
      cash: formatVsPrior(nw.cash_and_accounts, nwPrev.cash_and_accounts, { higherIsBetter: true }),
      payLater: formatVsPrior(nw.pay_later_unpaid ?? 0, nwPrev.pay_later_unpaid ?? 0, {
        higherIsBetter: false,
      }),
      income: formatVsPrior(pnl.total_income, pnlPrev.total_income, { higherIsBetter: true }),
      expenses: formatVsPrior(pnl.total_expenses, pnlPrev.total_expenses, { higherIsBetter: false }),
      net: formatVsPrior(pnl.net, pnlPrev.net, { higherIsBetter: true }),
      incomeKept,
      expenseShare,
    };
  }, [nw, nwPrev, pnl, pnlPrev]);

  const dailyTrend = useMemo(() => {
    const start = parseISO(periodFrom);
    const end = parseISO(periodTo);
    const days = eachDayOfInterval({ start, end }).map((d) => ({
      key: format(d, "yyyy-MM-dd"),
      day: format(d, "MMM d"),
      income: 0,
      expense: 0,
      net: 0,
    }));
    const idx = new Map(days.map((d, i) => [d.key, i]));
    for (const row of income) {
      const key = format(new Date(row.date), "yyyy-MM-dd");
      const i = idx.get(key);
      if (i != null) {
        days[i]!.income += convertWithUsdMvrRate(
          row.amount,
          row.account_currency || row.currency || "USD",
          displayCurrency,
          getUsdMvrRateForDate(key),
        );
      }
    }
    for (const row of expenses) {
      const key = format(new Date(row.bill_date ?? row.date), "yyyy-MM-dd");
      const i = idx.get(key);
      if (i != null) {
        const ccy = row.pay_later
          ? (row.bill_currency ?? row.account_currency ?? "USD")
          : (row.account_currency || "USD");
        days[i]!.expense += convertWithUsdMvrRate(
          row.amount,
          ccy,
          displayCurrency,
          getUsdMvrRateForDate(key),
        );
      }
    }
    for (const d of days) {
      d.net = d.income - d.expense;
    }
    return days;
  }, [displayCurrency, expenses, getUsdMvrRateForDate, income, periodFrom, periodTo]);

  const useWeeklyBuckets = compactCharts || periodDays > 45;

  const trend = useMemo(() => {
    if (!useWeeklyBuckets) {
      return dailyTrend.map(({ day, income, expense, net }) => ({ day, income, expense, net }));
    }
    const buckets = new Map<
      string,
      { day: string; sort: string; income: number; expense: number; net: number }
    >();
    for (const row of dailyTrend) {
      const weekStart = startOfWeek(new Date(row.key), { weekStartsOn: 1 });
      const sort = format(weekStart, "yyyy-MM-dd");
      const label = `W ${format(weekStart, "MMM d")}`;
      const cur = buckets.get(sort) ?? { day: label, sort, income: 0, expense: 0, net: 0 };
      cur.income += row.income;
      cur.expense += row.expense;
      cur.net += row.net;
      buckets.set(sort, cur);
    }
    return [...buckets.values()]
      .sort((a, b) => (a.sort < b.sort ? -1 : 1))
      .map(({ day, income, expense, net }) => ({ day, income, expense, net }));
  }, [dailyTrend, useWeeklyBuckets]);

  const trendTotals = useMemo(() => {
    const incomeTotal = dailyTrend.reduce((s, d) => s + d.income, 0);
    const expenseTotal = dailyTrend.reduce((s, d) => s + d.expense, 0);
    const net = incomeTotal - expenseTotal;
    const days = Math.max(periodDays, 1);
    return {
      incomeTotal,
      expenseTotal,
      net,
      avgDailySpend: expenseTotal / days,
    };
  }, [dailyTrend, periodDays]);

  const categoryChart = useMemo(() => {
    const total = cats.reduce((s, c) => s + c.total, 0) || 1;
    return cats
      .map((c) => ({
        name: c.name,
        total: c.total,
        pct: (c.total / total) * 100,
      }))
      .sort((a, b) => b.total - a.total);
  }, [cats]);

  const recent = useMemo(() => {
    type Row = {
      id: string;
      label: string;
      date: string;
      nativeAmount: number;
      nativeCurrency: string;
      kind: "income" | "expense";
      attachment_url: string | null;
    };
    const rows: Row[] = [
      ...income
        .filter((r) => r.account_id && !r.pending_receivable)
        .map((r) => ({
          id: r.id,
          label: r.description ?? r.category_name ?? "Income",
          date: r.received_date ?? r.date,
          nativeAmount: r.amount,
          nativeCurrency: r.account_currency || r.currency,
          kind: "income" as const,
          attachment_url: r.attachment_url,
        })),
      ...expenses
        .filter((r) => !r.pay_later && r.paid_date)
        .map((r) => ({
          id: r.id,
          label: r.description ?? r.category_name ?? "Expense",
          date: r.paid_date ?? r.bill_date,
          nativeAmount: r.amount,
          nativeCurrency: r.account_currency || "USD",
          kind: "expense" as const,
          attachment_url: r.attachment_url,
        })),
    ];
    rows.sort((a, b) => (a.date < b.date ? 1 : -1));
    return rows.slice(0, 12);
  }, [expenses, income]);

  const today = new Date();
  const overdue = debts.filter(
    (d) => d.due_date && new Date(d.due_date) < today && d.outstanding > 0,
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Dashboard</h2>
        <PeriodFilterBar
          from={applied.from}
          to={applied.to}
          preset={rangePreset}
          presets={DASHBOARD_PERIOD_PRESETS}
          onApply={({ from, to, preset }) => {
            setRangePreset(preset);
            setApplied({ from, to });
          }}
        />
      </div>
      {prevPeriodLabel ? (
        <p className="text-[11px] text-muted-foreground">
          {rangePreset === "this_month"
            ? "vs previous month"
            : rangePreset === "this_week"
              ? "vs previous week"
              : rangePreset === "this_year"
                ? "vs previous year (YTD)"
                : "vs prior period"}{" "}
          ({prevPeriodLabel}) · {displayCurrency}
        </p>
      ) : null}

      {error ? (
        <Card>
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      ) : null}

      {overdue.length > 0 && !loading ? (
        <div
          className="rounded-[var(--radius-md)] border border-border bg-muted px-2.5 py-1.5 text-xs text-foreground"
          role="status"
        >
          <strong>{overdue.length}</strong> overdue debt
          {overdue.length > 1 ? "s" : ""} — review on Debts.
        </div>
      ) : null}

      {loading && !error ? (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
          <div className="col-span-full space-y-2 rounded-[var(--radius-md)] border border-border bg-card p-3">
            <SkeletonLine className="h-4 w-40" />
            <SkeletonLine className="h-40 w-full" />
          </div>
        </div>
      ) : null}

      {!loading && !error ? (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <StatCard
              title="Net worth"
              value={nw ? formatMoneyAmountOnly(nw.net_worth) : "—"}
              tone={nw && nw.net_worth < 0 ? "negative" : "positive"}
              hint={`As of ${asOf} in ${displayCurrency}`}
              delta={compares?.netWorth.text}
              deltaTone={compares?.netWorth.tone}
            />
            <StatCard
              title="Income"
              value={pnl ? formatMoneyAmountOnly(pnl.total_income) : "—"}
              tone="positive"
              hint={`${periodFrom} → ${periodTo} · earned date`}
              delta={compares?.income.text}
              deltaTone={compares?.income.tone}
            />
            <StatCard
              title="Expenses"
              value={pnl ? formatMoneyAmountOnly(pnl.total_expenses) : "—"}
              tone="negative"
              hint="Bill date (includes unpaid pay-later)"
              delta={
                compares
                  ? [compares.expenses.text, compares.expenseShare].filter(Boolean).join(" · ")
                  : undefined
              }
              deltaTone={compares?.expenses.tone}
            />
            <StatCard
              title="Net"
              value={pnl ? formatMoneyAmountOnly(pnl.net) : "—"}
              tone={pnl && pnl.net < 0 ? "negative" : "positive"}
              hint="Earned − billed"
              delta={
                compares
                  ? [compares.net.text, compares.incomeKept].filter(Boolean).join(" · ")
                  : undefined
              }
              deltaTone={compares?.net.tone}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <StatCard
              title="Pay later unpaid"
              value={
                nw?.pay_later_unpaid != null
                  ? formatMoneyAmountOnly(nw.pay_later_unpaid)
                  : "—"
              }
              tone={nw?.pay_later_unpaid && nw.pay_later_unpaid > 0 ? "negative" : "neutral"}
              hint="Open bills not yet paid from accounts"
              delta={compares?.payLater.text}
              deltaTone={compares?.payLater.tone}
            />
            <StatCard
              title="Cash & accounts"
              value={nw ? formatMoneyAmountOnly(nw.cash_and_accounts) : "—"}
              tone="accent"
              hint="Sum of account balances in display currency"
              delta={compares?.cash.text}
              deltaTone={compares?.cash.tone}
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-xs font-semibold text-foreground">Cash movement</h3>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {useWeeklyBuckets ? "Weekly · " : "Daily · "}
                    earned / bill date
                  </p>
                </div>
              </div>
              <div className="mt-3 h-56 sm:h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={trend} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} vertical={false} />
                    <XAxis
                      dataKey="day"
                      {...chartAxisProps}
                      interval={useWeeklyBuckets ? 0 : "preserveStartEnd"}
                      tick={{ ...chartAxisProps.tick, fontSize: compactCharts ? 10 : 11 }}
                    />
                    <YAxis
                      {...chartAxisProps}
                      width={compactCharts ? 36 : 48}
                      tickFormatter={(v: number) =>
                        Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : String(v)
                      }
                    />
                    <Tooltip
                      formatter={(v: number, name: string) => [
                        formatMoney(v, displayCurrency),
                        name === "income" ? "Income" : name === "expense" ? "Expense" : "Net",
                      ]}
                      contentStyle={{
                        borderRadius: 6,
                        borderColor: chartTheme.tooltipBorder,
                        background: chartTheme.tooltipBg,
                        fontSize: 12,
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 11 }}
                      formatter={(value) =>
                        value === "income" ? "Income" : value === "expense" ? "Expense" : "Net"
                      }
                    />
                    <Bar
                      dataKey="income"
                      fill={chartTheme.income}
                      name="income"
                      radius={[3, 3, 0, 0]}
                      maxBarSize={compactCharts ? 24 : 16}
                    />
                    <Bar
                      dataKey="expense"
                      fill={chartTheme.expense}
                      name="expense"
                      radius={[3, 3, 0, 0]}
                      maxBarSize={compactCharts ? 24 : 16}
                    />
                    <Line
                      type="monotone"
                      dataKey="net"
                      name="net"
                      stroke={chartTheme.net}
                      strokeWidth={2}
                      dot={false}
                      strokeDasharray="4 3"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-2 sm:grid-cols-4">
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Income
                  </dt>
                  <dd className="mt-0.5 text-xs font-bold tabular-nums text-positive">
                    {formatMoney(trendTotals.incomeTotal, displayCurrency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Expense
                  </dt>
                  <dd className="mt-0.5 text-xs font-bold tabular-nums text-negative">
                    {formatMoney(trendTotals.expenseTotal, displayCurrency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Net
                  </dt>
                  <dd
                    className={`mt-0.5 text-xs font-bold tabular-nums ${
                      trendTotals.net >= 0 ? "text-positive" : "text-negative"
                    }`}
                  >
                    {formatMoney(trendTotals.net, displayCurrency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Avg / day
                  </dt>
                  <dd className="mt-0.5 text-xs font-bold tabular-nums text-foreground">
                    {formatMoney(trendTotals.avgDailySpend, displayCurrency)}
                  </dd>
                </div>
              </dl>
            </Card>

            <Card className="overflow-hidden p-0 lg:col-span-2">
              <div className="flex items-center justify-between border-b border-border px-2.5 py-1.5">
                <h3 className="text-xs font-semibold text-foreground">Top expenses</h3>
                <span className="text-[10px] text-muted-foreground">by category</span>
              </div>
              {categoryChart.length ? (
                <ul className="divide-y divide-border/70">
                  {categoryChart.map((c, i) => (
                    <li key={c.name} className="px-2.5 py-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{
                              background: chartTheme.categories[i % chartTheme.categories.length],
                            }}
                            aria-hidden
                          />
                          <span className="truncate font-medium text-foreground">{c.name}</span>
                        </span>
                        <span className="shrink-0 tabular-nums text-negative">
                          {formatMoneyAmountOnly(c.total)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max(c.pct, 2)}%`,
                              background: chartTheme.categories[i % chartTheme.categories.length],
                            }}
                          />
                        </div>
                        <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
                          {c.pct.toFixed(0)}%
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-2.5 py-2 text-xs text-muted-foreground">No expense categories in this period.</p>
              )}
            </Card>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Card className="p-2.5">
              <h3 className="text-xs font-semibold text-foreground">Accounts</h3>
              <ul className="mt-1.5 divide-y divide-border text-xs">
                {accounts.map((a) => (
                  <li key={a.id} className="flex justify-between gap-2 py-1.5">
                    <span className="truncate text-foreground">{a.name}</span>
                    <DisplayAmountCell
                      amount={a.balance}
                      nativeCurrency={a.currency}
                      tone="auto"
                      className="font-medium"
                    />
                  </li>
                ))}
                {!accounts.length ? (
                  <li className="py-1.5 text-muted-foreground">No accounts yet.</li>
                ) : null}
              </ul>
            </Card>

            <Card className="overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-border px-2.5 py-1.5">
                <h3 className="text-xs font-semibold text-foreground">Recent</h3>
                <span className="text-[10px] text-muted-foreground">{recent.length} in period</span>
              </div>
              <ul className="divide-y divide-border/70">
                {recent.map((r) => (
                  <li
                    key={`${r.kind}-${r.id}`}
                    className="flex items-center gap-2 px-2.5 py-1 text-xs"
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        r.kind === "income" ? "bg-positive" : "bg-negative"
                      }`}
                      aria-hidden
                    />
                    <span className="w-[4.25rem] shrink-0 tabular-nums text-muted-foreground">
                      {format(parseISO(r.date), "MMM d")}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-foreground">{r.label}</span>
                    {r.attachment_url ? (
                      <ReceiptPreviewIcon
                        url={r.attachment_url}
                        className="!rounded-[var(--radius-md)] !border-border !bg-transparent !p-1 !shadow-none"
                      />
                    ) : null}
                    <DisplayAmountCell
                      amount={r.nativeAmount}
                      nativeCurrency={r.nativeCurrency}
                      asOfDate={r.date}
                      prefix={r.kind === "income" ? "+" : "−"}
                      tone={r.kind === "income" ? "positive" : "negative"}
                      className="text-xs font-medium"
                    />
                  </li>
                ))}
                {!recent.length ? (
                  <li className="px-2.5 py-2 text-xs text-muted-foreground">No activity in this period.</li>
                ) : null}
              </ul>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
