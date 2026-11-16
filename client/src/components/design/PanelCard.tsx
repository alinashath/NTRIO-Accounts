import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export function PanelCard({
  title,
  caption,
  href,
  linkLabel = "View all",
  headerRight,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  caption?: React.ReactNode;
  href?: string;
  linkLabel?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3 px-4 pb-2 pt-4">
        <div className="min-w-0">
          <h2 className="text-section text-ink">{title}</h2>
          {caption ? <p className="mt-0.5 text-caption">{caption}</p> : null}
        </div>
        {headerRight
          ? headerRight
          : href ? (
              <Link
                to={href}
                className="inline-flex min-h-11 shrink-0 items-center text-sm font-semibold text-action"
              >
                {linkLabel}
              </Link>
            ) : null}
      </header>
      <div className={cn(bodyClassName)}>{children}</div>
    </section>
  );
}

export function ListRow({
  primary,
  secondary,
  right,
  rightSecondary,
  onClick,
  href,
  className,
}: {
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  right?: React.ReactNode;
  rightSecondary?: React.ReactNode;
  onClick?: () => void;
  href?: string;
  className?: string;
}) {
  const content = (
    <>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-ink">{primary}</div>
        {secondary ? <div className="mt-0.5 text-caption">{secondary}</div> : null}
      </div>
      <div className="shrink-0 text-right">
        {right}
        {rightSecondary ? <div className="mt-0.5 text-caption">{rightSecondary}</div> : null}
      </div>
    </>
  );

  const rowClass = cn(
    "flex w-full items-center gap-3 border-t border-border px-4 py-3 text-left",
    (onClick || href) && "min-h-11 cursor-pointer touch-manipulation hover:bg-neutral-bg/60",
    className,
  );

  if (href) {
    return (
      <a href={href} className={rowClass} onClick={onClick}>
        {content}
      </a>
    );
  }

  if (onClick) {
    return (
      <button type="button" className={rowClass} onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className={rowClass}>{content}</div>;
}

export function StatRow({
  label,
  value,
  priorCaption,
  change,
  caption,
  hint,
  emphasize,
}: {
  label: string;
  value: React.ReactNode;
  priorCaption?: string;
  change?: React.ReactNode;
  caption?: React.ReactNode;
  hint?: React.ReactNode;
  /** Stronger bottom border for subtotal / total rows */
  emphasize?: boolean;
}) {
  return (
    <div
      className={cn(
        "border-t border-border px-4 py-3 first:border-t-0",
        emphasize && "border-t-2 border-ink/20 bg-neutral-bg/40",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">{value}</div>
        {change ? <div className="shrink-0 pt-0.5">{change}</div> : null}
      </div>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className="text-label">{label}</p>
        {priorCaption ? <p className="text-caption">{priorCaption}</p> : null}
      </div>
      {hint ? <div className="mt-0.5">{hint}</div> : null}
      {caption ? <p className="mt-1 text-caption">{caption}</p> : null}
    </div>
  );
}

/** 3-column metric strip: value on top, label under each cell. */
export function StatGrid({
  children,
  className,
  emphasize,
}: {
  children: React.ReactNode;
  className?: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-3 gap-px border-t border-border bg-border",
        emphasize && "border-t-2 border-ink/20",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function StatCell({
  label,
  value,
  change,
  priorCaption,
  caption,
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  change?: React.ReactNode;
  priorCaption?: string;
  caption?: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("stat-cell min-w-0 bg-surface px-2.5 py-3 sm:px-4", className)}>
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 max-w-full overflow-hidden">{value}</div>
        {change ? <div className="shrink-0 scale-90 origin-top-right sm:scale-100">{change}</div> : null}
      </div>
      <p className="mt-1.5 text-label leading-tight">{label}</p>
      {priorCaption ? <p className="mt-0.5 text-caption leading-tight">{priorCaption}</p> : null}
      {hint ? <div className="mt-0.5">{hint}</div> : null}
      {caption ? <p className="mt-0.5 text-caption leading-tight">{caption}</p> : null}
    </div>
  );
}
