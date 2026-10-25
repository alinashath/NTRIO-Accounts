import { useEffect, useMemo, useState } from "react";
import {
  eachDayOfInterval,
  format,
  parseISO,
  startOfWeek,
  differenceInCalendarDays,
} from "date-fns";
import { Link } from "react-router-dom";
import { apiFetch } from "@/api/http";
import { CashMovementChart } from "@/components/CashMovementChart";
import { PeriodFilterBar } from "@/components/PeriodFilterBar";
import { SkeletonLine } from "@/components/Skeleton";
import { useDisplayCurrency } from "@/context/DisplayCurrencyContext";
import { convertWithUsdMvrRate } from "@/lib/displayFx";
import {
  DASHBOARD_PERIOD_PRESETS,
  type RangePreset,
  thisMonthRange,
} from "@/lib/reportPeriod";
import type { ExpenseEntryDto, IncomeEntryDto } from "../../../shared/types";

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

export function CashMovementPage() {
  const { displayCurrency, getUsdMvrRateForDate } = useDisplayCurrency();
  const compactCharts = useCompactCharts();
  const initial = thisMonthRange();
  const [rangePreset, setRangePreset] = useState<RangePreset>("this_month");
  const [applied, setApplied] = useState(initial);
  const [income, setIncome] = useState<IncomeEntryDto[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntryDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const periodFrom = applied.from;
  const periodTo = applied.to;
  const periodDays =
    differenceInCalendarDays(parseISO(periodTo), parseISO(periodFrom)) + 1;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [inc, exp] = await Promise.all([
          apiFetch<IncomeEntryDto[]>(
            `/api/income?from=${encodeURIComponent(periodFrom)}&to=${encodeURIComponent(periodTo)}`,
          ),
          apiFetch<ExpenseEntryDto[]>(
            `/api/expenses?from=${encodeURIComponent(periodFrom)}&to=${encodeURIComponent(periodTo)}`,
          ),
        ]);
        if (cancelled) return;
        setIncome(inc);
        setExpenses(exp);
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
  }, [displayCurrency, periodFrom, periodTo]);

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
    for (const d of days) d.net = d.income - d.expense;
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

  const totals = useMemo(() => {
    const incomeTotal = dailyTrend.reduce((s, d) => s + d.income, 0);
    const expenseTotal = dailyTrend.reduce((s, d) => s + d.expense, 0);
    return {
      incomeTotal,
      expenseTotal,
      net: incomeTotal - expenseTotal,
      avgDailySpend: expenseTotal / Math.max(periodDays, 1),
    };
  }, [dailyTrend, periodDays]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link to="/accounts" className="text-sm font-semibold text-action">
            ← Home
          </Link>
          <h1 className="mt-1 text-page-title text-ink">Daily chart</h1>
        </div>
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

      {error ? <p className="text-sm text-debit">{error}</p> : null}
      {loading ? (
        <div className="space-y-3 rounded-[var(--radius)] border border-border bg-surface p-4">
          <SkeletonLine className="h-4 w-40" />
          <SkeletonLine className="h-48 w-full" />
        </div>
      ) : (
        <CashMovementChart
          data={trend}
          currency={displayCurrency}
          weekly={useWeeklyBuckets}
          compact={compactCharts}
          incomeTotal={totals.incomeTotal}
          expenseTotal={totals.expenseTotal}
          netTotal={totals.net}
          avgDailySpend={totals.avgDailySpend}
        />
      )}
    </div>
  );
}
