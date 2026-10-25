import clsx from "clsx";

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={clsx(
        "rounded-[var(--radius)] border border-border bg-surface p-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function StatCard({
  title,
  value,
  hint,
  tone = "neutral",
  delta,
  deltaTone,
}: {
  title: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "positive" | "negative" | "accent";
  delta?: string;
  deltaTone?: "positive" | "negative" | "neutral";
}) {
  const toneValue =
    tone === "positive"
      ? "text-credit"
      : tone === "negative"
        ? "text-debit"
        : "text-ink";

  const resolvedDeltaTone =
    deltaTone ?? (tone === "positive" || tone === "negative" ? tone : "neutral");
  const deltaClass =
    resolvedDeltaTone === "positive"
      ? "text-credit"
      : resolvedDeltaTone === "negative"
        ? "text-debit"
        : "text-muted-label";

  return (
    <Card className="relative overflow-hidden p-4">
      {hint ? (
        <div className="group absolute right-2 top-2 z-10">
          <button
            type="button"
            title={hint}
            aria-label={hint}
            className="relative z-10 flex min-h-11 min-w-11 touch-manipulation cursor-help items-center justify-center rounded-sm text-xs font-semibold text-muted-label hover:bg-neutral-bg hover:text-ink"
          >
            ?
          </button>
          <div
            role="tooltip"
            className="pointer-events-none invisible absolute right-0 top-[calc(100%-4px)] z-20 w-[min(16rem,calc(100vw-2.5rem))] rounded-[var(--radius)] border border-border bg-surface p-2 text-left text-xs font-normal normal-case leading-snug tracking-normal text-muted-label opacity-0 group-hover:pointer-events-auto group-hover:visible group-hover:opacity-100"
          >
            {hint}
          </div>
        </div>
      ) : null}
      <p className="text-label pr-10">{title}</p>
      <p className={clsx("mt-1 text-amount-lg", toneValue)}>{value}</p>
      {delta ? <p className={clsx("mt-1 text-caption", deltaClass)}>{delta}</p> : null}
    </Card>
  );
}

export function Button({
  children,
  className,
  variant = "primary",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "accent" | "secondary";
}) {
  const resolved = variant === "accent" ? "primary" : variant === "ghost" ? "secondary" : variant;
  return (
    <button
      className={clsx(
        "inline-flex min-h-11 cursor-pointer touch-manipulation items-center justify-center rounded-sm px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50",
        resolved === "primary" && "bg-action text-white hover:bg-action/90",
        resolved === "secondary" &&
          "border border-action bg-surface text-action hover:bg-neutral-bg",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function TextField({
  label,
  hint,
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
}) {
  return (
    <label className="block w-full">
      <span className="mb-1 block text-sm font-medium text-ink">{label}</span>
      <input
        className={clsx(
          "h-11 w-full touch-manipulation rounded-sm border border-border bg-surface px-3 text-sm text-ink placeholder:text-muted-label focus-visible:border-action",
          className,
        )}
        {...rest}
      />
      {hint ? <span className="mt-1 block text-caption">{hint}</span> : null}
    </label>
  );
}
