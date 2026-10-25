import { Link } from "react-router-dom";
import { Amount, PanelCard, ProgressBar } from "@/components/design";
import { formatUnsignedAmount } from "@/lib/amountFormat";
import { toMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

export type CashMovementPoint = {
  day: string;
  income: number;
  expense: number;
  net: number;
};

export function CashMovementCard({
  currency,
  incomeTotal,
  expenseTotal,
  weekly,
  chartHref = "/cash-movement",
  className,
}: {
  data?: CashMovementPoint[];
  currency: string;
  weekly?: boolean;
  compact?: boolean;
  incomeTotal: number;
  expenseTotal: number;
  netTotal?: number;
  avgDailySpend?: number;
  chartHref?: string;
  className?: string;
}) {
  const max = Math.max(Math.abs(incomeTotal), Math.abs(expenseTotal), 1);
  const net = toMoney(incomeTotal - expenseTotal);
  const slopeHint =
    net > 0 ? "Income exceeded expenses this period." : net < 0 ? "Expenses exceeded income this period." : "Income matched expenses.";

  return (
    <PanelCard
      title="Cash movement"
      caption={weekly ? "Period totals" : "Period totals"}
      className={className}
    >
      <div className="space-y-4 px-4 pb-3">
        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <span className="text-sm font-medium text-ink">Income</span>
            <Amount value={incomeTotal} currency={currency} tone="credit" />
          </div>
          <ProgressBar value={incomeTotal} max={max} fill="credit" label="Income" />
        </div>
        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <span className="text-sm font-medium text-ink">Expenses</span>
            <Amount value={expenseTotal} currency={currency} tone="debit" />
          </div>
          <ProgressBar value={expenseTotal} max={max} fill="debit" label="Expenses" />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
        <p className={cn("min-w-0 text-caption")}>{slopeHint}</p>
        <Link
          to={chartHref}
          className="inline-flex min-h-11 shrink-0 items-center text-sm font-semibold text-action"
        >
          Daily chart
        </Link>
      </div>

      <p className="sr-only">
        Net {formatUnsignedAmount(net, currency)}
      </p>
    </PanelCard>
  );
}
