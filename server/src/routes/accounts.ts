import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { toMoney } from "../lib/money.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import {
  recalculateAccountBalance,
  recalculateAccounts,
} from "../services/balanceService.js";
import { asyncHandler } from "../utils/http.js";

export const accountsRouter = Router();
accountsRouter.use(requireAuth);

const accountType = z.enum(["bank", "cash", "wallet"]);

/** Non-zero opening or any live ledger activity → currency must stay fixed. */
async function currencyChangeLocked(accountId: string, openingBalance: unknown): Promise<boolean> {
  if (toMoney(Number(openingBalance)) !== 0) return true;
  const [ic, ec, tf, tt, dp, adj] = await Promise.all([
    prisma.incomeEntry.count({ where: { accountId, deletedAt: null, voidedAt: null } }),
    prisma.expenseEntry.count({ where: { accountId, deletedAt: null, voidedAt: null } }),
    prisma.accountTransfer.count({ where: { fromAccountId: accountId } }),
    prisma.accountTransfer.count({ where: { toAccountId: accountId } }),
    prisma.debtPayment.count({ where: { accountId, voidedAt: null } }),
    prisma.accountBalanceAdjustment.count({ where: { accountId } }),
  ]);
  return ic + ec + tf + tt + dp + adj > 0;
}

function serializeAccount(
  row: {
    id: string;
    name: string;
    type: string;
    currency: string;
    openingBalance: unknown;
    balance: unknown;
    openedAt: Date | null;
    createdAt: Date;
  },
  extras?: { can_change_currency: boolean },
) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    currency: row.currency,
    opening_balance: toMoney(Number(row.openingBalance)),
    balance: toMoney(Number(row.balance)),
    opened_at: row.openedAt,
    created_at: row.createdAt,
    ...(extras ? { can_change_currency: extras.can_change_currency } : {}),
  };
}

accountsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const rows = await prisma.account.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
    const out = await Promise.all(
      rows.map(async (row) => {
        const locked = await currencyChangeLocked(row.id, row.openingBalance);
        return serializeAccount(row, { can_change_currency: !locked });
      }),
    );
    res.json(out);
  }),
);

const createAccountSchema = z.object({
  name: z.string().min(1),
  type: accountType,
  currency: z.string().min(1).max(8).optional(),
  opened_at: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  opening_balance: z.number().finite().optional(),
});

accountsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const body = createAccountSchema.parse(req.body);
    const opening = toMoney(body.opening_balance ?? 0);
    const openedAt = body.opened_at
      ? new Date(body.opened_at.length === 10 ? `${body.opened_at}T00:00:00Z` : body.opened_at)
      : null;

    const row = await prisma.account.create({
      data: {
        userId,
        name: body.name,
        type: body.type,
        currency: body.currency ?? "USD",
        openingBalance: opening,
        balance: opening,
        openedAt,
      },
    });
    await recalculateAccountBalance(row.id);
    const fresh = await prisma.account.findUniqueOrThrow({ where: { id: row.id } });
    const locked = await currencyChangeLocked(fresh.id, fresh.openingBalance);
    res.status(201).json(serializeAccount(fresh, { can_change_currency: !locked }));
  }),
);

const transferSchema = z.object({
  from_account_id: z.string().uuid(),
  to_account_id: z.string().uuid(),
  amount: z.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional(),
  /** To-currency per 1 from-currency (required when from/to account currencies differ). */
  exchange_rate: z.number().positive().optional(),
});

accountsRouter.post(
  "/transfer",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const body = transferSchema.parse(req.body);

    if (body.from_account_id === body.to_account_id) {
      res.status(400).json({ error: "From and to accounts must differ" });
      return;
    }

    const [from, to] = await Promise.all([
      prisma.account.findFirst({ where: { id: body.from_account_id, userId } }),
      prisma.account.findFirst({ where: { id: body.to_account_id, userId } }),
    ]);

    if (!from || !to) {
      res.status(400).json({ error: "Invalid account" });
      return;
    }

    const cross = from.currency !== to.currency;
    if (cross) {
      if (body.exchange_rate === undefined || body.exchange_rate <= 0) {
        res.status(400).json({
          error:
            "exchange_rate is required for cross-currency transfers (to-currency units per 1 from-currency unit, e.g. 1 USD = 20 MVR → 20).",
        });
        return;
      }
    }

    const transfer = await prisma.accountTransfer.create({
      data: {
        userId,
        fromAccountId: body.from_account_id,
        toAccountId: body.to_account_id,
        amount: toMoney(body.amount),
        exchangeRate: cross ? body.exchange_rate : null,
        date: new Date(`${body.date}T00:00:00Z`),
        notes: body.notes ?? null,
      },
    });

    await recalculateAccounts([body.from_account_id, body.to_account_id]);

    res.status(201).json({
      id: transfer.id,
      from_account_id: transfer.fromAccountId,
      to_account_id: transfer.toAccountId,
      amount: toMoney(Number(transfer.amount)),
      exchange_rate: transfer.exchangeRate != null ? Number(transfer.exchangeRate) : null,
      date: transfer.date,
      notes: transfer.notes,
    });
  }),
);

const updateAccountSchema = z.object({
  name: z.string().min(1).optional(),
  type: accountType.optional(),
  currency: z.string().min(1).max(8).optional(),
  opened_at: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).nullable().optional(),
  opening_balance: z.number().finite().optional(),
});

accountsRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const id = z.string().uuid().parse(req.params.id);
    const body = updateAccountSchema.parse(req.body);

    const existing = await prisma.account.findFirst({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    const effectiveOpening =
      body.opening_balance !== undefined
        ? body.opening_balance
        : Number(existing.openingBalance);

    if (body.currency && body.currency !== existing.currency) {
      if (await currencyChangeLocked(id, effectiveOpening)) {
        res.status(400).json({
          error:
            "Cannot change currency while the account has a non-zero opening balance or ledger activity. You can still edit the name and type.",
        });
        return;
      }
    }

    const openedAt =
      body.opened_at === undefined
        ? undefined
        : body.opened_at === null
          ? null
          : new Date(
              body.opened_at.length === 10 ? `${body.opened_at}T00:00:00Z` : body.opened_at,
            );

    await prisma.account.update({
      where: { id },
      data: {
        name: body.name,
        type: body.type,
        currency: body.currency,
        openedAt,
        ...(body.opening_balance !== undefined
          ? { openingBalance: toMoney(body.opening_balance) }
          : {}),
      },
    });
    await recalculateAccountBalance(id);
    const fresh = await prisma.account.findUniqueOrThrow({ where: { id } });
    const locked = await currencyChangeLocked(id, fresh.openingBalance);
    res.json(serializeAccount(fresh, { can_change_currency: !locked }));
  }),
);

accountsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const id = z.string().uuid().parse(req.params.id);

    const existing = await prisma.account.findFirst({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    const [ic, ec, tf, tt, dp, adj] = await Promise.all([
      prisma.incomeEntry.count({ where: { accountId: id, deletedAt: null, voidedAt: null } }),
      prisma.expenseEntry.count({ where: { accountId: id, deletedAt: null, voidedAt: null } }),
      prisma.accountTransfer.count({ where: { fromAccountId: id } }),
      prisma.accountTransfer.count({ where: { toAccountId: id } }),
      prisma.debtPayment.count({ where: { accountId: id, voidedAt: null } }),
      prisma.accountBalanceAdjustment.count({ where: { accountId: id } }),
    ]);

    if (ic + ec + tf + tt + dp + adj > 0) {
      res.status(400).json({
        error: "Account has transactions; delete or reassign them first.",
      });
      return;
    }

    await prisma.account.delete({ where: { id } });
    res.status(204).send();
  }),
);

accountsRouter.get(
  "/:id/ledger",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const id = z.string().uuid().parse(req.params.id);
    const q = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        page_size: z.coerce.number().int().min(1).max(200).default(50),
      })
      .parse(req.query);

    const account = await prisma.account.findFirst({ where: { id, userId } });
    if (!account) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    type LedgerKind =
      | "income"
      | "expense"
      | "transfer_in"
      | "transfer_out"
      | "debt"
      | "adjustment";

    type LedgerRow = {
      id: string;
      kind: LedgerKind;
      date: Date;
      description: string | null;
      amount: number;
      signed_amount: number;
    };

    const [income, expenses, transfersOut, transfersIn, debtRows, adjustments] = await Promise.all([
      prisma.incomeEntry.findMany({
        where: { accountId: id, userId, deletedAt: null, voidedAt: null },
        select: { id: true, date: true, receivedDate: true, description: true, amount: true },
      }),
      prisma.expenseEntry.findMany({
        where: { accountId: id, userId, deletedAt: null, voidedAt: null },
        select: { id: true, paidDate: true, billDate: true, description: true, amount: true },
      }),
      prisma.accountTransfer.findMany({
        where: { fromAccountId: id, userId },
        select: {
          id: true,
          date: true,
          notes: true,
          amount: true,
          exchangeRate: true,
          toAccount: { select: { name: true, currency: true } },
        },
      }),
      prisma.accountTransfer.findMany({
        where: { toAccountId: id, userId },
        select: {
          id: true,
          date: true,
          notes: true,
          amount: true,
          exchangeRate: true,
          fromAccount: { select: { currency: true, name: true } },
          toAccount: { select: { currency: true } },
        },
      }),
      prisma.debtPayment.findMany({
        where: { accountId: id, voidedAt: null },
        include: { debt: true },
      }),
      prisma.accountBalanceAdjustment.findMany({
        where: { accountId: id, userId },
        select: { id: true, date: true, amount: true, note: true },
      }),
    ]);

    const rows: LedgerRow[] = [
      ...income.map((r) => ({
        id: r.id,
        kind: "income" as const,
        date: r.receivedDate ?? r.date,
        description: r.description,
        amount: toMoney(Number(r.amount)),
        signed_amount: toMoney(Number(r.amount)),
      })),
      ...expenses.map((r) => ({
        id: r.id,
        kind: "expense" as const,
        date: r.paidDate ?? r.billDate,
        description: r.description,
        amount: toMoney(Number(r.amount)),
        signed_amount: -toMoney(Number(r.amount)),
      })),
      ...transfersOut.map((r) => ({
        id: r.id,
        kind: "transfer_out" as const,
        date: r.date,
        description:
          r.notes ?? `Transfer → ${r.toAccount.name} (${r.toAccount.currency})`,
        amount: toMoney(Number(r.amount)),
        signed_amount: -toMoney(Number(r.amount)),
      })),
      ...transfersIn.map((r) => {
        const fromCur = r.fromAccount.currency;
        const toCur = r.toAccount.currency;
        const amt = Number(r.amount);
        const rate = fromCur === toCur ? 1 : Number(r.exchangeRate ?? 0) || 1;
        const credit = toMoney(amt * rate);
        return {
          id: r.id,
          kind: "transfer_in" as const,
          date: r.date,
          description:
            r.notes ?? `Transfer ← ${r.fromAccount.name} (${r.fromAccount.currency})`,
          amount: credit,
          signed_amount: credit,
        };
      }),
      ...debtRows.map((r) => {
        const cash = r.accountAmount != null ? Number(r.accountAmount) : Number(r.amount);
        const signed = r.debt.direction === "i_owe" ? -toMoney(cash) : toMoney(cash);
        return {
          id: r.id,
          kind: "debt" as const,
          date: r.date,
          description: r.notes ?? r.debt.contactName,
          amount: toMoney(Math.abs(cash)),
          signed_amount: signed,
        };
      }),
      ...adjustments.map((r) => {
        const amt = toMoney(Number(r.amount));
        return {
          id: r.id,
          kind: "adjustment" as const,
          date: r.date,
          description: r.note?.trim() ? r.note : "Balance adjustment",
          amount: toMoney(Math.abs(Number(r.amount))),
          signed_amount: amt,
        };
      }),
    ];

    rows.sort((a, b) => a.date.getTime() - b.date.getTime() || a.id.localeCompare(b.id));

    let running = toMoney(Number(account.openingBalance));
    const ascWithRunning = rows.map((r) => {
      running = toMoney(running + r.signed_amount);
      return { ...r, running_balance: running };
    });

    const total = ascWithRunning.length;
    const start = (q.page - 1) * q.page_size;
    const slice = ascWithRunning.slice(start, start + q.page_size);

    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    res.json({
      account: serializeAccount(account, {
        can_change_currency: !(await currencyChangeLocked(id, account.openingBalance)),
      }),
      opening_balance: toMoney(Number(account.openingBalance)),
      currency: account.currency,
      page: q.page,
      page_size: q.page_size,
      total,
      items: slice.map((r) => ({
        id: r.id,
        kind: r.kind,
        date: fmt(r.date),
        description: r.description,
        amount: r.amount,
        signed_amount: r.signed_amount,
        running_balance: r.running_balance,
        money_in: r.signed_amount > 0 ? r.amount : null,
        money_out: r.signed_amount < 0 ? r.amount : null,
      })),
    });
  }),
);

accountsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const id = z.string().uuid().parse(req.params.id);
    const row = await prisma.account.findFirst({ where: { id, userId } });
    if (!row) {
      res.status(404).json({ error: "Account not found" });
      return;
    }
    const locked = await currencyChangeLocked(row.id, row.openingBalance);
    res.json(serializeAccount(row, { can_change_currency: !locked }));
  }),
);

const adjustmentSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Signed amount in account currency: positive increases balance, negative decreases. */
  amount: z.number().finite().refine((n) => n !== 0, "amount must not be zero"),
  note: z.string().max(2000).optional(),
});

accountsRouter.post(
  "/:id/adjustments",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const id = z.string().uuid().parse(req.params.id);
    const body = adjustmentSchema.parse(req.body);

    const account = await prisma.account.findFirst({ where: { id, userId } });
    if (!account) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    const row = await prisma.accountBalanceAdjustment.create({
      data: {
        userId,
        accountId: id,
        date: new Date(`${body.date}T00:00:00Z`),
        amount: toMoney(body.amount),
        note: body.note?.trim() || null,
      },
    });

    await recalculateAccountBalance(id);
    const fresh = await prisma.account.findUniqueOrThrow({ where: { id } });

    res.status(201).json({
      id: row.id,
      account_id: id,
      date: body.date,
      amount: toMoney(Number(row.amount)),
      note: row.note,
      balance: toMoney(Number(fresh.balance)),
    });
  }),
);
