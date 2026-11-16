import { useEffect, useMemo, useState } from "react";
import {
  eachDayOfInterval,
  format,
  parseISO,
  differenceInCalendarDays,
} from "date-fns";
import { Link } from "react-router-dom";
import { apiFetch } from "@/api/http";
import { AccountsCard } from "@/components/AccountsCard";
import { CashMovementCard } from "@/components/CashMovementCard";
import { DashboardFinanceCards } from "@/components/DashboardFinanceCards";
import { DisplayAmountCell } from "@/components/DisplayAmountCell";
import { PeriodFilterBar } from "@/components/PeriodFilterBar";
import { ProjectFilter } from "@/components/ProjectFilter";
import { SkeletonLine } from "@/components/Skeleton";
import {
  TopExpensesCard,
  type TopExpenseRow,
} from "@/components/TopExpensesCard";
import { PanelCard } from "@/components/design";
import { useDisplayCurrency } from "@/context/DisplayCurrencyContext";
import { appendProjectFilter } from "@/context/ProjectsContext";
import { convertWithUsdMvrRate } from "@/lib/displayFx";
import { toMoney } from "@/lib/money";
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
  cash_after_pay_later?: number | null;
  display_currency?: string | null;
};

type NativeCcyRow = {
  currency: string;
  opening: number;
  ending: number;
  added: number;
  spent: number;
};

type CashflowSnapshot = {
  cash_beginning: number;
  cash_ending: number;
  cash_from_income: number;
  cash_paid_expenses: number;
  adjustments: number;
  debt_collections: number;
  debt_repayments: number;
  net_change_in_cash: number;
  reconciling_diff: number;
  transfer_fx_gain: number;
  native_by_currency: NativeCcyRow[];
};

type CatRow = {
  kind: string;
  name: string;
  total: number;
};

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

function shortRangeLabel(fromYmd: string, toYmd: string): string {
  const from = parseISO(fromYmd);
  const to = parseISO(toYmd);
  if (from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth()) {
    return `${format(from, "MMM d")}–${format(to, "d")}`;
  }
  return `${format(from, "MMM d")}–${format(to, "MMM d")}`;
}

export function DashboardPage() {
  const { displayCurrency, globalUsdMvrRate, getUsdMvrRateForDate } = useDisplayCurrency();
  const initial = thisMonthRange();

  const [rangePreset, setRangePreset] = useState<RangePreset>("this_month");
  const [applied, setApplied] = useState(initial);
  const [filterProject, setFilterProject] = useState("");

  const [accounts, setAccounts] = useState<AccountDto[]>([]);
  const [pnl, setPnl] = useState<Pnl | null>(null);
  const [pnlPrev, setPnlPrev] = useState<Pnl | null>(null);
  const [nw, setNw] = useState<NetWorth | null>(null);
  const [cashFx, setCashFx] = useState<CashflowSnapshot | null>(null);
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
      const pj = (base: string) => {
        const q = new URLSearchParams(base.includes("?") ? base.split("?")[1] : "");
        const path = base.includes("?") ? base.split("?")[0] : base;
        appendProjectFilter(q, filterProject);
        return `${path}?${q.toString()}`;
      };
      try {
        const [accs, pnlRes, pnlPrior, nwRes, cfRes, inc, exp, d, br, brPrior] =
          await Promise.all([
            apiFetch<AccountDto[]>("/api/accounts"),
            apiFetch<Pnl>(
              pj(`/api/reports/pnl?from=${encodeURIComponent(periodFrom)}&to=${encodeURIComponent(periodTo)}&display_currency=${encodeURIComponent(displayCurrency)}`),
            ),
            apiFetch<Pnl>(
              pj(`/api/reports/pnl?from=${encodeURIComponent(prev.from)}&to=${encodeURIComponent(prev.to)}&display_currency=${encodeURIComponent(displayCurrency)}`),
            ),
            apiFetch<NetWorth>(
              pj(`/api/reports/net-worth?as_of=${encodeURIComponent(asOf)}&display_currency=${encodeURIComponent(displayCurrency)}`),
            ),
            apiFetch<{
              cash_beginning: number;
              cash_ending: number;
              operating: {
                cash_from_income: number;
                cash_paid_expenses: number;
                adjustments: number;
              };
              financing: { debt_collections: number; debt_repayments: number };
              net_change_in_cash: number;
              reconciling_diff: number;
              transfer_fx_gain?: number;
              native_by_currency?: NativeCcyRow[];
            }>(
              pj(`/api/reports/cashflow?from=${encodeURIComponent(periodFrom)}&to=${encodeURIComponent(periodTo)}&display_currency=${encodeURIComponent(displayCurrency)}`),
            ),
            apiFetch<IncomeEntryDto[]>(
              pj(`/api/income?from=${encodeURIComponent(periodFrom)}&to=${encodeURIComponent(periodTo)}`),
            ),
            apiFetch<ExpenseEntryDto[]>(
              pj(`/api/expenses?from=${encodeURIComponent(periodFrom)}&to=${encodeURIComponent(periodTo)}`),
            ),
            apiFetch<DebtDto[]>("/api/debts?status=open"),
            apiFetch<{ rows: CatRow[] }>(
              pj(`/api/reports/category-breakdown?from=${encodeURIComponent(periodFrom)}&to=${encodeURIComponent(periodTo)}&display_currency=${encodeURIComponent(displayCurrency)}`),
            ),
            apiFetch<{ rows: CatRow[] }>(
              pj(`/api/reports/category-breakdown?from=${encodeURIComponent(prev.from)}&to=${encodeURIComponent(prev.to)}&display_currency=${encodeURIComponent(displayCurrency)}`),
            ),
          ]);
        if (cancelled) return;
        setAccounts(accs);
        setPnl(pnlRes);
        setPnlPrev(pnlPrior);
        setNw(nwRes);
        setCashFx({
          cash_beginning: cfRes.cash_beginning ?? 0,
          cash_ending: cfRes.cash_ending ?? 0,
          cash_from_income: cfRes.operating?.cash_from_income ?? 0,
          cash_paid_expenses: cfRes.operating?.cash_paid_expenses ?? 0,
          adjustments: cfRes.operating?.adjustments ?? 0,
          debt_collections: cfRes.financing?.debt_collections ?? 0,
          debt_repayments: cfRes.financing?.debt_repayments ?? 0,
          net_change_in_cash: cfRes.net_change_in_cash ?? 0,
          reconciling_diff: cfRes.reconciling_diff ?? 0,
          transfer_fx_gain: cfRes.transfer_fx_gain ?? 0,
          native_by_currency: cfRes.native_by_currency ?? [],
        });
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
          currentExp.map((r) => ({
            name: r.name,
            current: r.total,
            previous: priorByName.get(r.name) ?? 0,
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
  }, [asOf, displayCurrency, filterProject, periodFrom, periodTo, rangePreset]);

  const cashPath = useMemo(() => {
    if (!cashFx) return null;
    const adjIn = Math.max(cashFx.adjustments, 0);
    const adjOut = Math.max(-cashFx.adjustments, 0);
    const added = cashFx.cash_from_income + adjIn + cashFx.debt_collections;
    const spent = cashFx.cash_paid_expenses + adjOut + cashFx.debt_repayments;
    const forex = cashFx.transfer_fx_gain;
    // Residual after peeling Forex gain out of the cashflow reconciling line
    // so Opening + Added − Spent + Forex + Rate effect = Cash now.
    const rateEffect = cashFx.reconciling_diff - forex;
    const cashNow = nw?.cash_and_accounts ?? cashFx.cash_ending;
    const payLater = nw?.pay_later_unpaid ?? 0;
    const available =
      nw?.cash_after_pay_later ?? cashNow - payLater;
    const impliedCashNow =
      cashFx.cash_beginning + (added - spent) + forex + rateEffect;
    const closes = Math.abs(impliedCashNow - cashNow) < 0.02;

    const by = (ccy: string) =>
      cashFx.native_by_currency.find((r) => r.currency.toUpperCase() === ccy) ?? {
        currency: ccy,
        opening: 0,
        ending: 0,
        added: 0,
        spent: 0,
      };
    const mvr = by("MVR");
    const usd = by("USD");

    // Pay later unpaid by bill currency (native, not FX-converted).
    const payLaterNative = { mvr: 0, usd: 0 };
    for (const e of expenses) {
      if (!e.pay_later) continue;
      if (e.paid_date) continue;
      const ccy = (e.bill_currency ?? e.account_currency ?? "USD").toUpperCase();
      if (ccy === "MVR") payLaterNative.mvr += e.amount;
      else if (ccy === "USD") payLaterNative.usd += e.amount;
    }

    return {
      opening: cashFx.cash_beginning,
      added,
      spent,
      forex,
      rateEffect,
      cashNow,
      payLater,
      available,
      closes,
      native: {
        opening: { mvr: mvr.opening, usd: usd.opening },
        added: { mvr: mvr.added, usd: usd.added },
        spent: { mvr: -mvr.spent, usd: -usd.spent },
        cashNow: { mvr: mvr.ending, usd: usd.ending },
        payLater: { mvr: -payLaterNative.mvr, usd: -payLaterNative.usd },
        available: {
          mvr: mvr.ending - payLaterNative.mvr,
          usd: usd.ending - payLaterNative.usd,
        },
      },
    };
  }, [cashFx, expenses, nw]);

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

  /** Opening → daily cash in/out (received / paid) → snap end to cash now. */
  const cashCurve = useMemo(() => {
    if (!cashPath) return [];
    const start = parseISO(periodFrom);
    const end = parseISO(periodTo);
    const days = eachDayOfInterval({ start, end }).map((d) => ({
      key: format(d, "yyyy-MM-dd"),
      day: format(d, "MMM d"),
      net: 0,
    }));
    const idx = new Map(days.map((d, i) => [d.key, i]));

    for (const row of income) {
      if (!row.account_id || row.pending_receivable) continue;
      const key = format(new Date(row.received_date ?? row.date), "yyyy-MM-dd");
      const i = idx.get(key);
      if (i == null) continue;
      days[i]!.net += convertWithUsdMvrRate(
        row.amount,
        row.account_currency || row.currency || "USD",
        displayCurrency,
        getUsdMvrRateForDate(key),
      );
    }
    for (const row of expenses) {
      if (row.pay_later || !row.paid_date) continue;
      const key = format(new Date(row.paid_date), "yyyy-MM-dd");
      const i = idx.get(key);
      if (i == null) continue;
      days[i]!.net -= convertWithUsdMvrRate(
        row.amount,
        row.account_currency || "USD",
        displayCurrency,
        getUsdMvrRateForDate(key),
      );
    }

    const points: { key: string; day: string; v: number }[] = [
      {
        key: `${periodFrom}#open`,
        day: format(start, "MMM d"),
        v: toMoney(cashPath.opening),
      },
    ];
    let running = cashPath.opening;
    for (const d of days) {
      running = toMoney(running + d.net);
      points.push({ key: d.key, day: d.day, v: running });
    }
    if (points.length) {
      points[points.length - 1]!.v = toMoney(cashPath.cashNow);
    }
    return points;
  }, [
    cashPath,
    displayCurrency,
    expenses,
    getUsdMvrRateForDate,
    income,
    periodFrom,
    periodTo,
  ]);

  const trendTotals = useMemo(() => {
    const incomeTotal = dailyTrend.reduce((s, d) => s + d.income, 0);
    const expenseTotal = dailyTrend.reduce((s, d) => s + d.expense, 0);
    return {
      incomeTotal,
      expenseTotal,
      net: incomeTotal - expenseTotal,
      avgDailySpend: expenseTotal / Math.max(periodDays, 1),
    };
  }, [dailyTrend, periodDays]);

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
        })),
    ];
    rows.sort((a, b) => (a.date < b.date ? 1 : -1));
    return rows.slice(0, 12);
  }, [expenses, income]);

  const recentByDate = useMemo(() => {
    const map = new Map<string, typeof recent>();
    for (const r of recent) {
      const list = map.get(r.date) ?? [];
      list.push(r);
      map.set(r.date, list);
    }
    return [...map.entries()];
  }, [recent]);

  const today = new Date();
  const overdue = debts.filter(
    (d) => d.due_date && new Date(d.due_date) < today && d.outstanding > 0,
  );

  const rangeLabel = `${format(parseISO(periodFrom), "MMM d")} – ${format(parseISO(periodTo), "MMM d, yyyy")}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-page-title text-ink">Home</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[10rem]">
            <ProjectFilter value={filterProject} onChange={setFilterProject} />
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
      </div>

      {error ? (
        <PanelCard title="Error">
          <p className="px-4 pb-4 text-sm text-debit">{error}</p>
        </PanelCard>
      ) : null}

      {overdue.length > 0 && !loading ? (
        <div
          className="rounded-[var(--radius)] border border-border bg-surface px-4 py-3 text-sm text-ink"
          role="status"
        >
          <strong>{overdue.length}</strong> overdue debt
          {overdue.length > 1 ? "s" : ""} — review on{" "}
          <Link to="/accounts/debts" className="font-semibold text-action">
            Debts
          </Link>
          .
        </div>
      ) : null}

      {loading && !error ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="space-y-3 rounded-[var(--radius)] border border-border bg-surface p-4"
            >
              <SkeletonLine className="h-4 w-32 bg-border" />
              <SkeletonLine className="h-8 w-full bg-border" />
              <SkeletonLine className="h-8 w-3/4 bg-border" />
            </div>
          ))}
        </div>
      ) : null}

      {!loading && !error ? (
        <>
          <DashboardFinanceCards
            currency={displayCurrency}
            periodTitle={periodTitle(rangePreset)}
            priorCaption={priorTitle(rangePreset)}
            asOfLabel={format(parseISO(asOf), "MMM d, yyyy")}
            pnl={pnl}
            pnlPrev={pnlPrev}
            forexGain={cashFx?.transfer_fx_gain ?? 0}
            avgDailySpend={trendTotals.avgDailySpend}
            cashPath={cashPath}
            cashCurve={cashCurve}
            netWorth={nw?.net_worth ?? 0}
          />

          <CashMovementCard
            currency={displayCurrency}
            incomeTotal={trendTotals.incomeTotal}
            expenseTotal={trendTotals.expenseTotal}
            chartHref="/accounts/cash-movement"
          />

          <AccountsCard
            accounts={accounts}
            displayCurrency={displayCurrency}
            usdMvrRate={globalUsdMvrRate}
          />

          <TopExpensesCard
            rows={topExpenses}
            currency={displayCurrency}
            periodLabel={topExpensesPeriodLabel}
            priorLabel={topExpensesPriorLabel}
          />

          <PanelCard title="Recent transactions" href="/accounts/expenses" linkLabel="View all">
            {recentByDate.length ? (
              <ul>
                {recentByDate.map(([date, rows]) => (
                  <li key={date}>
                    <p className="sticky top-0 border-t border-border bg-surface px-4 py-2 text-label">
                      {format(parseISO(date), "EEE, MMM d")}
                    </p>
                    {rows.map((r) => (
                      <div
                        key={`${r.kind}-${r.id}`}
                        className="flex items-center gap-3 border-t border-border px-4 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">{r.label}</p>
                          <p className="mt-0.5 text-caption">
                            {format(parseISO(r.date), "MMM d")}
                          </p>
                        </div>
                        <DisplayAmountCell
                          amount={r.nativeAmount}
                          nativeCurrency={r.nativeCurrency}
                          asOfDate={r.date}
                          prefix={r.kind === "income" ? "+" : "\u2212"}
                          tone={r.kind === "income" ? "positive" : "negative"}
                          className="text-sm font-semibold"
                        />
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-4 pb-4">
                <p className="text-caption">No activity in this period.</p>
                <Link
                  to="/accounts/income"
                  className="mt-3 inline-flex min-h-11 items-center rounded-sm border border-action px-4 text-sm font-semibold text-action"
                >
                  Add first transaction
                </Link>
              </div>
            )}
          </PanelCard>

          <p className="text-center text-caption">{rangeLabel}</p>
        </>
      ) : null}
    </div>
  );
}
