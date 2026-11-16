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
  size?: "xl" | "lg" | "md";
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

  const sizeClass =
    size === "xl"
      ? "text-number-display"
      : size === "lg"
        ? "text-amount-lg"
        : "text-sm font-semibold leading-5";

  return (
    <span
      className={cn(
        "amount inline-flex max-w-full flex-col items-start tabular-nums",
        sizeClass,
        toneClass,
        className,
      )}
    >
      <span className={size === "md" ? "whitespace-nowrap" : "max-w-full truncate"}>
        {primary}
      </span>
      {captionValue != null && captionCurrency ? (
        <span className="text-caption font-normal tabular-nums">
          {formatCaptionAmount(captionValue, captionCurrency)}
        </span>
      ) : null}
    </span>
  );
}
