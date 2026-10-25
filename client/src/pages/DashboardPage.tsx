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
import { DisplayAmountCell } from "@/components/DisplayAmountCell";
import { Modal } from "@/components/Modal";
import { PeriodFilterBar } from "@/components/PeriodFilterBar";
import { SkeletonLine } from "@/components/Skeleton";
import {
  TopExpensesCard,
  type TopExpenseRow,
} from "@/components/TopExpensesCard";
import { Amount, ListRow, PanelCard, PctChangeTag, StatRow } from "@/components/design";
import { useDisplayCurrency } from "@/context/DisplayCurrencyContext";
import { convertWithUsdMvrRate } from "@/lib/displayFx";
import { formatUnsignedAmount } from "@/lib/amountFormat";
import { formatSharePct } from "@/lib/periodCompare";
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
  const [infoHint, setInfoHint] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<AccountDto[]>([]);
  const [pnl, setPnl] = useState<Pnl | null>(null);
  const [pnlPrev, setPnlPrev] = useState<Pnl | null>(null);
  const [nw, setNw] = useState<NetWorth | null>(null);
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
        const [accs, pnlRes, pnlPrior, nwRes, inc, exp, d, br, brPrior] =
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
  }, [asOf, displayCurrency, periodFrom, periodTo, rangePreset]);

  const incomeKept = pnl
    ? formatSharePct(pnl.net, pnl.total_income, "of income kept")
    : null;

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
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-page-title text-ink">Home</h1>
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
          <PanelCard title={periodTitle(rangePreset)} caption={priorTitle(rangePreset)}>
            <StatRow
              label="Income"
              change={
                pnl && pnlPrev ? (
                  <PctChangeTag
                    current={pnl.total_income}
                    prior={pnlPrev.total_income}
                    higherIsBetter
                  />
                ) : null
              }
              value={
                <Amount
                  value={pnl?.total_income ?? 0}
                  currency={displayCurrency}
                  tone="credit"
                  size="lg"
                />
              }
              priorCaption={
                pnlPrev
                  ? `Prior ${formatUnsignedAmount(pnlPrev.total_income, displayCurrency)}`
                  : undefined
              }
            />
            <StatRow
              label="Expenses"
              change={
                pnl && pnlPrev ? (
                  <PctChangeTag
                    current={pnl.total_expenses}
                    prior={pnlPrev.total_expenses}
                    higherIsBetter={false}
                  />
                ) : null
              }
              value={
                <Amount
                  value={pnl?.total_expenses ?? 0}
                  currency={displayCurrency}
                  tone="debit"
                  size="lg"
                />
              }
              priorCaption={
                pnlPrev
                  ? `Prior ${formatUnsignedAmount(pnlPrev.total_expenses, displayCurrency)}`
                  : undefined
              }
            />
            <StatRow
              label="Net"
              change={
                pnl && pnlPrev ? (
                  <PctChangeTag current={pnl.net} prior={pnlPrev.net} higherIsBetter />
                ) : null
              }
              value={
                <Amount
                  value={pnl?.net ?? 0}
                  currency={displayCurrency}
                  tone="auto"
                  size="lg"
                />
              }
              caption={incomeKept ?? undefined}
            />
            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
              <span className="text-caption">Avg spend per day</span>
              <span className="text-sm font-semibold tabular-nums text-ink">
                {formatUnsignedAmount(trendTotals.avgDailySpend, displayCurrency)}
              </span>
            </div>
          </PanelCard>

          <PanelCard title="Balance position">
            <ListRow
              primary="Cash & accounts"
              secondary={
                <button
                  type="button"
                  className="text-caption underline-offset-2 hover:underline"
                  onClick={() =>
                    setInfoHint("Sum of account balances in the selected display currency.")
                  }
                >
                  What is this?
                </button>
              }
              right={
                <Amount
                  value={nw?.cash_and_accounts ?? 0}
                  currency={displayCurrency}
                  tone="plain"
                  signed={false}
                />
              }
            />
            <ListRow
              primary="Pay later unpaid"
              secondary={
                <button
                  type="button"
                  className="text-caption underline-offset-2 hover:underline"
                  onClick={() =>
                    setInfoHint("Open bills not yet paid from accounts.")
                  }
                >
                  What is this?
                </button>
              }
              right={
                <Amount
                  value={nw?.pay_later_unpaid ?? 0}
                  currency={displayCurrency}
                  tone="debit"
                />
              }
            />
            <ListRow
              primary="Net worth"
              secondary={
                <button
                  type="button"
                  className="text-caption underline-offset-2 hover:underline"
                  onClick={() =>
                    setInfoHint(`As of ${asOf} in ${displayCurrency}.`)
                  }
                >
                  What is this?
                </button>
              }
              right={
                <Amount
                  value={nw?.net_worth ?? 0}
                  currency={displayCurrency}
                  tone={(nw?.net_worth ?? 0) < 0 ? "debit" : "plain"}
                  signed={(nw?.net_worth ?? 0) < 0}
                />
              }
            />
          </PanelCard>

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

      <Modal open={infoHint != null} title="About this figure" onClose={() => setInfoHint(null)}>
        <p className="text-sm text-ink">{infoHint}</p>
      </Modal>
    </div>
  );
}
