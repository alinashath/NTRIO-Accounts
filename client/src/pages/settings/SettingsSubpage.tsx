import { ChevronLeft } from "lucide-react";
import { Link } from "react-router-dom";

export function SettingsSubpage({
  title,
  caption,
  action,
  children,
}: {
  title: string;
  caption?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <Link
          to="/accounts/settings"
          className="inline-flex min-h-11 min-w-11 shrink-0 touch-manipulation items-center justify-center rounded-sm text-ink hover:bg-neutral-bg"
          aria-label="Back to Settings"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={1.8} aria-hidden />
        </Link>
        <div className="min-w-0 flex-1 pt-2">
          <h2 className="text-page-title text-ink">{title}</h2>
          {caption ? <p className="mt-0.5 text-caption">{caption}</p> : null}
        </div>
        {action ? <div className="shrink-0 pt-0.5">{action}</div> : null}
      </div>
      {children}
    </div>
  );
}
