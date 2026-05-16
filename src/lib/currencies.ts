/** Common currencies for guest houses and small business (ISO 4217). */
export const CURRENCIES = [
  "MVR",
  "USD",
  "EUR",
  "GBP",
  "INR",
  "SGD",
  "THB",
  "AED",
  "LKR",
  "AUD",
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number];
