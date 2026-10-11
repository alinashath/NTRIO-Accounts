import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { chartTheme } from "@/lib/chartTheme";
import { formatMoneyAmountOnly } from "@/lib/money";
import { pctChange } from "@/lib/periodCompare";
import { cn } from "@/lib/utils";

export type TopExpenseRow = {
  name: string;
  current: number;
  previous: number;
  color: string;
};

type SortMode = "spend" | "change";

function ChangeChip({ current, previous }: { current: number; previous: number }) {
  const pct = pctChange(current, previous);
  if (pct == null) {
    return (
      <span className="inline-flex rounded-full bg-[#e4eef5] px-2 py-0.5 text-[12px] font-semibold text-[#2c5f86]">
        New
      </span>
    );
  }
  if (pct === 0) {
    return (
      <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[12px] font-semibold tabular-nums text-muted-foreground">
        → 0%
      </span>
    );
  }
  // For expenses: up = spent more = bad (neg soft), down = spent less = good (pos soft)
  const up = pct > 0;
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums",
        up ? "bg-negative/10 text-negative" : "bg-positive/10 text-positive",
      )}
    >
      {up ? "↑" : "↓"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

export function TopExpensesCard({
  rows,
  currency,
  periodLabel,
  priorLabel,
  className,
}: {
  rows: TopExpenseRow[];
  currency: string;
  /** e.g. Oct 1–11 */
  periodLabel: string;
  /** e.g. Sep 1–11 */
  priorLabel: string;
  className?: string;
}) {
  const [sort, setSort] = useState<SortMode>("spend");

  const currentTotal = useMemo(
    () => rows.reduce((s, r) => s + r.current, 0),
    [rows],
  );
  const previousTotal = useMemo(
    () => rows.reduce((s, r) => s + r.previous, 0),
    [rows],
  );
  const maxBar = useMemo(
    () => Math.max(...rows.map((r) => Math.max(r.current, r.previous)), 1),
    [rows],
  );

  const sorted = useMemo(() => {
    const list = [...rows];
    if (sort === "spend") {
      list.sort((a, b) => b.current - a.current);
    } else {
      list.sort((a, b) => {
        const pa = pctChange(a.current, a.previous);
        const pb = pctChange(b.current, b.previous);
        const va = pa ?? 1e9;
        const vb = pb ?? 1e9;
        return vb - va;
      });
    }
    return list;
  }, [rows, sort]);

  const totalPct = pctChange(currentTotal, previousTotal);

  return (
    <Card className={cn("gap-0 overflow-hidden", className)}>
      <CardHeader className="gap-3 pb-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base tracking-tight sm:text-[18px]">
              Top expenses
            </CardTitle>
            <CardDescription className="mt-1">
              By category · {periodLabel} vs {priorLabel}
            </CardDescription>
          </div>
          <div
            className="inline-flex shrink-0 rounded-full bg-muted p-0.5"
            role="group"
            aria-label="Sort by"
          >
            {(
              [
                { id: "spend" as const, label: "Spend" },
                { id: "change" as const, label: "Change" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                aria-pressed={sort === opt.id}
                onClick={() => setSort(opt.id)}
                className={cn(
                  "h-8 cursor-pointer touch-manipulation rounded-full px-2.5 text-[12.5px] font-semibold transition duration-150",
                  sort === opt.id
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {rows.length ? (
          <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-[14px] bg-muted/70 px-3.5 py-3">
            <div>
              <p className="text-[12.5px] text-muted-foreground">Top {rows.length} total</p>
              <p className="mt-0.5 text-xl font-bold tracking-tight tabular-nums text-foreground">
                <span className="mr-1 text-xs font-medium tracking-normal text-muted-foreground">
                  {currency}
                </span>
                {formatMoneyAmountOnly(currentTotal)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[12.5px] text-muted-foreground tabular-nums">
                Previous: {currency} {formatMoneyAmountOnly(previousTotal)}
              </p>
              {totalPct != null ? (
                <span
                  className={cn(
                    "mt-1 inline-flex rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums",
                    totalPct > 0
                      ? "bg-negative/10 text-negative"
                      : totalPct < 0
                        ? "bg-positive/10 text-positive"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {totalPct > 0 ? "↑" : totalPct < 0 ? "↓" : "→"}{" "}
                  {Math.abs(totalPct).toFixed(1)}%
                </span>
              ) : previousTotal < 1e-6 && currentTotal > 0 ? (
                <span className="mt-1 inline-flex rounded-full bg-[#e4eef5] px-2 py-0.5 text-[12px] font-semibold text-[#2c5f86]">
                  New
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        {rows.length ? (
          <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[12px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-4 rounded-[3px] bg-foreground" aria-hidden />
              This period
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-4 rounded-[3px] bg-[#cdd7db]" aria-hidden />
              Previous period
            </span>
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="px-4 pb-0 pt-1">
        {sorted.length ? (
          <ul>
            {sorted.map((r, i) => {
              const share = currentTotal > 0 ? (r.current / currentTotal) * 100 : 0;
              return (
                <li
                  key={r.name}
                  className={cn(
                    "py-3.5",
                    i > 0 && "border-t border-border/80",
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2.5">
                    <span className="flex min-w-0 items-center font-medium text-foreground">
                      <span
                        className="mr-2.5 h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: r.color }}
                        aria-hidden
                      />
                      <span className="truncate">{r.name}</span>
                    </span>
                    <span className="shrink-0 text-[17px] font-bold tracking-tight tabular-nums text-foreground">
                      <span className="mr-1 text-[11px] font-medium tracking-normal text-muted-foreground">
                        {currency}
                      </span>
                      {formatMoneyAmountOnly(r.current)}
                    </span>
                  </div>

                  <div className="mt-2.5 grid gap-1">
                    <div
                      className="h-[9px] overflow-hidden rounded-[5px] bg-muted"
                      role="img"
                      aria-label={`${r.name} this period`}
                    >
                      <div
                        className="h-full rounded-[5px] transition-[width] duration-200"
                        style={{
                          width: `${Math.max((r.current / maxBar) * 100, r.current > 0 ? 2 : 0)}%`,
                          background: r.color,
                        }}
                      />
                    </div>
                    <div
                      className="h-[5px] overflow-hidden rounded-[5px] bg-muted"
                      role="img"
                      aria-label={`${r.name} previous period`}
                    >
                      <div
                        className="h-full rounded-[5px] bg-[#cdd7db] transition-[width] duration-200"
                        style={{
                          width: `${Math.max((r.previous / maxBar) * 100, r.previous > 0 ? 2 : 0)}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-muted-foreground">
                    <span className="tabular-nums">
                      Previous {currency} {formatMoneyAmountOnly(r.previous)} ·{" "}
                      {share.toFixed(0)}% of top {rows.length}
                    </span>
                    <ChangeChip current={r.current} previous={r.previous} />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="py-4 text-sm text-muted-foreground">
            No expense categories in this period.
          </p>
        )}
      </CardContent>

      {rows.length ? (
        <p className="border-t border-border px-4 py-3 text-[12px] text-muted-foreground">
          Percent shows each category against the same days in the prior period. Red means
          you spent more, green means less.
        </p>
      ) : null}
    </Card>
  );
}

export function colorForCategory(index: number): string {
  return chartTheme.categories[index % chartTheme.categories.length]!;
}
