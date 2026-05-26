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
        "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5",
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
}: {
  title: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="relative">
      {hint ? (
        <div className="group absolute right-2 top-2 z-10 sm:right-3 sm:top-3">
          <button
            type="button"
            title={hint}
            aria-label={hint}
            className="relative z-10 flex min-h-11 min-w-11 shrink-0 touch-manipulation cursor-help items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-bold leading-none text-slate-500 shadow-sm transition active:scale-95 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 sm:min-h-9 sm:min-w-9 sm:text-[11px]"
          >
            ?
          </button>
          <div
            role="tooltip"
            className="pointer-events-none invisible absolute right-0 top-[calc(100%-6px)] z-20 w-[min(17rem,calc(100vw-2.5rem))] rounded-lg border border-slate-200 bg-white p-2.5 pt-3 text-left text-xs font-normal normal-case leading-snug tracking-normal text-slate-600 opacity-0 shadow-md transition-opacity duration-100 group-hover:pointer-events-auto group-hover:visible group-hover:opacity-100"
          >
            {hint}
          </div>
        </div>
      ) : null}
      <p className="pr-12 text-xs font-medium uppercase tracking-wide text-slate-500 sm:pr-10">
        {title}
      </p>
      <p className="mt-2 text-lg font-semibold tabular-nums tracking-tight text-slate-900 sm:text-xl">
        {value}
      </p>
    </Card>
  );
}

export function Button({
  children,
  className,
  variant = "primary",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
}) {
  return (
    <button
      className={clsx(
        "inline-flex min-h-11 min-w-[2.75rem] touch-manipulation items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-[0.99] disabled:active:scale-100",
        variant === "primary" &&
          "bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50",
        variant === "ghost" &&
          "bg-white text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50",
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
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      <input
        className={clsx(
          "w-full min-h-12 touch-manipulation rounded-xl border border-slate-300 px-3 py-3 text-base text-slate-900 shadow-sm",
          className,
        )}
        {...rest}
      />
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}
