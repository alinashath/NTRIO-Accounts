import { cn } from "@/lib/utils";
import {
  formatCaptionAmount,
  formatSignedAmount,
  formatUnsignedAmount,
} from "@/lib/amountFormat";

type AmountProps = {
  value: number;
  currency: string;
  /** credit = + and green; debit = − and red; plain = ink, optional auto sign */
  tone?: "credit" | "debit" | "plain" | "auto";
  signed?: boolean;
  captionValue?: number;
  captionCurrency?: string;
  size?: "lg" | "md";
  className?: string;
};

export function Amount({
  value,
  currency,
  tone = "auto",
  signed = true,
  captionValue,
  captionCurrency,
  size = "md",
  className,
}: AmountProps) {
  const resolvedTone =
    tone === "auto" ? (value < 0 ? "debit" : value > 0 ? "credit" : "plain") : tone;

  const kind =
    resolvedTone === "credit" ? "credit" : resolvedTone === "debit" ? "debit" : "auto";

  const primary = signed
    ? formatSignedAmount(value, currency, kind === "auto" ? "auto" : kind)
    : formatUnsignedAmount(value, currency);

  const toneClass =
    resolvedTone === "credit"
      ? "text-credit"
      : resolvedTone === "debit"
        ? "text-debit"
        : "text-ink";

  return (
    <span
      className={cn(
        "inline-flex flex-col items-end tabular-nums",
        size === "lg" ? "text-amount-lg" : "text-sm font-semibold leading-5",
        toneClass,
        className,
      )}
    >
      <span className="amount whitespace-nowrap">{primary}</span>
      {captionValue != null && captionCurrency ? (
        <span className="text-caption font-normal">
          {formatCaptionAmount(captionValue, captionCurrency)}
        </span>
      ) : null}
    </span>
  );
}
