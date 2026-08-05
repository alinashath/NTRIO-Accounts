import clsx from "clsx";
import { useDisplayCurrency } from "@/context/DisplayCurrencyContext";
import { formatAmountForDisplay } from "@/lib/displayFx";

/**
 * Shows the ledger `amount` in `nativeCurrency`, converted to the header display currency (global USD/MVR rate).
 * When that differs from display currency, the booked (native) figure appears in grey on a second line.
 */
export function DisplayAmountCell({
  amount,
  nativeCurrency,
  className,
  prefix = "",
  tone,
}: {
  amount: number;
  nativeCurrency: string;
  className?: string;
  /** Shown before both lines, e.g. "+" or "−" for signed lists */
  prefix?: string;
  /**
   * Color the primary amount.
   * - `auto`: green if ≥ 0, red if &lt; 0
   * - `positive` / `negative`: force green / red
   * - omit: use `className` only
   */
  tone?: "auto" | "positive" | "negative";
}) {
  const { displayCurrency, globalUsdMvrRate } = useDisplayCurrency();
  const { primary, secondary } = formatAmountForDisplay(
    amount,
    nativeCurrency,
    displayCurrency,
    globalUsdMvrRate,
  );
  const resolvedTone =
    tone === "auto" ? (amount < 0 ? "negative" : "positive") : tone;
  const toneClass =
    resolvedTone === "positive"
      ? "text-positive"
      : resolvedTone === "negative"
        ? "text-negative"
        : undefined;

  return (
    <span className="inline-flex flex-col items-end gap-0.5 tabular-nums">
      <span className={clsx(toneClass, className)}>{prefix ? `${prefix}${primary}` : primary}</span>
      {secondary ? (
        <span className="text-xs font-normal leading-tight text-muted-foreground">
          {prefix ? `${prefix}${secondary}` : secondary}
        </span>
      ) : null}
    </span>
  );
}
