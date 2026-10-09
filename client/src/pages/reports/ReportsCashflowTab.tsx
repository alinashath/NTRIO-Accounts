import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch } from "@/api/http";
import { DateBasisToggle, dateBasisSubtitle, type DateBasis } from "@/components/DateBasisToggle";
import { DisplayAmountCell } from "@/components/DisplayAmountCell";
import { PeriodFilterBar } from "@/components/PeriodFilterBar";
import { StatementHeader, StatementRow } from "@/components/StatementRow";
import { Card } from "@/components/ui";
import { useDisplayCurrency } from "@/context/DisplayCurrencyContext";
import { chartAxisProps, chartTheme } from "@/lib/chartTheme";
import { convertWithUsdMvrRate } from "@/lib/displayFx";
import { formatMoney } from "@/lib/money";
import {
  formatSharePct,
  formatVsPrior,
  previousInclusivePeriodYmd,
} from "@/lib/periodCompare";
import { type RangePreset, thisMonthRange } from "@/lib/reportPeriod";

type CashflowAccountRow = {
  account_id: string;
  name: string;
  currency: string;
  money_in: number;
  money_out: number;
  net_flow: number;
};

type CashFlowLine = { key: string; label: string; amount: number };

type CashflowRes = {
  from: string;
  to: string;
  display_currency: string;
  date_basis?: string;
  operating: {
    cash_from_income: number;
    cash_paid_expenses: number;
    adjustments: number;
    lines_income: CashFlowLine[];
    lines_expense: CashFlowLine[];
    net: number;
  };
  financing: {
    debt_collections: number;
    debt_repayments: number;
    net: number;
  };
  transfers_memo: number;
  net_change_in_cash: number;
  cash_beginning: number;
  cash_ending: number;
  reconciling_diff: number;
  accounts: CashflowAccountRow[];
};

export function ReportsCashflowTab() {
  const { displayCurrency, getUsdMvrRateForDate } = useDisplayCurrency();
  const initial = thisMonthRange();

  const [rangePreset, setRangePreset] = useState<RangePreset>("this_month");
  const [applied, setApplied] = useState(initial);
  const [dateBasis, setDateBasis] = useState<DateBasis>("accrual");
  const [stmt, setStmt] = useState<CashflowRes | null>(null);
  const [prevStmt, setPrevStmt] = useState<CashflowRes | null>(null);
  const [prevPeriod, setPrevPeriod] = useState<{ from: string; to: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    const { from: f, to: t } = applied;
    const prev = previousInclusivePeriodYmd(f, t);
    const dc = encodeURIComponent(displayCurrency);
    const db = encodeURIComponent(dateBasis);
    try {
      const [data, prior] = await Promise.all([
        apiFetch<CashflowRes>(
          `/api/reports/cashflow?from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}&display_currency=${dc}&date_basis=${db}`,
        ),
        apiFetch<CashflowRes>(
          `/api/reports/cashflow?from=${encodeURIComponent(prev.from)}&to=${encodeURIComponent(prev.to)}&display_currency=${dc}&date_basis=${db}`,
        ),
      ]);
      setStmt(data);
      setPrevStmt(prior);
      setPrevPeriod(prev);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [applied, dateBasis, displayCurrency]);

  useEffect(() => {
    void load();
  }, [load]);

  const ccy = stmt?.display_currency ?? displayCurrency;
  const rows = stmt?.accounts ?? [];

  const compares = useMemo(() => {
    if (!stmt || !prevStmt) return null;
    const cashIn = stmt.operating.cash_from_income;
    return {
      operating: formatVsPrior(stmt.operating.net, prevStmt.operating.net, { higherIsBetter: true }),
      financing: formatVsPrior(stmt.financing.net, prevStmt.financing.net, { higherIsBetter: true }),
      netChange: formatVsPrior(stmt.net_change_in_cash, prevStmt.net_change_in_cash, {
        higherIsBetter: true,
      }),
      cashIn: formatVsPrior(stmt.operating.cash_from_income, prevStmt.operating.cash_from_income, {
        higherIsBetter: true,
      }),
      cashOut: formatVsPrior(
        stmt.operating.cash_paid_expenses,
        prevStmt.operating.cash_paid_expenses,
        { higherIsBetter: false },
      ),
      adjustments: formatVsPrior(stmt.operating.adjustments, prevStmt.operating.adjustments, {
        higherIsBetter: true,
      }),
      collections: formatVsPrior(
        stmt.financing.debt_collections,
        prevStmt.financing.debt_collections,
        { higherIsBetter: true },
      ),
      repayments: formatVsPrior(
        stmt.financing.debt_repayments,
        prevStmt.financing.debt_repayments,
        { higherIsBetter: false },
      ),
      beginning: formatVsPrior(stmt.cash_beginning, prevStmt.cash_beginning, { higherIsBetter: true }),
      ending: formatVsPrior(stmt.cash_ending, prevStmt.cash_ending, { higherIsBetter: true }),
      expenseShare: formatSharePct(
        stmt.operating.cash_paid_expenses,
        cashIn,
        "of cash from income",
      ),
      operatingShare: formatSharePct(
        Math.abs(stmt.operating.net),
        Math.abs(stmt.operating.net) + Math.abs(stmt.financing.net) || 1,
        "of |operating|+|financing|",
      ),
    };
  }, [prevStmt, stmt]);

  const chartRows = useMemo(() => {
    return rows
      .map((r) => ({
        name: r.name,
        net: convertWithUsdMvrRate(
          r.net_flow,
          r.currency || "USD",
          displayCurrency,
          getUsdMvrRateForDate(applied.to),
        ),
      }))
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  }, [applied.to, displayCurrency, getUsdMvrRateForDate, rows]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Cash flow</h3>
        <PeriodFilterBar
          from={applied.from}
          to={applied.to}
          preset={rangePreset}
          onApply={({ from, to, preset }) => {
            setRangePreset(preset);
            setApplied({ from, to });
          }}
          actions={<DateBasisToggle value={dateBasis} onChange={setDateBasis} />}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        {dateBasisSubtitle(dateBasis)}
        {prevPeriod ? ` · vs prior ${prevPeriod.from} → ${prevPeriod.to}` : ""}
      </p>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {loading && !stmt ? (
        <Card>
          <p className="text-xs text-muted-foreground">Loading…</p>
        </Card>
      ) : null}

      {stmt ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Operating cash flow
              </p>
              <p
                className={`mt-2 text-xl font-extrabold tabular-nums ${
                  stmt.operating.net >= 0 ? "text-positive" : "text-negative"
                }`}
              >
                {formatMoney(stmt.operating.net, ccy)}
              </p>
              {compares ? (
                <p
                  className={`mt-1 text-xs font-medium ${
                    compares.operating.tone === "positive"
                      ? "text-positive/80"
                      : compares.operating.tone === "negative"
                        ? "text-negative/80"
                        : "text-muted-foreground"
                  }`}
                >
                  {compares.operating.text}
                  {compares.operatingShare ? ` · ${compares.operatingShare}` : ""}
                </p>
              ) : null}
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Financing cash flow
              </p>
              <p
                className={`mt-2 text-xl font-extrabold tabular-nums ${
                  stmt.financing.net >= 0 ? "text-positive" : "text-negative"
                }`}
              >
                {formatMoney(stmt.financing.net, ccy)}
              </p>
              {compares ? (
                <p
                  className={`mt-1 text-xs font-medium ${
                    compares.financing.tone === "positive"
                      ? "text-positive/80"
                      : compares.financing.tone === "negative"
                        ? "text-negative/80"
                        : "text-muted-foreground"
                  }`}
                >
                  {compares.financing.text}
                </p>
              ) : null}
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Net change in cash
              </p>
              <p
                className={`mt-2 text-xl font-extrabold tabular-nums ${
                  stmt.net_change_in_cash >= 0 ? "text-positive" : "text-negative"
                }`}
              >
                {formatMoney(stmt.net_change_in_cash, ccy)}
              </p>
              {compares ? (
                <p
                  className={`mt-1 text-xs font-medium ${
                    compares.netChange.tone === "positive"
                      ? "text-positive/80"
                      : compares.netChange.tone === "negative"
                        ? "text-negative/80"
                        : "text-muted-foreground"
                  }`}
                >
                  {compares.netChange.text}
                </p>
              ) : null}
            </Card>
          </div>

          <Card className="mx-auto max-w-2xl">
            <StatementHeader
              title="Statement of Cash Flows"
              subtitle={`${format(parseISO(stmt.from), "MMM d, yyyy")} – ${format(parseISO(stmt.to), "MMM d, yyyy")} · ${dateBasisSubtitle(dateBasis)} · ${ccy}`}
            />

            <div className="mt-2">
              <StatementRow label="Cash flows from operating activities" currency={ccy} depth={0} />
              <StatementRow
                label={
                  dateBasis === "accrual" ? "Income (earned / accrued)" : "Cash received from income"
                }
                amount={stmt.operating.cash_from_income}
                currency={ccy}
                depth={1}
                compare={compares?.cashIn.text}
                compareTone={compares?.cashIn.tone}
              />
              {stmt.operating.lines_income.slice(0, 8).map((l) => {
                const share = formatSharePct(l.amount, stmt.operating.cash_from_income, "of income");
                return (
                  <StatementRow
                    key={`inc-${l.key}`}
                    label={share ? `${l.label} · ${share}` : l.label}
                    amount={l.amount}
                    currency={ccy}
                    depth={1}
                    muted
                    className="pl-3 text-xs"
                  />
                );
              })}
              <StatementRow
                label={
                  dateBasis === "accrual" ? "Expenses (bill / incurred)" : "Cash paid for expenses"
                }
                amount={-stmt.operating.cash_paid_expenses}
                currency={ccy}
                depth={1}
                negativeAsParen
                compare={
                  compares
                    ? [compares.cashOut.text, compares.expenseShare].filter(Boolean).join(" · ")
                    : null
                }
                compareTone={compares?.cashOut.tone}
              />
              {stmt.operating.lines_expense.slice(0, 8).map((l) => {
                const share = formatSharePct(
                  l.amount,
                  stmt.operating.cash_paid_expenses,
                  "of expenses",
                );
                return (
                  <StatementRow
                    key={`exp-${l.key}`}
                    label={share ? `${l.label} · ${share}` : l.label}
                    amount={-l.amount}
                    currency={ccy}
                    depth={1}
                    muted
                    negativeAsParen
                    className="pl-3 text-xs"
                  />
                );
              })}
              {Math.abs(stmt.operating.adjustments) >= 0.01 ? (
                <StatementRow
                  label="Account adjustments"
                  amount={stmt.operating.adjustments}
                  currency={ccy}
                  depth={1}
                  negativeAsParen
                  compare={compares?.adjustments.text}
                  compareTone={compares?.adjustments.tone}
                />
              ) : null}
              <StatementRow
                label="Net cash from operating activities"
                amount={stmt.operating.net}
                currency={ccy}
                bold
                borderTop
                negativeAsParen
                compare={compares?.operating.text}
                compareTone={compares?.operating.tone}
              />

              <StatementRow label="Cash flows from financing activities" currency={ccy} depth={0} />
              <StatementRow
                label="Collections on amounts owed to me"
                amount={stmt.financing.debt_collections}
                currency={ccy}
                depth={1}
                compare={compares?.collections.text}
                compareTone={compares?.collections.tone}
              />
              <StatementRow
                label="Repayments of amounts I owe"
                amount={-stmt.financing.debt_repayments}
                currency={ccy}
                depth={1}
                negativeAsParen
                compare={compares?.repayments.text}
                compareTone={compares?.repayments.tone}
              />
              <StatementRow
                label="Net cash from financing activities"
                amount={stmt.financing.net}
                currency={ccy}
                bold
                borderTop
                negativeAsParen
                compare={compares?.financing.text}
                compareTone={compares?.financing.tone}
              />

              <StatementRow
                label="Net increase (decrease) in cash"
                amount={stmt.net_change_in_cash}
                currency={ccy}
                depth={2}
                borderDouble
                negativeAsParen
                compare={compares?.netChange.text}
                compareTone={compares?.netChange.tone}
              />
              <StatementRow
                label="Cash and cash equivalents at beginning of period"
                amount={stmt.cash_beginning}
                currency={ccy}
                depth={1}
                compare={compares?.beginning.text}
                compareTone={compares?.beginning.tone}
              />
              {Math.abs(stmt.reconciling_diff) >= 0.01 ? (
                <StatementRow
                  label="Effect of exchange rates / other"
                  amount={stmt.reconciling_diff}
                  currency={ccy}
                  depth={1}
                  muted
                  negativeAsParen
                />
              ) : null}
              <StatementRow
                label="Cash and cash equivalents at end of period"
                amount={stmt.cash_ending}
                currency={ccy}
                depth={2}
                borderDouble
                compare={compares?.ending.text}
                compareTone={compares?.ending.tone}
              />
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              Inter-account transfers are excluded from consolidated cash flow (they net within cash).
              Ending cash matches the sum of account balances as of the period end.
            </p>
          </Card>

          {chartRows.length > 0 ? (
            <Card>
              <h3 className="text-sm font-bold text-foreground">Net flow by account</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Per-account detail (includes transfers) · green = in, red = out
              </p>
              <div className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={chartRows}
                    margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} horizontal={false} />
                    <XAxis type="number" {...chartAxisProps} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={88}
                      tick={{ ...chartAxisProps.tick, fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(v: number) => [formatMoney(v, displayCurrency), "Net"]}
                      contentStyle={{
                        borderRadius: 10,
                        borderColor: chartTheme.tooltipBorder,
                        background: chartTheme.tooltipBg,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="net" name="net" radius={[0, 6, 6, 0]} maxBarSize={20}>
                      {chartRows.map((r, i) => (
                        <Cell key={i} fill={r.net >= 0 ? chartTheme.income : chartTheme.expense} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          ) : null}

          <Card>
            <h3 className="text-sm font-bold text-foreground">By account</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase text-muted-foreground">
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
                      <td className="py-4 text-muted-foreground" colSpan={5}>
                        No accounts yet.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr key={r.account_id} className="border-b border-border/60">
                        <td className="py-2 pr-3 text-foreground">{r.name}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{r.currency}</td>
                        <td className="py-2 pr-2 text-right">
                          <DisplayAmountCell
                            amount={r.money_in}
                            nativeCurrency={r.currency || "USD"}
                            asOfDate={applied.to}
                            className="font-medium text-positive"
                          />
                        </td>
                        <td className="py-2 pr-2 text-right">
                          <DisplayAmountCell
                            amount={r.money_out}
                            nativeCurrency={r.currency || "USD"}
                            asOfDate={applied.to}
                            className="font-medium text-negative"
                          />
                        </td>
                        <td className="py-2 text-right">
                          <DisplayAmountCell
                            amount={r.net_flow}
                            nativeCurrency={r.currency || "USD"}
                            asOfDate={applied.to}
                            className={
                              r.net_flow >= 0 ? "font-medium text-positive" : "font-medium text-negative"
                            }
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
