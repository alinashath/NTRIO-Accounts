/** Simple pulse placeholders while data loads. */

export function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200 ${className}`} aria-hidden />;
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <SkeletonLine className="h-4 w-24" />
      <SkeletonLine className="mt-3 h-8 w-40" />
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
