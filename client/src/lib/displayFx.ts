import { formatMoney, toMoney } from "@/lib/money";

/** MVR units per 1 USD (matches server / transfers). */
export function convertWithUsdMvrRate(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  usdMvrRate: number,
): number {
  const a = fromCurrency.toUpperCase();
  const b = toCurrency.toUpperCase();
  if (a === b) return toMoney(amount);
  const r = usdMvrRate > 0 ? usdMvrRate : 20;
  if (a === "USD" && b === "MVR") return toMoney(amount * r);
  if (a === "MVR" && b === "USD") return toMoney(amount / r);
  return toMoney(amount);
}

/** Primary string in `displayCurrency`; optional secondary in native amount currency when they differ. */
export function formatAmountForDisplay(
  amount: number,
  amountCurrency: string,
  displayCurrency: string,
  usdMvrRate: number,
): { primary: string; secondary?: string } {
  const from = amountCurrency.toUpperCase();
  const to = displayCurrency.toUpperCase();
  const conv = convertWithUsdMvrRate(amount, from, to, usdMvrRate);
  const primary = formatMoney(conv, to);
  if (from === to) return { primary };
  return { primary, secondary: formatMoney(toMoney(amount), from) };
}
