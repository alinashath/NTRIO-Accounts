/** DESIGN.md: skeleton rows in --border colour, no spinners over content. */

export function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-sm bg-border ${className}`} aria-hidden />;
}

export function SkeletonCard() {
  return (
    <div className="rounded-[var(--radius)] border border-border bg-surface p-4">
      <SkeletonLine className="h-3 w-20" />
      <SkeletonLine className="mt-2 h-5 w-32" />
    </div>
  );
}

export function SkeletonTableRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonLine key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

/** Full-page list loading (inventory, products, recipes). */
export function SkeletonListPage({ rows = 8 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <SkeletonLine className="h-7 w-40" />
        <SkeletonLine className="h-4 w-full max-w-md" />
      </div>
      <div className="flex flex-wrap gap-2">
        <SkeletonLine className="h-11 w-28" />
        <SkeletonLine className="h-11 w-24" />
        <SkeletonLine className="h-11 w-28" />
      </div>
      <div className="overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface">
        <div className="px-4 pb-2 pt-4">
          <SkeletonLine className="h-5 w-36" />
        </div>
        <SkeletonTableRows rows={rows} />
      </div>
    </div>
  );
}

/** Editor form loading (item, product, recipe, line). */
export function SkeletonFormPage({ fields = 5 }: { fields?: number }) {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      <div className="flex items-start gap-2">
        <SkeletonLine className="h-11 w-11 shrink-0" />
        <div className="min-w-0 flex-1 space-y-2 pt-2">
          <SkeletonLine className="h-7 w-48" />
          <SkeletonLine className="h-4 w-full max-w-sm" />
        </div>
      </div>
      <div className="space-y-3">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <SkeletonLine className="h-3 w-20" />
            <SkeletonLine className="h-11 w-full" />
          </div>
        ))}
        <SkeletonLine className="mt-2 h-11 w-36" />
      </div>
    </div>
  );
}

/** Inline saving status — put above forms while a save is in flight. */
export function SavingBanner({ show, label = "Saving…" }: { show: boolean; label?: string }) {
  if (!show) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-[var(--radius)] border border-border bg-surface-elevated px-3 py-2 text-sm font-medium text-ink"
    >
      {label}
    </div>
  );
}
