import { cn } from "@/lib/utils";

type Fill = "ink" | "action" | "credit" | "debit";

const fillClass: Record<Fill, string> = {
  ink: "bg-ink",
  action: "bg-action",
  credit: "bg-credit",
  debit: "bg-debit",
};

export function ProgressBar({
  value,
  max = 100,
  fill = "ink",
  className,
  label,
}: {
  value: number;
  max?: number;
  fill?: Fill;
  className?: string;
  label?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-[3px] bg-border", className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cn("h-full rounded-[3px]", fillClass[fill])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
