import { cn } from "@/lib/utils";
import { pctChange } from "@/lib/periodCompare";

type Variant = "positive" | "negative" | "neutral";

export function ChangeTag({
  variant,
  children,
  className,
}: {
  variant: Variant;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-xs px-1.5 py-0.5 text-xs font-semibold leading-4 tabular-nums",
        variant === "positive" && "bg-credit-bg text-credit-ink",
        variant === "negative" && "bg-debit-bg text-debit-ink",
        variant === "neutral" && "bg-neutral-bg text-neutral-ink",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Percent change tag; `higherIsBetter` flips positive/negative meaning. */
export function PctChangeTag({
  current,
  prior,
  higherIsBetter,
  className,
}: {
  current: number;
  prior: number;
  higherIsBetter: boolean;
  className?: string;
}) {
  const pct = pctChange(current, prior);
  if (pct == null) {
    return (
      <ChangeTag variant="neutral" className={className}>
        New
      </ChangeTag>
    );
  }
  if (pct === 0) {
    return (
      <ChangeTag variant="neutral" className={className}>
        0%
      </ChangeTag>
    );
  }
  const up = pct > 0;
  const good = up === higherIsBetter;
  return (
    <ChangeTag variant={good ? "positive" : "negative"} className={className}>
      {up ? "+" : "\u2212"}
      {Math.abs(pct).toFixed(0)}%
    </ChangeTag>
  );
}
