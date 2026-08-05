import clsx from "clsx";

export type DateBasis = "accrual" | "cash";

const options: Array<{ value: DateBasis; label: string; hint: string }> = [
  { value: "accrual", label: "Accrual", hint: "Earned / bill (incurred) date" },
  { value: "cash", label: "Cash", hint: "Received / paid (transaction) date" },
];

export function DateBasisToggle({
  value,
  onChange,
}: {
  value: DateBasis;
  onChange: (next: DateBasis) => void;
}) {
  return (
    <div
      className="inline-flex rounded-[var(--radius-md)] border border-border bg-muted/60 p-0.5"
      role="group"
      aria-label="Date basis"
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          title={opt.hint}
          onClick={() => onChange(opt.value)}
          className={clsx(
            "h-8 touch-manipulation rounded-[calc(var(--radius-md)-2px)] px-2.5 text-xs font-semibold transition",
            value === opt.value
              ? "bg-primary text-on-primary shadow-sm"
              : "text-muted-foreground hover:bg-card hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function dateBasisSubtitle(basis: DateBasis): string {
  return basis === "accrual"
    ? "Accrual · earned / bill date"
    : "Cash · received / paid date";
}
