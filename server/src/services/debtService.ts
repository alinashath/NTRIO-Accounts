import { prisma } from "../lib/prisma.js";
import { toMoney } from "../lib/money.js";

export function nonVoidedPaidSum(payments: { amount: unknown; voidedAt: Date | null }[]) {
  return toMoney(
    payments.filter((p) => !p.voidedAt).reduce((a, p) => a + Number(p.amount), 0),
  );
}

export async function accruedFromExpenses(debtId: string): Promise<number> {
  const acc = await prisma.expenseEntry.aggregate({
    where: { debtId, deletedAt: null, voidedAt: null },
    _sum: { amount: true },
  });
  return toMoney(Number(acc._sum.amount ?? 0));
}

/** Outstanding = principal + card charges (expenses on debt) − payments (all in debt currency). */
export async function refreshDebtSettlement(debtId: string) {
  const debt = await prisma.debt.findUnique({
    where: { id: debtId },
    include: { payments: true },
  });
  if (!debt) return;
  const paid = nonVoidedPaidSum(debt.payments);
  const principal = toMoney(Number(debt.principal));
  const accrued = await accruedFromExpenses(debtId);
  const outstanding = toMoney(principal + accrued - paid);
  if (outstanding <= 0) {
    await prisma.debt.update({ where: { id: debtId }, data: { status: "settled" } });
  } else {
    await prisma.debt.update({ where: { id: debtId }, data: { status: "open" } });
  }
}
