import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { apiFetch } from "@/api/http";
import { PeriodFilterBar } from "@/components/PeriodFilterBar";
import { StatementHeader, StatementRow } from "@/components/StatementRow";
import { Card } from "@/components/ui";
import { useDisplayCurrency } from "@/context/DisplayCurrencyContext";
import { formatMoney } from "@/lib/money";
import { type RangePreset, thisMonthRange } from "@/lib/reportPeriod";

type BalanceSheetRes = {
  as_of: string;
  display_currency: string;
  assets: {
    total_cash: number;
    total_receivables: number;
    total_assets: number;
  };
  liabilities: {
    total_payables: number;
    total_debts_payable: number;
    total_liabilities: number;
  };
  equity: { net_worth: number };
  total_liabilities_and_equity: number;
  equation_diff: number;
};

export function ReportsBalanceSheetTab() {
  const { displayCurrency } = useDisplayCurrency();
  const initialRange = thisMonthRange();

  const [rangePreset, setRangePreset] = useState<RangePreset>("this_month");
  const [applied, setApplied] = useState(initialRange);
  const [stmt, setStmt] = useState<BalanceSheetRes | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    const dc = encodeURIComponent(displayCurrency);
    try {
      const data = await apiFetch<BalanceSheetRes>(
        `/api/reports/balance-sheet?as_of=${encodeURIComponent(applied.to)}&display_currency=${dc}`,
      );
      setStmt(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [applied.to, displayCurrency]);

  useEffect(() => {
    void load();
  }, [load]);

  const ccy = stmt?.display_currency ?? displayCurrency;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Balance sheet</h3>
        <PeriodFilterBar
          from={applied.from}
          to={applied.to}
          preset={rangePreset}
          asOfHint
          onApply={({ from, to, preset }) => {
            setRangePreset(preset);
            setApplied({ from, to });
          }}
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {loading && !stmt ? (
        <Card>
          <p className="text-xs text-muted-foreground">Loading…</p>
        </Card>
      ) : null}

      {stmt ? (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            <Card className="p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Total assets
              </p>
              <p className="mt-1 text-base font-bold tabular-nums text-foreground sm:text-lg">
                {formatMoney(stmt.assets.total_assets, ccy)}
              </p>
            </Card>
            <Card className="p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Total liabilities
              </p>
              <p className="mt-1 text-base font-bold tabular-nums text-foreground sm:text-lg">
                {formatMoney(stmt.liabilities.total_liabilities, ccy)}
              </p>
            </Card>
            <Card className="p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Equity (net worth)
              </p>
              <p
                className={`mt-1 text-base font-bold tabular-nums sm:text-lg ${
                  stmt.equity.net_worth >= 0 ? "text-positive" : "text-negative"
                }`}
              >
                {formatMoney(stmt.equity.net_worth, ccy)}
              </p>
            </Card>
          </div>

          <Card className="mx-auto max-w-2xl">
            <StatementHeader
              title="Statement of Financial Position"
              subtitle={`As of ${format(parseISO(stmt.as_of), "MMMM d, yyyy")} · ${ccy}`}
            />

            <div className="mt-2">
              <StatementRow label="Assets" currency={ccy} depth={0} />
              <StatementRow label="Current assets" currency={ccy} depth={1} muted bold />
              <StatementRow label="Cash and cash equivalents" currency={ccy} depth={1} muted />
              <StatementRow
                label="Cash"
                amount={stmt.assets.total_cash}
                currency={ccy}
                depth={1}
              />
              <StatementRow
                label="Accounts receivable"
                amount={stmt.assets.total_receivables}
                currency={ccy}
                depth={1}
              />
              <StatementRow
                label="Total assets"
                amount={stmt.assets.total_assets}
                currency={ccy}
                depth={2}
                bold
                borderTop
              />

              <StatementRow label="Liabilities" currency={ccy} depth={0} />
              <StatementRow label="Current liabilities" currency={ccy} depth={1} muted bold />
              <StatementRow
                label="Accounts payable"
                amount={stmt.liabilities.total_payables}
                currency={ccy}
                depth={1}
              />
              <StatementRow
                label="Debts payable"
                amount={stmt.liabilities.total_debts_payable}
                currency={ccy}
                depth={1}
              />
              <StatementRow
                label="Total liabilities"
                amount={stmt.liabilities.total_liabilities}
                currency={ccy}
                depth={2}
                bold
                borderTop
              />

              <StatementRow label="Equity" currency={ccy} depth={0} />
              <StatementRow
                label="Net worth / equity"
                amount={stmt.equity.net_worth}
                currency={ccy}
                depth={1}
              />
              <StatementRow
                label="Total liabilities and equity"
                amount={stmt.total_liabilities_and_equity}
                currency={ccy}
                depth={2}
                bold
                borderDouble
              />
            </div>

            {Math.abs(stmt.equation_diff) >= 0.01 ? (
              <p className="mt-4 text-xs text-negative">
                Balance equation off by {formatMoney(stmt.equation_diff, ccy)} (assets − liabilities −
                equity).
              </p>
            ) : null}
          </Card>
        </>
      ) : null}
    </div>
  );
}
