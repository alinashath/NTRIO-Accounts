/** Round to 2 decimal places for currency-safe numbers in JS. */
export function toMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function toDecimalString(n: number): string {
  return toMoney(n).toFixed(2);
}
