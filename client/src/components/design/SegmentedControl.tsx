import { cn } from "@/lib/utils";

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  "aria-label": ariaLabel,
  className,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  "aria-label": string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex rounded-sm border border-[#D1D5DB] bg-surface p-0.5",
        className,
      )}
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "min-h-11 min-w-11 cursor-pointer touch-manipulation rounded-sm px-3 text-sm font-semibold",
              active ? "bg-ink text-white" : "bg-transparent text-muted-label hover:text-ink",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
