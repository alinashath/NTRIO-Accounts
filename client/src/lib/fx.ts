import { USD_MVR_RATE_DEFAULT } from "@/lib/fxRates";

/** Default: 1 USD = 20 MVR (editable on transfer; prefer Settings rate when available). */
export { USD_MVR_RATE_DEFAULT };

/**
 * Returns **to-currency units per 1 from-currency unit** for known pairs.
 * Unknown pairs return `null` (caller should require manual input).
 */
export function defaultTransferExchangeRate(
  fromCurrency: string,
  toCurrency: string,
  usdMvrRate: number = USD_MVR_RATE_DEFAULT,
): number | null {
  if (fromCurrency === toCurrency) return 1;
  const r = usdMvrRate > 0 ? usdMvrRate : USD_MVR_RATE_DEFAULT;
  if (fromCurrency === "USD" && toCurrency === "MVR") return r;
  if (fromCurrency === "MVR" && toCurrency === "USD") return 1 / r;
  return null;
}

export const ACCOUNT_CURRENCIES = ["USD", "MVR"] as const;
export type AccountCurrency = (typeof ACCOUNT_CURRENCIES)[number];
