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
        "rounded-[var(--radius-md)] border border-border/80 bg-card p-3",
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
  /** Overrides delta color when comparison tone differs from card tone. */
  deltaTone?: "positive" | "negative" | "neutral";
}) {
  const toneValue =
    tone === "positive"
      ? "text-positive"
      : tone === "negative"
        ? "text-negative"
        : tone === "accent"
          ? "text-foreground"
          : "text-foreground";

  const resolvedDeltaTone = deltaTone ?? (tone === "positive" || tone === "negative" ? tone : "neutral");
  const deltaClass =
    resolvedDeltaTone === "positive"
      ? "text-positive/80"
      : resolvedDeltaTone === "negative"
        ? "text-negative/80"
        : "text-muted-foreground";

  return (
    <Card className="relative overflow-hidden p-3">
      {hint ? (
        <div className="group absolute right-1.5 top-1.5 z-10">
          <button
            type="button"
            title={hint}
            aria-label={hint}
            className="relative z-10 flex h-6 w-6 shrink-0 touch-manipulation cursor-help items-center justify-center rounded-[var(--radius-md)] text-[10px] font-semibold leading-none text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            ?
          </button>
          <div
            role="tooltip"
            className="pointer-events-none invisible absolute right-0 top-[calc(100%-4px)] z-20 w-[min(16rem,calc(100vw-2.5rem))] rounded-[var(--radius-md)] border border-border bg-card p-2 pt-2.5 text-left text-xs font-normal normal-case leading-snug tracking-normal text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:visible group-hover:opacity-100"
          >
            {hint}
          </div>
        </div>
      ) : null}
      <p className="pr-8 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <p className={clsx("mt-1 text-base font-semibold tabular-nums tracking-tight sm:text-lg", toneValue)}>
        {value}
      </p>
      {delta ? (
        <p className={clsx("mt-0.5 text-[11px] font-medium", deltaClass)}>{delta}</p>
      ) : null}
    </Card>
  );
}

export function Button({
  children,
  className,
  variant = "primary",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "accent";
}) {
  return (
    <button
      className={clsx(
        "inline-flex h-8 min-w-[1.75rem] cursor-pointer touch-manipulation items-center justify-center rounded-[var(--radius-md)] px-2.5 text-xs font-medium transition duration-150 active:scale-[0.99] disabled:cursor-not-allowed disabled:active:scale-100",
        variant === "primary" &&
          "bg-primary text-on-primary hover:bg-primary/90 disabled:opacity-50",
        variant === "accent" &&
          "bg-accent text-white hover:bg-accent/90 disabled:opacity-50",
        variant === "ghost" &&
          "bg-transparent text-foreground ring-1 ring-border hover:bg-muted disabled:opacity-50",
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
      <span className="mb-1 block text-xs font-medium text-foreground">{label}</span>
      <input
        className={clsx(
          "w-full h-8 touch-manipulation rounded-[var(--radius-md)] border border-border bg-card px-2.5 py-1.5 text-sm text-foreground transition duration-150 placeholder:text-muted-foreground focus-visible:border-primary",
          className,
        )}
        {...rest}
      />
      {hint ? <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}
