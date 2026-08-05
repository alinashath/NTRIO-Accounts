import { prisma } from "../lib/prisma.js";
import { toMoney } from "../lib/money.js";

/**
 * Credit to destination account for an inbound transfer.
 * Debit side always uses `amount` in source currency; credit is
 * `amount * exchange_rate` when currencies differ (`exchange_rate` = to per 1 from).
 */
export function transferCreditToDestination(t: {
  amount: unknown;
  exchangeRate: unknown;
  fromAccount: { currency: string };
  toAccount: { currency: string };
}): number {
  const amt = Number(t.amount);
  if (t.fromAccount.currency === t.toAccount.currency) return amt;
  const rate = Number(t.exchangeRate ?? 0);
  if (!rate || rate <= 0) return amt;
  return toMoney(amt * rate);
}

/**
 * Recomputes cached `balance` from opening balance plus all live flows.
 * Transfers: debit `amount` from source (in source currency); credit destination
 * with `amount * exchange_rate` when currencies differ (`exchange_rate` = to per 1 from).
 */
export async function recalculateAccountBalance(accountId: string): Promise<number> {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return 0;

  const opening = Number(account.openingBalance);

  const [incomeAgg, expenseAgg] = await Promise.all([
    prisma.incomeEntry.aggregate({
      where: { accountId, deletedAt: null, voidedAt: null },
      _sum: { amount: true },
    }),
    prisma.expenseEntry.aggregate({
      where: { accountId, deletedAt: null, voidedAt: null },
      _sum: { amount: true },
    }),
  ]);

  const transfersOut = await prisma.accountTransfer.findMany({
    where: { fromAccountId: accountId },
    include: { fromAccount: true, toAccount: true },
  });

  const transfersIn = await prisma.accountTransfer.findMany({
    where: { toAccountId: accountId },
    include: { fromAccount: true, toAccount: true },
  });

  let outT = 0;
  for (const t of transfersOut) {
    outT += Number(t.amount);
  }

  let inT = 0;
  for (const t of transfersIn) {
    inT += transferCreditToDestination(t);
  }

  const payments = await prisma.debtPayment.findMany({
    where: { accountId, voidedAt: null },
    include: { debt: true },
  });

  let debtDelta = 0;
  for (const p of payments) {
    const cash = p.accountAmount != null ? Number(p.accountAmount) : Number(p.amount);
    if (p.debt.direction === "i_owe") debtDelta -= cash;
    else debtDelta += cash;
  }

  const adjAgg = await prisma.accountBalanceAdjustment.aggregate({
    where: { accountId },
    _sum: { amount: true },
  });
  const adjustmentTotal = Number(adjAgg._sum.amount ?? 0);

  const income = Number(incomeAgg._sum.amount ?? 0);
  const expense = Number(expenseAgg._sum.amount ?? 0);

  const balance = toMoney(opening + income - expense - outT + inT + debtDelta + adjustmentTotal);

  await prisma.account.update({
    where: { id: accountId },
    data: { balance },
  });

  return balance;
}

export async function recalculateAccounts(accountIds: string[]) {
  const unique = [...new Set(accountIds)];
  for (const id of unique) {
    await recalculateAccountBalance(id);
  }
}
