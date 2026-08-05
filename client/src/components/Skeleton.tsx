/** Simple pulse placeholders while data loads. */

export function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} aria-hidden />;
}

export function SkeletonCard() {
  return (
    <div className="rounded-[var(--radius-md)] border border-border/80 bg-card p-3">
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
