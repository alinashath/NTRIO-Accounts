import { formatDate, formatMoney } from "@/lib/format";
import type { BusinessTransaction } from "@/lib/types";
import clsx from "clsx";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight } from "lucide-react";

export function TransactionRow({ tx }: { tx: BusinessTransaction }) {
  const Icon =
    tx.kind === "income"
      ? ArrowDownLeft
      : tx.kind === "expense"
        ? ArrowUpRight
        : ArrowLeftRight;

  const color =
    tx.kind === "income"
      ? "text-income bg-emerald-50"
      : tx.kind === "expense"
        ? "text-expense bg-red-50"
        : "text-brand-600 bg-brand-50";

  const sign = tx.kind === "expense" ? "-" : tx.kind === "income" ? "+" : "";

  return (
    <article className="flex items-center gap-3 py-3">
      <div
        className={clsx(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
          color,
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-slate-900">
          {tx.description || tx.category || tx.kind}
        </p>
        <p className="truncate text-xs text-muted">
          {tx.from_account_name} → {tx.to_account_name}
        </p>
      </div>
      <div className="text-right">
        <p
          className={clsx(
            "font-semibold tabular-nums",
            tx.kind === "income" && "text-income",
            tx.kind === "expense" && "text-expense",
          )}
        >
          {sign}
          {formatMoney(tx.amount, tx.currency)}
        </p>
        <p className="text-xs text-muted">{formatDate(tx.event_at)}</p>
      </div>
    </article>
  );
}
