import { toMoney } from "./money.js";

/** MVR units per 1 USD (same convention as account transfers). */
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
