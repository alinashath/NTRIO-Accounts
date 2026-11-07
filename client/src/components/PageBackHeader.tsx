import { ChevronLeft } from "lucide-react";
import { Link } from "react-router-dom";

/** Full-page editor header: back chevron, title, short instruction. */
export function PageBackHeader({
  backTo,
  backLabel = "Back",
  title,
  caption,
  action,
}: {
  backTo: string;
  backLabel?: string;
  title: string;
  caption?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <Link
        to={backTo}
        className="inline-flex min-h-11 min-w-11 shrink-0 touch-manipulation items-center justify-center rounded-[var(--radius-md)] text-ink hover:bg-neutral-bg"
        aria-label={backLabel}
      >
        <ChevronLeft className="h-5 w-5" strokeWidth={1.8} aria-hidden />
      </Link>
      <div className="min-w-0 flex-1 pt-2">
        <h1 className="text-page-title text-ink">{title}</h1>
        {caption ? <p className="mt-1 text-caption">{caption}</p> : null}
      </div>
      {action ? <div className="shrink-0 pt-0.5">{action}</div> : null}
    </div>
  );
}
