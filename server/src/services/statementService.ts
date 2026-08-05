import { convertWithUsdMvrRate } from "../lib/displayFx.js";
import { prisma } from "../lib/prisma.js";
import { toMoney } from "../lib/money.js";
import { transferCreditToDestination } from "./balanceService.js";

export type DisplayCurrency = "USD" | "MVR";

/** Accrual = earned / bill (incurred) date. Cash = received / paid (transaction) date. */
export type DateBasis = "accrual" | "cash";

function dayEnd(ymd: string) {
  return new Date(`${ymd}T23:59:59Z`);
}

function dayStart(ymd: string) {
  return new Date(`${ymd}T00:00:00Z`);
}

/** Previous calendar day as YYYY-MM-DD (UTC). */
export function previousYmd(ymd: string): string {
  const d = dayStart(ymd);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function getUsdMvrRate(userId: string): Promise<number> {
  const row = await prisma.userSettings.findUnique({ where: { userId } });
  return Number(row?.globalUsdMvrRate ?? 15.42);
}

function conv(
  amount: number,
  fromCurrency: string,
  display: DisplayCurrency | null,
  rate: number,
): number {
  if (!display) return toMoney(amount);
  return convertWithUsdMvrRate(amount, fromCurrency, display, rate);
}

/**
 * Account balance as of end of `asOfYmd` (cash basis + adjustments), in account currency.
 * Matches live recalculation rules with date cutoffs.
 */
export async function accountBalanceAsOf(accountId: string, asOfYmd: string): Promise<number> {
  const end = dayEnd(asOfYmd);
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return 0;

  const [inc, exp, tout, tin, debtPay, adj] = await Promise.all([
    prisma.incomeEntry.aggregate({
      where: {
        accountId,
        deletedAt: null,
        voidedAt: null,
        receivedDate: { not: null, lte: end },
      },
      _sum: { amount: true },
    }),
    prisma.expenseEntry.aggregate({
      where: {
        accountId,
        deletedAt: null,
        voidedAt: null,
        paidDate: { not: null, lte: end },
      },
      _sum: { amount: true },
    }),
    prisma.accountTransfer.aggregate({
      where: { fromAccountId: accountId, date: { lte: end } },
      _sum: { amount: true },
    }),
    prisma.accountTransfer.findMany({
      where: { toAccountId: accountId, date: { lte: end } },
      include: { fromAccount: true, toAccount: true },
    }),
    prisma.debtPayment.findMany({
      where: { accountId, voidedAt: null, date: { lte: end } },
      include: { debt: true },
    }),
    prisma.accountBalanceAdjustment.aggregate({
      where: { accountId, date: { lte: end } },
      _sum: { amount: true },
    }),
  ]);

  let debtDelta = 0;
  for (const p of debtPay) {
    const cash = p.accountAmount != null ? Number(p.accountAmount) : Number(p.amount);
    debtDelta += p.debt.direction === "i_owe" ? -cash : cash;
  }

  const transferIn = tin.reduce((s, t) => s + transferCreditToDestination(t), 0);

  return toMoney(
    Number(account.openingBalance) +
      Number(inc._sum.amount ?? 0) -
      Number(exp._sum.amount ?? 0) -
      Number(tout._sum.amount ?? 0) +
      transferIn +
      debtDelta +
      Number(adj._sum.amount ?? 0),
  );
}

export type BalanceSheetLine = {
  key: string;
  label: string;
  amount: number;
  native_currency?: string;
  native_amount?: number;
};

export type BalanceSheetStatement = {
  as_of: string;
  display_currency: DisplayCurrency;
  assets: {
    cash_accounts: BalanceSheetLine[];
    total_cash: number;
    receivables: BalanceSheetLine[];
    total_receivables: number;
    total_assets: number;
  };
  liabilities: {
    payables: BalanceSheetLine[];
    total_payables: number;
    debts_payable: BalanceSheetLine[];
    total_debts_payable: number;
    total_liabilities: number;
  };
  equity: {
    net_worth: number;
  };
  total_liabilities_and_equity: number;
  /** Assets − (Liabilities + Equity); should be ~0 */
  equation_diff: number;
  /** Legacy dashboard fields */
  cash_and_accounts: number;
  outstanding_i_owe: number;
  outstanding_owed_to_me: number;
  pay_later_unpaid: number;
  net_worth: number;
};

export async function buildBalanceSheet(
  userId: string,
  asOfYmd: string,
  displayCurrency: DisplayCurrency,
): Promise<BalanceSheetStatement> {
  const end = dayEnd(asOfYmd);
  const rate = await getUsdMvrRate(userId);
  const accounts = await prisma.account.findMany({
    where: { userId },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });

  const cashAccounts: BalanceSheetLine[] = [];
  let totalCash = 0;
  for (const a of accounts) {
    const native = await accountBalanceAsOf(a.id, asOfYmd);
    const amount = conv(native, a.currency, displayCurrency, rate);
    cashAccounts.push({
      key: a.id,
      label: a.name,
      amount,
      native_currency: a.currency,
      native_amount: native,
    });
    totalCash = toMoney(totalCash + amount);
  }

  const debts = await prisma.debt.findMany({
    where: { userId, createdAt: { lte: end } },
    include: { payments: true },
  });

  const debtIds = debts.map((d) => d.id);
  const accGroups =
    debtIds.length === 0
      ? []
      : await prisma.expenseEntry.groupBy({
          by: ["debtId"],
          where: {
            userId,
            debtId: { in: debtIds },
            deletedAt: null,
            voidedAt: null,
            billDate: { lte: end },
          },
          _sum: { amount: true },
        });
  const accMap = new Map(
    accGroups
      .filter((g): g is typeof g & { debtId: string } => g.debtId != null)
      .map((g) => [g.debtId, toMoney(Number(g._sum.amount ?? 0))]),
  );

  const receivables: BalanceSheetLine[] = [];
  const debtsPayable: BalanceSheetLine[] = [];
  let totalReceivables = 0;
  let totalDebtsPayable = 0;

  for (const d of debts) {
    const paid = toMoney(
      d.payments
        .filter((p) => !p.voidedAt && p.date <= end)
        .reduce((s, p) => s + Number(p.amount), 0),
    );
    const principal = toMoney(Number(d.principal));
    const accrued = accMap.get(d.id) ?? 0;
    const outst = toMoney(principal + accrued - paid);
    if (outst <= 0) continue;
    const amount = conv(outst, d.currency, displayCurrency, rate);
    const line: BalanceSheetLine = {
      key: d.id,
      label: d.contactName,
      amount,
      native_currency: d.currency,
      native_amount: outst,
    };
    if (d.direction === "owed_to_me") {
      receivables.push(line);
      totalReceivables = toMoney(totalReceivables + amount);
    } else {
      debtsPayable.push(line);
      totalDebtsPayable = toMoney(totalDebtsPayable + amount);
    }
  }

  /** Unpaid bills as of date: billed on/before as-of and not yet paid by as-of. */
  const plRows = await prisma.expenseEntry.findMany({
    where: {
      userId,
      deletedAt: null,
      voidedAt: null,
      billDate: { lte: end },
      debtId: null,
      OR: [{ paidDate: null }, { paidDate: { gt: end } }],
    },
    select: { id: true, amount: true, billCurrency: true, description: true, merchant: true },
  });

  const payables: BalanceSheetLine[] = plRows.map((r) => {
    const native = toMoney(Number(r.amount));
    const ccy = (r.billCurrency ?? "USD").toUpperCase();
    return {
      key: r.id,
      label: r.description ?? r.merchant ?? "Unpaid bill",
      amount: conv(native, ccy, displayCurrency, rate),
      native_currency: ccy,
      native_amount: native,
    };
  });
  const totalPayables = toMoney(payables.reduce((s, l) => s + l.amount, 0));

  const totalAssets = toMoney(totalCash + totalReceivables);
  const totalLiabilities = toMoney(totalPayables + totalDebtsPayable);
  const netWorth = toMoney(totalAssets - totalLiabilities);
  const totalLiabilitiesAndEquity = toMoney(totalLiabilities + netWorth);

  return {
    as_of: asOfYmd,
    display_currency: displayCurrency,
    assets: {
      cash_accounts: cashAccounts,
      total_cash: totalCash,
      receivables,
      total_receivables: totalReceivables,
      total_assets: totalAssets,
    },
    liabilities: {
      payables,
      total_payables: totalPayables,
      debts_payable: debtsPayable,
      total_debts_payable: totalDebtsPayable,
      total_liabilities: totalLiabilities,
    },
    equity: { net_worth: netWorth },
    total_liabilities_and_equity: totalLiabilitiesAndEquity,
    equation_diff: toMoney(totalAssets - totalLiabilitiesAndEquity),
    cash_and_accounts: totalCash,
    outstanding_i_owe: totalDebtsPayable,
    outstanding_owed_to_me: totalReceivables,
    pay_later_unpaid: totalPayables,
    net_worth: netWorth,
  };
}

export type CashFlowLine = { key: string; label: string; amount: number };

export type CashFlowStatement = {
  from: string;
  to: string;
  display_currency: DisplayCurrency;
  date_basis: DateBasis;
  operating: {
    cash_from_income: number;
    cash_paid_expenses: number;
    adjustments: number;
    lines_income: CashFlowLine[];
    lines_expense: CashFlowLine[];
    net: number;
  };
  financing: {
    debt_collections: number;
    debt_repayments: number;
    net: number;
  };
  /** Inter-account transfers (memo only; excluded from net cash). */
  transfers_memo: number;
  net_change_in_cash: number;
  cash_beginning: number;
  cash_ending: number;
  /** beginning + net_change − ending; FX/timing residual */
  reconciling_diff: number;
  accounts: Array<{
    account_id: string;
    name: string;
    currency: string;
    money_in: number;
    money_out: number;
    net_flow: number;
  }>;
};

export async function buildCashFlowStatement(
  userId: string,
  fromYmd: string,
  toYmd: string,
  displayCurrency: DisplayCurrency,
  dateBasis: DateBasis = "accrual",
): Promise<CashFlowStatement> {
  const from = dayStart(fromYmd);
  const to = dayEnd(toYmd);
  const rate = await getUsdMvrRate(userId);
  const accounts = await prisma.account.findMany({
    where: { userId },
    orderBy: { name: "asc" },
  });

  let cashFromIncome = 0;
  let cashPaidExpenses = 0;
  let adjustments = 0;
  let debtCollections = 0;
  let debtRepayments = 0;
  let transfersMemo = 0;

  const incomeByCat = new Map<string, { label: string; amount: number }>();
  const expenseByCat = new Map<string, { label: string; amount: number }>();

  const incomeDateWhere =
    dateBasis === "accrual"
      ? { date: { gte: from, lte: to } }
      : { receivedDate: { not: null, gte: from, lte: to } };
  const expenseDateWhere =
    dateBasis === "accrual"
      ? { billDate: { gte: from, lte: to } }
      : { paidDate: { not: null, gte: from, lte: to } };

  const accountRows: CashFlowStatement["accounts"] = [];

  for (const a of accounts) {
    const [incRows, expRows, tout, tin, debtPay, adjRows] = await Promise.all([
      prisma.incomeEntry.findMany({
        where: {
          userId,
          accountId: a.id,
          deletedAt: null,
          voidedAt: null,
          ...incomeDateWhere,
        },
        include: { category: true },
      }),
      prisma.expenseEntry.findMany({
        where: {
          userId,
          accountId: a.id,
          deletedAt: null,
          voidedAt: null,
          ...expenseDateWhere,
        },
        include: { category: true },
      }),
      prisma.accountTransfer.aggregate({
        where: { userId, fromAccountId: a.id, date: { gte: from, lte: to } },
        _sum: { amount: true },
      }),
      prisma.accountTransfer.findMany({
        where: { userId, toAccountId: a.id, date: { gte: from, lte: to } },
        include: { fromAccount: true, toAccount: true },
      }),
      prisma.debtPayment.findMany({
        where: { accountId: a.id, voidedAt: null, date: { gte: from, lte: to } },
        include: { debt: true },
      }),
      prisma.accountBalanceAdjustment.findMany({
        where: { accountId: a.id, date: { gte: from, lte: to } },
      }),
    ]);

    let incomeSum = 0;
    for (const r of incRows) {
      const amt = Number(r.amount);
      incomeSum += amt;
      const converted = conv(amt, a.currency, displayCurrency, rate);
      cashFromIncome = toMoney(cashFromIncome + converted);
      const key = r.categoryId ?? "uncategorized";
      const label = r.category?.name ?? "Uncategorized";
      const prev = incomeByCat.get(key) ?? { label, amount: 0 };
      prev.amount = toMoney(prev.amount + converted);
      incomeByCat.set(key, prev);
    }

    let expenseSum = 0;
    for (const r of expRows) {
      const amt = Number(r.amount);
      expenseSum += amt;
      const converted = conv(amt, a.currency, displayCurrency, rate);
      cashPaidExpenses = toMoney(cashPaidExpenses + converted);
      const key = r.categoryId ?? "uncategorized";
      const label = r.category?.name ?? "Uncategorized";
      const prev = expenseByCat.get(key) ?? { label, amount: 0 };
      prev.amount = toMoney(prev.amount + converted);
      expenseByCat.set(key, prev);
    }

    const transferOut = Number(tout._sum.amount ?? 0);
    const transferIn = toMoney(tin.reduce((s, t) => s + transferCreditToDestination(t), 0));
    transfersMemo = toMoney(
      transfersMemo +
        conv(transferIn, a.currency, displayCurrency, rate) -
        conv(transferOut, a.currency, displayCurrency, rate),
    );

    let debtIn = 0;
    let debtOut = 0;
    for (const p of debtPay) {
      const cash = p.accountAmount != null ? Number(p.accountAmount) : Number(p.amount);
      const converted = conv(cash, a.currency, displayCurrency, rate);
      if (p.debt.direction === "i_owe") {
        debtOut += cash;
        debtRepayments = toMoney(debtRepayments + converted);
      } else {
        debtIn += cash;
        debtCollections = toMoney(debtCollections + converted);
      }
    }

    let adjSum = 0;
    for (const r of adjRows) {
      const amt = Number(r.amount);
      adjSum += amt;
      adjustments = toMoney(adjustments + conv(amt, a.currency, displayCurrency, rate));
    }

    const moneyIn = toMoney(incomeSum + transferIn + debtIn + Math.max(adjSum, 0));
    const moneyOut = toMoney(expenseSum + transferOut + debtOut + Math.max(-adjSum, 0));

    accountRows.push({
      account_id: a.id,
      name: a.name,
      currency: a.currency,
      money_in: moneyIn,
      money_out: moneyOut,
      net_flow: toMoney(moneyIn - moneyOut),
    });
  }

  /** Accrual: also include income/expenses not tied to an account (e.g. pay-later, receivables). */
  if (dateBasis === "accrual") {
    const [orphanInc, orphanExp] = await Promise.all([
      prisma.incomeEntry.findMany({
        where: {
          userId,
          accountId: null,
          deletedAt: null,
          voidedAt: null,
          date: { gte: from, lte: to },
        },
        include: { category: true },
      }),
      prisma.expenseEntry.findMany({
        where: {
          userId,
          accountId: null,
          deletedAt: null,
          voidedAt: null,
          billDate: { gte: from, lte: to },
        },
        include: { category: true, debt: true },
      }),
    ]);
    for (const r of orphanInc) {
      const ccy = r.currency ?? "USD";
      const converted = conv(Number(r.amount), ccy, displayCurrency, rate);
      cashFromIncome = toMoney(cashFromIncome + converted);
      const key = r.categoryId ?? "uncategorized";
      const label = r.category?.name ?? "Uncategorized";
      const prev = incomeByCat.get(key) ?? { label, amount: 0 };
      prev.amount = toMoney(prev.amount + converted);
      incomeByCat.set(key, prev);
    }
    for (const r of orphanExp) {
      const ccy = r.debt?.currency ?? r.billCurrency ?? "USD";
      const converted = conv(Number(r.amount), ccy, displayCurrency, rate);
      cashPaidExpenses = toMoney(cashPaidExpenses + converted);
      const key = r.categoryId ?? "uncategorized";
      const label = r.category?.name ?? "Uncategorized";
      const prev = expenseByCat.get(key) ?? { label, amount: 0 };
      prev.amount = toMoney(prev.amount + converted);
      expenseByCat.set(key, prev);
    }
  }

  const operatingNet = toMoney(cashFromIncome - cashPaidExpenses + adjustments);
  const financingNet = toMoney(debtCollections - debtRepayments);
  const netChange = toMoney(operatingNet + financingNet);

  const beginYmd = previousYmd(fromYmd);
  let cashBeginning = 0;
  let cashEnding = 0;
  for (const a of accounts) {
    const b0 = await accountBalanceAsOf(a.id, beginYmd);
    const b1 = await accountBalanceAsOf(a.id, toYmd);
    cashBeginning = toMoney(cashBeginning + conv(b0, a.currency, displayCurrency, rate));
    cashEnding = toMoney(cashEnding + conv(b1, a.currency, displayCurrency, rate));
  }

  const impliedEnding = toMoney(cashBeginning + netChange);
  const reconcilingDiff = toMoney(cashEnding - impliedEnding);

  return {
    from: fromYmd,
    to: toYmd,
    display_currency: displayCurrency,
    date_basis: dateBasis,
    operating: {
      cash_from_income: cashFromIncome,
      cash_paid_expenses: cashPaidExpenses,
      adjustments,
      lines_income: [...incomeByCat.entries()]
        .map(([key, v]) => ({ key, label: v.label, amount: v.amount }))
        .sort((a, b) => b.amount - a.amount),
      lines_expense: [...expenseByCat.entries()]
        .map(([key, v]) => ({ key, label: v.label, amount: v.amount }))
        .sort((a, b) => b.amount - a.amount),
      net: operatingNet,
    },
    financing: {
      debt_collections: debtCollections,
      debt_repayments: debtRepayments,
      net: financingNet,
    },
    transfers_memo: transfersMemo,
    net_change_in_cash: netChange,
    cash_beginning: cashBeginning,
    cash_ending: cashEnding,
    reconciling_diff: reconcilingDiff,
    accounts: accountRows,
  };
}

export type IncomeStatementLine = {
  key: string;
  label: string;
  amount: number;
  category_id: string | null;
  pct_of_total: number;
};

export type IncomeStatement = {
  from: string;
  to: string;
  display_currency: DisplayCurrency;
  basis: DateBasis;
  date_basis: DateBasis;
  income_lines: IncomeStatementLine[];
  expense_lines: IncomeStatementLine[];
  total_income: number;
  total_expenses: number;
  net_income: number;
  /** Alias fields for existing clients */
  net: number;
  gross_profit: number;
};

export async function buildIncomeStatement(
  userId: string,
  fromYmd: string,
  toYmd: string,
  displayCurrency: DisplayCurrency,
  dateBasis: DateBasis = "accrual",
): Promise<IncomeStatement> {
  const from = dayStart(fromYmd);
  const to = dayEnd(toYmd);
  const rate = await getUsdMvrRate(userId);

  const incomeWhere =
    dateBasis === "accrual"
      ? {
          userId,
          deletedAt: null,
          voidedAt: null,
          date: { gte: from, lte: to },
        }
      : {
          userId,
          deletedAt: null,
          voidedAt: null,
          receivedDate: { not: null, gte: from, lte: to },
        };

  const expenseWhere =
    dateBasis === "accrual"
      ? {
          userId,
          deletedAt: null,
          voidedAt: null,
          billDate: { gte: from, lte: to },
        }
      : {
          userId,
          deletedAt: null,
          voidedAt: null,
          paidDate: { not: null, gte: from, lte: to },
        };

  const [incomeRows, expenseRows] = await Promise.all([
    prisma.incomeEntry.findMany({
      where: incomeWhere,
      include: { account: true, category: true },
    }),
    prisma.expenseEntry.findMany({
      where: expenseWhere,
      include: { account: true, debt: true, category: true },
    }),
  ]);

  const incomeMap = new Map<string, { label: string; category_id: string | null; amount: number }>();
  let totalIncome = 0;
  for (const r of incomeRows) {
    const ccy = r.account?.currency ?? r.currency ?? "USD";
    const amount = conv(Number(r.amount), ccy, displayCurrency, rate);
    totalIncome = toMoney(totalIncome + amount);
    const key = r.categoryId ?? "uncategorized";
    const prev = incomeMap.get(key) ?? {
      label: r.category?.name ?? "Uncategorized",
      category_id: r.categoryId,
      amount: 0,
    };
    prev.amount = toMoney(prev.amount + amount);
    incomeMap.set(key, prev);
  }

  const expenseMap = new Map<string, { label: string; category_id: string | null; amount: number }>();
  let totalExpenses = 0;
  for (const r of expenseRows) {
    const ccy = r.account?.currency ?? r.debt?.currency ?? r.billCurrency ?? "USD";
    const amount = conv(Number(r.amount), ccy, displayCurrency, rate);
    totalExpenses = toMoney(totalExpenses + amount);
    const key = r.categoryId ?? "uncategorized";
    const prev = expenseMap.get(key) ?? {
      label: r.category?.name ?? "Uncategorized",
      category_id: r.categoryId,
      amount: 0,
    };
    prev.amount = toMoney(prev.amount + amount);
    expenseMap.set(key, prev);
  }

  const income_lines: IncomeStatementLine[] = [...incomeMap.entries()]
    .map(([key, v]) => ({
      key,
      label: v.label,
      amount: v.amount,
      category_id: v.category_id,
      pct_of_total: totalIncome > 0 ? toMoney((v.amount / totalIncome) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const expense_lines: IncomeStatementLine[] = [...expenseMap.entries()]
    .map(([key, v]) => ({
      key,
      label: v.label,
      amount: v.amount,
      category_id: v.category_id,
      pct_of_total: totalExpenses > 0 ? toMoney((v.amount / totalExpenses) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const net = toMoney(totalIncome - totalExpenses);

  return {
    from: fromYmd,
    to: toYmd,
    display_currency: displayCurrency,
    basis: dateBasis,
    date_basis: dateBasis,
    income_lines,
    expense_lines,
    total_income: totalIncome,
    total_expenses: totalExpenses,
    net_income: net,
    net,
    gross_profit: totalIncome,
  };
}
