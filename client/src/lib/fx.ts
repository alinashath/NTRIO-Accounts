/** Default: 1 USD = 15.42 MVR (editable on transfer). */
export const USD_MVR_RATE_DEFAULT = 15.42;

/**
 * Returns **to-currency units per 1 from-currency unit** for known pairs.
 * Unknown pairs return `null` (caller should require manual input).
 */
export function defaultTransferExchangeRate(
  fromCurrency: string,
  toCurrency: string,
): number | null {
  if (fromCurrency === toCurrency) return 1;
  if (fromCurrency === "USD" && toCurrency === "MVR") return USD_MVR_RATE_DEFAULT;
  if (fromCurrency === "MVR" && toCurrency === "USD")
    return 1 / USD_MVR_RATE_DEFAULT;
  return null;
}

export const ACCOUNT_CURRENCIES = ["USD", "MVR"] as const;
export type AccountCurrency = (typeof ACCOUNT_CURRENCIES)[number];
