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
}: {
  amount: number;
  nativeCurrency: string;
  className?: string;
  /** Shown before both lines, e.g. "+" or "−" for signed lists */
  prefix?: string;
}) {
  const { displayCurrency, globalUsdMvrRate } = useDisplayCurrency();
  const { primary, secondary } = formatAmountForDisplay(
    amount,
    nativeCurrency,
    displayCurrency,
    globalUsdMvrRate,
  );
  return (
    <span className="inline-flex flex-col items-end gap-0.5 tabular-nums">
      <span className={clsx(className)}>{prefix ? `${prefix}${primary}` : primary}</span>
      {secondary ? (
        <span className="text-xs font-normal leading-tight text-slate-400">
          {prefix ? `${prefix}${secondary}` : secondary}
        </span>
      ) : null}
    </span>
  );
}
