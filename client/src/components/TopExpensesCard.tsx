import { useMemo } from "react";
import { Amount, ChangeTag, PanelCard, PctChangeTag, ProgressBar } from "@/components/design";
import { formatUnsignedAmount } from "@/lib/amountFormat";
import { pctChange } from "@/lib/periodCompare";

export type TopExpenseRow = {
  name: string;
  current: number;
  previous: number;
  color?: string;
};

export function TopExpensesCard({
  rows,
  currency,
  periodLabel,
  priorLabel,
  className,
}: {
  rows: TopExpenseRow[];
  currency: string;
  periodLabel: string;
  priorLabel: string;
  className?: string;
}) {
  const currentTotal = useMemo(() => rows.reduce((s, r) => s + r.current, 0), [rows]);
  const previousTotal = useMemo(() => rows.reduce((s, r) => s + r.previous, 0), [rows]);
  const maxBar = useMemo(
    () => Math.max(...rows.map((r) => r.current), 1),
    [rows],
  );

  const sorted = useMemo(
    () => [...rows].sort((a, b) => b.current - a.current),
    [rows],
  );

  const totalPct = pctChange(currentTotal, previousTotal);

  return (
    <PanelCard
      title="Top expenses"
      caption={`${periodLabel} vs ${priorLabel}`}
      className={className}
    >
      {rows.length ? (
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border px-4 pb-3">
          <div>
            <p className="text-caption">Top {rows.length} total</p>
            <p className="mt-0.5 text-amount-lg text-ink">
              {formatUnsignedAmount(currentTotal, currency)}
            </p>
          </div>
          <div className="text-right">
            {totalPct == null ? (
              <ChangeTag variant="neutral">New</ChangeTag>
            ) : (
              <PctChangeTag
                current={currentTotal}
                prior={previousTotal}
                higherIsBetter={false}
              />
            )}
            <p className="mt-1 text-caption">
              Prev {formatUnsignedAmount(previousTotal, currency)}
            </p>
          </div>
        </div>
      ) : null}

      {sorted.length ? (
        <ul>
          {sorted.map((r) => {
            const share = currentTotal > 0 ? (r.current / currentTotal) * 100 : 0;
            return (
              <li key={r.name} className="border-t border-border px-4 py-3 first:border-t-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-medium text-ink">{r.name}</span>
                  <Amount value={r.current} currency={currency} tone="debit" />
                </div>
                <ProgressBar
                  className="mt-2"
                  value={r.current}
                  max={maxBar}
                  fill="ink"
                  label={r.name}
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-caption">
                    Prev {formatUnsignedAmount(r.previous, currency)} · {share.toFixed(0)}% of top{" "}
                    {rows.length}
                  </p>
                  <PctChangeTag current={r.current} prior={r.previous} higherIsBetter={false} />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-4 pb-4 text-caption">No expense categories in this period.</p>
      )}

      {rows.length ? (
        <p className="border-t border-border px-4 py-3 text-caption">
          Red means you spent more than the prior period.
        </p>
      ) : null}
    </PanelCard>
  );
}

export function colorForCategory(_index: number): string {
  return "#111827";
}
