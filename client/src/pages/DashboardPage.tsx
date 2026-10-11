import { useEffect, useMemo, useState } from "react";
import {
  eachDayOfInterval,
  format,
  parseISO,
  startOfWeek,
  differenceInCalendarDays,
} from "date-fns";
import {
  ArrowDownRight,
  ArrowUpRight,
  Minus,
} from "lucide-react";
import { apiFetch } from "@/api/http";
import { AccountsCard } from "@/components/AccountsCard";
import { CashMovementCard } from "@/components/CashMovementCard";
import { DisplayAmountCell } from "@/components/DisplayAmountCell";
import { PeriodFilterBar } from "@/components/PeriodFilterBar";
import { ReceiptPreviewIcon } from "@/components/ReceiptPreviewIcon";
import { SkeletonCard, SkeletonLine } from "@/components/Skeleton";
import { Sparkline } from "@/components/Sparkline";
import {
  colorForCategory,
  TopExpensesCard,
  type TopExpenseRow,
} from "@/components/TopExpensesCard";
import { StatCard } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useDisplayCurrency } from "@/context/DisplayCurrencyContext";
import { chartTheme } from "@/lib/chartTheme";
import { convertWithUsdMvrRate } from "@/lib/displayFx";
import { formatMoney, formatMoneyAmountOnly } from "@/lib/money";
import { cn } from "@/lib/utils";
import { formatSharePct, formatVsPrior, pctChange } from "@/lib/periodCompare";
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

function periodTitle(preset: RangePreset): string {
  switch (preset) {
    case "this_week":
      return "This week";
    case "this_month":
      return "This month";
    case "last_month":
      return "Last month";
    case "this_year":
      return "This year";
    default:
      return "This period";
  }
}

function priorTitle(preset: RangePreset): string {
  switch (preset) {
    case "this_week":
      return "vs previous week";
    case "this_month":
      return "vs previous month";
    case "this_year":
      return "vs previous year (YTD)";
    default:
      return "vs prior period";
  }
}

/** Compact range for card subtitles, e.g. Oct 1–11 or Sep 28–Oct 4. */
function shortRangeLabel(fromYmd: string, toYmd: string): string {
  const from = parseISO(fromYmd);
  const to = parseISO(toYmd);
  if (from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth()) {
    return `${format(from, "MMM d")}–${format(to, "d")}`;
  }
  return `${format(from, "MMM d")}–${format(to, "MMM d")}`;
}

function DeltaBadge({
  current,
  prior,
  higherIsBetter,
}: {
  current: number;
  prior: number;
  higherIsBetter: boolean;
}) {
  const pct = pctChange(current, prior);
  const delta = current - prior;
  const flat = Math.abs(delta) < 0.005 || pct === 0;
  const up = delta > 0;
  const good = flat ? null : up === higherIsBetter;
  const variant = flat ? "neutral" : good ? "positive" : "negative";
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const label =
    pct == null
      ? flat
        ? "Flat"
        : `${up ? "+" : "−"}${formatMoneyAmountOnly(Math.abs(delta))}`
      : `${pct > 0 ? "+" : ""}${pct.toFixed(0)}%`;

  return (
    <Badge variant={variant} className="gap-0.5">
      <Icon className="h-3 w-3" aria-hidden />
      <span>{label}</span>
    </Badge>
  );
}

export function DashboardPage() {
  const { displayCurrency, globalUsdMvrRate, getUsdMvrRateForDate } = useDisplayCurrency();
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
  const [topExpenses, setTopExpenses] = useState<TopExpenseRow[]>([]);
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
        const [accs, pnlRes, pnlPrior, nwRes, nwPrior, inc, exp, d, br, brPrior] =
          await Promise.all([
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
            apiFetch<{ rows: CatRow[] }>(
              `/api/reports/category-breakdown?from=${encodeURIComponent(prev.from)}&to=${encodeURIComponent(prev.to)}&display_currency=${encodeURIComponent(displayCurrency)}`,
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
        const currentExp = br.rows
          .filter((r) => r.kind === "expense")
          .sort((a, b) => b.total - a.total)
          .slice(0, 5);
        const priorByName = new Map(
          brPrior.rows
            .filter((r) => r.kind === "expense")
            .map((r) => [r.name, r.total] as const),
        );
        setTopExpenses(
          currentExp.map((r, i) => ({
            name: r.name,
            current: r.total,
            previous: priorByName.get(r.name) ?? 0,
            color: colorForCategory(i),
          })),
        );
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

  const incomeSpark = useMemo(() => dailyTrend.map((d) => d.income), [dailyTrend]);
  const expenseSpark = useMemo(() => dailyTrend.map((d) => d.expense), [dailyTrend]);
  const netSpark = useMemo(() => dailyTrend.map((d) => d.net), [dailyTrend]);

  const priorRange = useMemo(
    () => comparablePriorPeriod(periodFrom, periodTo, rangePreset),
    [periodFrom, periodTo, rangePreset],
  );
  const topExpensesPeriodLabel = shortRangeLabel(periodFrom, periodTo);
  const topExpensesPriorLabel = shortRangeLabel(priorRange.from, priorRange.to);

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

  const rangeLabel = `${format(parseISO(periodFrom), "MMM d")} – ${format(parseISO(periodTo), "MMM d, yyyy")}`;

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-foreground">Home</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground sm:hidden">{rangeLabel}</p>
        </div>
        <div className="w-full min-w-0 sm:w-auto [&_button]:h-11 [&_button]:w-full [&_button]:justify-start sm:[&_button]:h-8 sm:[&_button]:w-auto">
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
      </div>

      {error ? (
        <Card className="p-4">
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      ) : null}

      {overdue.length > 0 && !loading ? (
        <div
          className="rounded-[var(--radius-lg)] border border-border bg-muted/80 px-3 py-2.5 text-sm text-foreground"
          role="status"
        >
          <strong>{overdue.length}</strong> overdue debt
          {overdue.length > 1 ? "s" : ""} — review on Debts.
        </div>
      ) : null}

      {loading && !error ? (
        <div className="space-y-3">
          <div className="rounded-[var(--radius-lg)] border border-border bg-card p-4 space-y-3">
            <SkeletonLine className="h-4 w-32" />
            <SkeletonLine className="h-10 w-full" />
            <div className="grid grid-cols-2 gap-3">
              <SkeletonLine className="h-24 w-full" />
              <SkeletonLine className="h-24 w-full" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </div>
      ) : null}

      {!loading && !error ? (
        <>
          {/* 1. Period income / expense — primary mobile card */}
          <Card className="overflow-hidden gap-0">
            <CardHeader className="pb-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle>{periodTitle(rangePreset)}</CardTitle>
                  <CardDescription className="mt-1">
                    {priorTitle(rangePreset)}
                    {prevPeriodLabel ? (
                      <span className="hidden sm:inline"> · {prevPeriodLabel}</span>
                    ) : null}
                    {" · "}
                    {displayCurrency}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0 rounded-[var(--radius-md)] bg-muted/50 p-3">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Income
                    </p>
                    {pnl && pnlPrev ? (
                      <DeltaBadge
                        current={pnl.total_income}
                        prior={pnlPrev.total_income}
                        higherIsBetter
                      />
                    ) : null}
                  </div>
                  <p className="mt-1 text-xl font-bold tabular-nums tracking-tight text-positive sm:text-2xl">
                    {pnl ? formatMoneyAmountOnly(pnl.total_income) : "—"}
                  </p>
                  {pnlPrev ? (
                    <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                      Prior {formatMoneyAmountOnly(pnlPrev.total_income)}
                    </p>
                  ) : null}
                  <Sparkline
                    className="mt-2"
                    values={incomeSpark}
                    color={chartTheme.income}
                    height={44}
                    label="Income trend this period"
                  />
                </div>

                <div className="min-w-0 rounded-[var(--radius-md)] bg-muted/50 p-3">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Expenses
                    </p>
                    {pnl && pnlPrev ? (
                      <DeltaBadge
                        current={pnl.total_expenses}
                        prior={pnlPrev.total_expenses}
                        higherIsBetter={false}
                      />
                    ) : null}
                  </div>
                  <p className="mt-1 text-xl font-bold tabular-nums tracking-tight text-negative sm:text-2xl">
                    {pnl ? formatMoneyAmountOnly(pnl.total_expenses) : "—"}
                  </p>
                  {pnlPrev ? (
                    <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                      Prior {formatMoneyAmountOnly(pnlPrev.total_expenses)}
                    </p>
                  ) : null}
                  <Sparkline
                    className="mt-2"
                    values={expenseSpark}
                    color={chartTheme.expense}
                    height={44}
                    label="Expense trend this period"
                  />
                </div>
              </div>

              <div className="mt-3 flex items-center gap-3 rounded-[var(--radius-md)] border border-border/70 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Net
                    </p>
                    {pnl && pnlPrev ? (
                      <DeltaBadge current={pnl.net} prior={pnlPrev.net} higherIsBetter />
                    ) : null}
                    {compares?.incomeKept ? (
                      <span className="text-[11px] text-muted-foreground">{compares.incomeKept}</span>
                    ) : null}
                  </div>
                  <p
                    className={cn(
                      "mt-0.5 text-lg font-bold tabular-nums tracking-tight sm:text-xl",
                      pnl && pnl.net < 0 ? "text-negative" : "text-positive",
                    )}
                  >
                    {pnl ? formatMoneyAmountOnly(pnl.net) : "—"}
                  </p>
                </div>
                <Sparkline
                  className="w-24 shrink-0 sm:w-32"
                  values={netSpark}
                  color={chartTheme.net}
                  height={40}
                  label="Net trend this period"
                />
              </div>
            </CardContent>
            <CardFooter className="justify-between text-[11px] text-muted-foreground">
              <span>Earned − billed</span>
              <span className="tabular-nums">
                Avg spend {formatMoney(trendTotals.avgDailySpend, displayCurrency)}/day
              </span>
            </CardFooter>
          </Card>

          {/* 2. Balance snapshot */}
          <div className="grid grid-cols-2 gap-2 sm:gap-2.5 lg:grid-cols-3">
            <StatCard
              title="Net worth"
              value={nw ? formatMoneyAmountOnly(nw.net_worth) : "—"}
              tone={nw && nw.net_worth < 0 ? "negative" : "positive"}
              hint={`As of ${asOf} in ${displayCurrency}`}
              delta={compares?.netWorth.text}
              deltaTone={compares?.netWorth.tone}
            />
            <StatCard
              title="Cash & accounts"
              value={nw ? formatMoneyAmountOnly(nw.cash_and_accounts) : "—"}
              tone="accent"
              hint="Sum of account balances in display currency"
              delta={compares?.cash.text}
              deltaTone={compares?.cash.tone}
            />
            <div className="col-span-2 lg:col-span-1">
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
            </div>
          </div>

          {/* 3. Cash movement + accounts */}
          <div className="grid gap-3 lg:grid-cols-5">
            <CashMovementCard
              className="lg:col-span-3"
              data={trend}
              currency={displayCurrency}
              weekly={useWeeklyBuckets}
              compact={compactCharts}
              incomeTotal={trendTotals.incomeTotal}
              expenseTotal={trendTotals.expenseTotal}
              netTotal={trendTotals.net}
              avgDailySpend={trendTotals.avgDailySpend}
            />

            <AccountsCard
              className="lg:col-span-2"
              accounts={accounts}
              displayCurrency={displayCurrency}
              usdMvrRate={globalUsdMvrRate}
            />
          </div>

          {/* 4. Top expenses + recent */}
          <div className="grid gap-3 lg:grid-cols-2">
            <TopExpensesCard
              rows={topExpenses}
              currency={displayCurrency}
              periodLabel={topExpensesPeriodLabel}
              priorLabel={topExpensesPriorLabel}
            />

            <Card className="gap-0 overflow-hidden">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>Recent</CardTitle>
                  <span className="text-[10px] text-muted-foreground">{recent.length} in period</span>
                </div>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <ul className="divide-y divide-border/70">
                  {recent.map((r) => (
                    <li
                      key={`${r.kind}-${r.id}`}
                      className="flex min-h-12 items-center gap-2.5 px-4 py-2.5 text-sm"
                    >
                      <span
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full",
                          r.kind === "income" ? "bg-positive" : "bg-negative",
                        )}
                        aria-hidden
                      />
                      <span className="w-12 shrink-0 tabular-nums text-muted-foreground sm:w-[4.25rem]">
                        {format(parseISO(r.date), compactCharts ? "M/d" : "MMM d")}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-foreground">{r.label}</span>
                      {r.attachment_url ? (
                        <ReceiptPreviewIcon
                          url={r.attachment_url}
                          className="!min-h-9 !min-w-9 !rounded-[var(--radius-md)] !border-border !bg-transparent !p-1.5 !shadow-none sm:!min-h-0 sm:!min-w-0 sm:!p-1"
                        />
                      ) : null}
                      <DisplayAmountCell
                        amount={r.nativeAmount}
                        nativeCurrency={r.nativeCurrency}
                        asOfDate={r.date}
                        prefix={r.kind === "income" ? "+" : "−"}
                        tone={r.kind === "income" ? "positive" : "negative"}
                        className="text-sm font-medium"
                      />
                    </li>
                  ))}
                  {!recent.length ? (
                    <li className="px-4 py-3 text-sm text-muted-foreground">
                      No activity in this period.
                    </li>
                  ) : null}
                </ul>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
