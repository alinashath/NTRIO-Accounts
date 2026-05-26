import { useEffect, useMemo, useState } from "react";
import { eachDayOfInterval, format, subDays } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import { apiFetch } from "@/api/http";
import { DisplayAmountCell } from "@/components/DisplayAmountCell";
import { ReceiptPreviewIcon } from "@/components/ReceiptPreviewIcon";
import { SkeletonCard, SkeletonLine } from "@/components/Skeleton";
import { Card, StatCard } from "@/components/ui";
import { useDisplayCurrency } from "@/context/DisplayCurrencyContext";
import { convertWithUsdMvrRate } from "@/lib/displayFx";
import { formatMoney, formatMoneyAmountOnly } from "@/lib/money";
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

const COLORS = ["#0f172a", "#2563eb", "#16a34a", "#f97316", "#a855f7"];

export function DashboardPage() {
  const { displayCurrency, globalUsdMvrRate } = useDisplayCurrency();
  const today = new Date();
  const monthStart = format(new Date(today.getFullYear(), today.getMonth(), 1), "yyyy-MM-dd");
  const monthEnd = format(today, "yyyy-MM-dd");
  const from30 = format(subDays(today, 29), "yyyy-MM-dd");
  const asOf = format(today, "yyyy-MM-dd");

  const [accounts, setAccounts] = useState<AccountDto[]>([]);
  const [pnl, setPnl] = useState<Pnl | null>(null);
  const [nw, setNw] = useState<NetWorth | null>(null);
  const [income, setIncome] = useState<IncomeEntryDto[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntryDto[]>([]);
  const [debts, setDebts] = useState<DebtDto[]>([]);
  const [cats, setCats] = useState<CatRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [accs, pnlRes, nwRes, inc, exp, d, br] = await Promise.all([
          apiFetch<AccountDto[]>("/api/accounts"),
          apiFetch<Pnl>(
            `/api/reports/pnl?from=${encodeURIComponent(monthStart)}&to=${encodeURIComponent(monthEnd)}&display_currency=${encodeURIComponent(displayCurrency)}`,
          ),
          apiFetch<NetWorth>(
            `/api/reports/net-worth?as_of=${encodeURIComponent(asOf)}&display_currency=${encodeURIComponent(displayCurrency)}`,
          ),
          apiFetch<IncomeEntryDto[]>(
            `/api/income?from=${encodeURIComponent(from30)}&to=${encodeURIComponent(monthEnd)}`,
          ),
          apiFetch<ExpenseEntryDto[]>(
            `/api/expenses?from=${encodeURIComponent(from30)}&to=${encodeURIComponent(monthEnd)}`,
          ),
          apiFetch<DebtDto[]>("/api/debts?status=open"),
          apiFetch<{ rows: CatRow[] }>(
            `/api/reports/category-breakdown?from=${encodeURIComponent(from30)}&to=${encodeURIComponent(monthEnd)}&display_currency=${encodeURIComponent(displayCurrency)}`,
          ),
        ]);
        if (cancelled) return;
        setAccounts(accs);
        setPnl(pnlRes);
        setNw(nwRes);
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
  }, [asOf, displayCurrency, from30, monthEnd, monthStart]);

  const trend = useMemo(() => {
    const days = eachDayOfInterval({
      start: subDays(today, 29),
      end: today,
    }).map((d) => ({
      day: format(d, "MMM d"),
      income: 0,
      expense: 0,
    }));
    const idx = new Map(days.map((d, i) => [d.day, i]));
    for (const row of income) {
      const key = format(new Date(row.date), "MMM d");
      const i = idx.get(key);
      if (i != null) {
        days[i]!.income += convertWithUsdMvrRate(
          row.amount,
          row.account_currency || row.currency || "USD",
          displayCurrency,
          globalUsdMvrRate,
        );
      }
    }
    for (const row of expenses) {
      const key = format(new Date(row.bill_date ?? row.date), "MMM d");
      const i = idx.get(key);
      if (i != null) {
        const ccy = row.pay_later
          ? (row.bill_currency ?? row.account_currency ?? "USD")
          : (row.account_currency || "USD");
        days[i]!.expense += convertWithUsdMvrRate(
          row.amount,
          ccy,
          displayCurrency,
          globalUsdMvrRate,
        );
      }
    }
    return days;
  }, [displayCurrency, expenses, globalUsdMvrRate, income, today]);

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
    return rows.slice(0, 10);
  }, [expenses, income]);

  const overdue = debts.filter(
    (d) => d.due_date && new Date(d.due_date) < today && d.outstanding > 0,
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Dashboard</h2>
      </div>

      {error ? (
        <Card>
          <p className="text-sm text-red-600">{error}</p>
        </Card>
      ) : null}

      {overdue.length > 0 && !loading ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>{overdue.length}</strong> overdue debt
          {overdue.length > 1 ? "s" : ""} — review on the Debts page.
        </div>
      ) : null}

      {loading && !error ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
          <div className="col-span-full space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
            <SkeletonLine className="h-5 w-48" />
            <SkeletonLine className="h-48 w-full" />
          </div>
        </div>
      ) : null}

      {!loading && !error ? (
        <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={`Net worth (${displayCurrency})`}
          value={nw ? formatMoneyAmountOnly(nw.net_worth) : "—"}
        />
        <StatCard
          title={`Month income (${displayCurrency})`}
          value={pnl ? formatMoneyAmountOnly(pnl.total_income) : "—"}
          hint={`${monthStart} → ${monthEnd} · earned date`}
        />
        <StatCard
          title={`Month expenses (${displayCurrency})`}
          value={pnl ? formatMoneyAmountOnly(pnl.total_expenses) : "—"}
          hint="Bill date (includes unpaid pay-later)"
        />
        <StatCard
          title={`Month net (${displayCurrency})`}
          value={pnl ? formatMoneyAmountOnly(pnl.net) : "—"}
          hint="Earned − billed"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard
          title={`Pay later (unpaid bills) (${displayCurrency})`}
          value={
            nw?.pay_later_unpaid != null
              ? formatMoneyAmountOnly(nw.pay_later_unpaid)
              : "—"
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-900">Income vs expense (30 days, earned / bill date)</h3>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} interval={4} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => formatMoney(v, displayCurrency)} />
                <Legend />
                <Bar dataKey="income" fill="#16a34a" name="Income" />
                <Bar dataKey="expense" fill="#f97316" name="Expense" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-slate-900">Top expense categories</h3>
          <div className="mt-2 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={
                    cats.length
                      ? (cats as Array<{ name: string; total: number }>)
                      : [{ name: "No data", total: 1 }]
                  }
                  dataKey="total"
                  nameKey="name"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={2}
                >
                  {(cats.length ? cats : [{ name: "No data", total: 1 }]).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatMoney(v, displayCurrency)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="text-sm font-semibold text-slate-900">Accounts snapshot</h3>
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {accounts.map((a) => (
              <li key={a.id} className="flex justify-between gap-2 py-2">
                <span className="text-slate-700">{a.name}</span>
                <DisplayAmountCell
                  amount={a.balance}
                  nativeCurrency={a.currency}
                  className="font-medium text-slate-900"
                />
              </li>
            ))}
            {!accounts.length ? (
              <li className="py-2 text-slate-500">No accounts yet — add one on Accounts.</li>
            ) : null}
          </ul>
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-slate-900">Recent transactions</h3>
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {recent.map((r) => (
              <li key={`${r.kind}-${r.id}`} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-800">{r.label}</p>
                  <p className="text-xs text-slate-500">{r.date}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {r.attachment_url ? <ReceiptPreviewIcon url={r.attachment_url} /> : null}
                  <DisplayAmountCell
                    amount={r.nativeAmount}
                    nativeCurrency={r.nativeCurrency}
                    prefix={r.kind === "income" ? "+" : "−"}
                    className={
                      r.kind === "income" ? "font-semibold text-emerald-700" : "font-semibold text-orange-700"
                    }
                  />
                </div>
              </li>
            ))}
            {!recent.length ? (
              <li className="py-2 text-slate-500">No activity in the last 30 days.</li>
            ) : null}
          </ul>
        </Card>
      </div>
        </>
      ) : null}
    </div>
  );
}
