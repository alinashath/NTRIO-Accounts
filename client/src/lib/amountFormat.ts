import { formatMoneyAmountOnly, toMoney } from "@/lib/money";

const MINUS = "\u2212"; // true minus sign

/** DESIGN.md Amount: `+MVR 5,600.00` / `−MVR 840.00` */
export function formatSignedAmount(
  n: number,
  currency: string,
  kind: "credit" | "debit" | "auto" = "auto",
): string {
  const abs = formatMoneyAmountOnly(Math.abs(toMoney(n)));
  const code = currency.toUpperCase();
  let sign: string;
  if (kind === "credit") sign = "+";
  else if (kind === "debit") sign = MINUS;
  else sign = n < 0 ? MINUS : n > 0 ? "+" : "";
  return `${sign}${code} ${abs}`;
}

export function formatUnsignedAmount(n: number, currency: string): string {
  return `${currency.toUpperCase()} ${formatMoneyAmountOnly(toMoney(n))}`;
}

/** Caption secondary line e.g. `US$280.00` or `USD 280.00` */
export function formatCaptionAmount(n: number, currency: string): string {
  const code = currency.toUpperCase();
  if (code === "USD") return `US$${formatMoneyAmountOnly(toMoney(n))}`;
  return formatUnsignedAmount(n, code);
}
