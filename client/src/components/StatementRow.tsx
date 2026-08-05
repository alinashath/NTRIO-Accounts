import clsx from "clsx";
import { formatMoney } from "@/lib/money";

export type StatementRowProps = {
  label: string;
  amount?: number | null;
  currency: string;
  /** indent level: 0 section, 1 line, 2 subtotal emphasis */
  depth?: 0 | 1 | 2;
  bold?: boolean;
  muted?: boolean;
  borderTop?: boolean;
  borderDouble?: boolean;
  negativeAsParen?: boolean;
  /** Secondary compare line, e.g. "↑ 12.5% vs prior" */
  compare?: string | null;
  compareTone?: "positive" | "negative" | "neutral";
  className?: string;
};

function fmt(amount: number, currency: string, negativeAsParen: boolean) {
  if (negativeAsParen && amount < 0) {
    return `(${formatMoney(Math.abs(amount), currency)})`;
  }
  return formatMoney(amount, currency);
}

/** Single line of a financial statement (label left, amount right). */
export function StatementRow({
  label,
  amount,
  currency,
  depth = 1,
  bold = false,
  muted = false,
  borderTop = false,
  borderDouble = false,
  negativeAsParen = false,
  compare,
  compareTone = "neutral",
  className,
}: StatementRowProps) {
  return (
    <div
      className={clsx(
        "flex items-baseline justify-between gap-4 py-1.5 text-sm",
        depth === 0 && "pt-3",
        borderTop && "mt-1 border-t border-border pt-2",
        borderDouble && "mt-1 border-t-2 border-double border-foreground pt-2",
        className,
      )}
    >
      <div className="min-w-0">
        <span
          className={clsx(
            "block",
            depth === 0 && "text-xs font-bold uppercase tracking-wide text-muted-foreground",
            depth === 1 && !bold && "pl-3 text-foreground",
            depth === 1 && bold && "pl-3 font-semibold text-foreground",
            depth === 2 && "font-bold text-foreground",
            muted && "text-muted-foreground",
          )}
        >
          {label}
        </span>
        {compare ? (
          <span
            className={clsx(
              "mt-0.5 block pl-3 text-[11px] font-medium",
              compareTone === "positive" && "text-positive/80",
              compareTone === "negative" && "text-negative/80",
              compareTone === "neutral" && "text-muted-foreground",
            )}
          >
            {compare}
          </span>
        ) : null}
      </div>
      {amount != null ? (
        <span
          className={clsx(
            "shrink-0 tabular-nums",
            bold || depth === 2 ? "font-bold" : "font-medium",
            amount < 0 && !negativeAsParen ? "text-negative" : "text-foreground",
          )}
        >
          {fmt(amount, currency, negativeAsParen)}
        </span>
      ) : (
        <span className="shrink-0 text-muted-foreground">—</span>
      )}
    </div>
  );
}

export function StatementHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="border-b border-border pb-3 text-center">
      <h3 className="text-base font-extrabold tracking-tight text-foreground">{title}</h3>
      {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}
