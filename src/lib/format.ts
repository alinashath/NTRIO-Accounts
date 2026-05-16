import type { AccountCategory } from "./types";

export function formatMoney(amount: number, currency = "USD") {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

export function displayBalance(balance: number, category: AccountCategory) {
  if (category === "income") {
    return Math.abs(balance);
  }
  return balance;
}

export function categoryLabel(category: AccountCategory) {
  const labels: Record<AccountCategory, string> = {
    asset: "Assets",
    liability: "Liabilities",
    equity: "Equity",
    income: "Income",
    expense: "Expenses",
  };
  return labels[category];
}
