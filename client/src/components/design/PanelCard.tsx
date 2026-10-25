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
        "overflow-hidden rounded-[var(--radius)] border border-border bg-surface",
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
}: {
  label: string;
  value: React.ReactNode;
  priorCaption?: string;
  change?: React.ReactNode;
  caption?: React.ReactNode;
}) {
  return (
    <div className="border-t border-border px-4 py-3 first:border-t-0">
      <div className="flex items-center justify-between gap-2">
        <p className="text-label">{label}</p>
        {change}
      </div>
      <div className="mt-1 flex items-end justify-between gap-3">
        <div className="min-w-0">{value}</div>
        {priorCaption ? <p className="shrink-0 text-caption">{priorCaption}</p> : null}
      </div>
      {caption ? <p className="mt-1 text-caption">{caption}</p> : null}
    </div>
  );
}
