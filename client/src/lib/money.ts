export function toMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatMoney(n: number, currency = "USD") {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toMoney(n));
}

/** Same grouping/decimals as currency amounts, without a currency symbol or code prefix. */
export function formatMoneyAmountOnly(n: number) {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toMoney(n));
}
