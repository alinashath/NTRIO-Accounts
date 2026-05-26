import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { toMoney } from "../lib/money.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { recalculateAccountBalance } from "../services/balanceService.js";
import {
  accruedFromExpenses,
  nonVoidedPaidSum,
  refreshDebtSettlement,
} from "../services/debtService.js";
import { asyncHandler } from "../utils/http.js";

export const debtsRouter = Router();
debtsRouter.use(requireAuth);

debtsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const status = z
      .preprocess(
        (v) => (Array.isArray(v) ? v[0] : v),
        z.enum(["open", "settled"]).optional(),
      )
      .parse(req.query.status);

    const rows = await prisma.debt.findMany({
      where: { userId, ...(status ? { status } : {}) },
      include: { payments: true, contact: true },
      orderBy: { createdAt: "desc" },
    });

    const accGroups = await prisma.expenseEntry.groupBy({
      by: ["debtId"],
      where: {
        userId,
        debtId: { not: null },
        deletedAt: null,
        voidedAt: null,
      },
      _sum: { amount: true },
    });
    const accMap = new Map(
      accGroups
        .filter((g): g is typeof g & { debtId: string } => g.debtId != null)
        .map((g) => [g.debtId, toMoney(Number(g._sum.amount ?? 0))]),
    );

    res.json(
      rows.map((d) => {
        const paid = nonVoidedPaidSum(d.payments);
        const principal = toMoney(Number(d.principal));
        const accrued = accMap.get(d.id) ?? 0;
        const outstanding = toMoney(principal + accrued - paid);
        return {
          id: d.id,
          direction: d.direction,
          contact_name: d.contactName,
          contact_id: d.contactId,
          linked_contact_name: d.contact?.name ?? null,
          currency: d.currency,
          principal,
          interest_rate: toMoney(Number(d.interestRate)),
          due_date: d.dueDate,
          notes: d.notes,
          status: outstanding <= 0 ? ("settled" as const) : ("open" as const),
          total_paid: paid,
          charges_from_expenses: accrued,
          outstanding,
          created_at: d.createdAt,
        };
      }),
    );
  }),
);

debtsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const id = z.string().uuid().parse(req.params.id);

    const d = await prisma.debt.findFirst({
      where: { id, userId },
      include: {
        contact: true,
        payments: { include: { account: true }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] },
      },
    });
    if (!d) {
      res.status(404).json({ error: "Debt not found" });
      return;
    }

    await refreshDebtSettlement(id);

    const fresh = await prisma.debt.findFirstOrThrow({
      where: { id, userId },
      include: {
        contact: true,
        payments: { include: { account: true }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] },
      },
    });

    const paid = nonVoidedPaidSum(fresh.payments);
    const accrued = await accruedFromExpenses(id);
    const principal = toMoney(Number(fresh.principal));

    const charges = await prisma.expenseEntry.findMany({
      where: { debtId: id, userId, deletedAt: null, voidedAt: null },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: { category: true },
    });

    res.json({
      id: fresh.id,
      direction: fresh.direction,
      contact_name: fresh.contactName,
      contact_id: fresh.contactId,
      linked_contact_name: fresh.contact?.name ?? null,
      currency: fresh.currency,
      principal,
      interest_rate: toMoney(Number(fresh.interestRate)),
      due_date: fresh.dueDate,
      notes: fresh.notes,
      status: fresh.status,
      total_paid: paid,
      charges_from_expenses: accrued,
      outstanding: toMoney(principal + accrued - paid),
      created_at: fresh.createdAt,
      expense_charges: charges.map((c) => ({
        id: c.id,
        amount: toMoney(Number(c.amount)),
        date: c.date,
        description: c.description,
        merchant: c.merchant,
        category_name: c.category?.name ?? null,
      })),
      payments: fresh.payments.map((p) => ({
        id: p.id,
        debt_id: p.debtId,
        amount: toMoney(Number(p.amount)),
        account_amount: p.accountAmount != null ? toMoney(Number(p.accountAmount)) : null,
        exchange_rate: p.exchangeRate != null ? Number(p.exchangeRate) : null,
        account_currency: p.account.currency,
        date: p.date,
        notes: p.notes,
        account_id: p.accountId,
        account_name: p.account.name,
        attachment_url: p.attachmentUrl,
        voided_at: p.voidedAt,
        void_reason: p.voidReason,
        created_at: p.createdAt,
      })),
    });
  }),
);

const createDebtSchema = z.object({
  direction: z.enum(["i_owe", "owed_to_me"]),
  contact_name: z.string().optional(),
  contact_id: z.string().uuid().optional(),
  principal: z.number().positive(),
  currency: z.string().min(1).max(8).optional(),
  interest_rate: z.number().min(0).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().optional(),
});

debtsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const body = createDebtSchema.parse(req.body);

    let contactName = body.contact_name?.trim() ?? "";
    let contactId: string | null = body.contact_id ?? null;
    if (contactId) {
      const c = await prisma.contact.findFirst({ where: { id: contactId, userId } });
      if (!c) {
        res.status(400).json({ error: "Invalid contact" });
        return;
      }
      if (!contactName) contactName = c.name;
    }
    if (!contactName) {
      res.status(400).json({ error: "Contact name is required when no contact is linked." });
      return;
    }

    const row = await prisma.debt.create({
      data: {
        userId,
        direction: body.direction,
        contactName,
        contactId,
        principal: toMoney(body.principal),
        currency: body.currency ?? "USD",
        interestRate: toMoney(body.interest_rate ?? 0),
        dueDate: body.due_date ? new Date(`${body.due_date}T00:00:00Z`) : null,
        notes: body.notes ?? null,
      },
    });

    res.status(201).json({ id: row.id });
  }),
);

const mergeDebtsSchema = z.object({
  keep_debt_id: z.string().uuid(),
  merge_debt_ids: z.array(z.string().uuid()).min(1),
});

/** Move payments & expense charges into one debt, sum principals, delete the others. Same currency + direction required. */
debtsRouter.post(
  "/merge",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const body = mergeDebtsSchema.parse(req.body);
    const mergeSet = new Set(body.merge_debt_ids);
    if (mergeSet.has(body.keep_debt_id)) {
      res.status(400).json({ error: "keep_debt_id must not appear in merge_debt_ids." });
      return;
    }

    const allIds = [body.keep_debt_id, ...body.merge_debt_ids];
    const debts = await prisma.debt.findMany({
      where: { id: { in: allIds }, userId },
    });
    if (debts.length !== allIds.length) {
      res.status(400).json({ error: "One or more debts were not found." });
      return;
    }

    const keeper = debts.find((d) => d.id === body.keep_debt_id)!;
    const others = debts.filter((d) => d.id !== body.keep_debt_id);

    const dir = keeper.direction;
    const ccy = keeper.currency.toUpperCase();
    for (const d of others) {
      if (d.direction !== dir) {
        res.status(400).json({ error: "All merged debts must have the same direction (I owe vs owed to me)." });
        return;
      }
      if (d.currency.toUpperCase() !== ccy) {
        res.status(400).json({ error: "All merged debts must use the same currency." });
        return;
      }
    }

    const principalSum = toMoney(
      debts.reduce((s, d) => s + Number(d.principal), 0),
    );

    const mergeNoteLines = others.map(
      (d) => `${d.contactName} (${d.id.slice(0, 8)}…) principal ${toMoney(Number(d.principal))} ${d.currency}`,
    );
    const stamp = `\n[Merged ${new Date().toISOString().slice(0, 10)}] Combined: ${mergeNoteLines.join("; ")}.`;

    await prisma.$transaction(async (tx) => {
      for (const mid of body.merge_debt_ids) {
        await tx.debtPayment.updateMany({
          where: { debtId: mid },
          data: { debtId: body.keep_debt_id },
        });
        await tx.expenseEntry.updateMany({
          where: { userId, debtId: mid },
          data: { debtId: body.keep_debt_id },
        });
      }

      const nextNotes = [keeper.notes?.trim() || "", stamp.trim()].filter(Boolean).join("\n");

      await tx.debt.update({
        where: { id: body.keep_debt_id },
        data: {
          principal: principalSum,
          notes: nextNotes || null,
        },
      });

      await tx.debt.deleteMany({
        where: { id: { in: body.merge_debt_ids }, userId },
      });
    });

    const payAccounts = await prisma.debtPayment.findMany({
      where: { debtId: body.keep_debt_id, voidedAt: null },
      select: { accountId: true },
    });
    const accountIds = [...new Set(payAccounts.map((p) => p.accountId))];
    for (const accountId of accountIds) {
      await recalculateAccountBalance(accountId);
    }
    await refreshDebtSettlement(body.keep_debt_id);

    res.json({ ok: true, id: body.keep_debt_id });
  }),
);

const addPrincipalSchema = z.object({
  amount: z.number().positive(),
  note: z.string().max(500).optional(),
});

debtsRouter.post(
  "/:id/add-principal",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const id = z.string().uuid().parse(req.params.id);
    const body = addPrincipalSchema.parse(req.body);

    const debt = await prisma.debt.findFirst({ where: { id, userId } });
    if (!debt) {
      res.status(404).json({ error: "Debt not found" });
      return;
    }

    const nextPrincipal = toMoney(Number(debt.principal) + body.amount);
    const noteLine = body.note?.trim()
      ? `\n[Principal +${body.amount} ${debt.currency} ${new Date().toISOString().slice(0, 10)}] ${body.note.trim()}`
      : `\n[Principal +${body.amount} ${debt.currency} ${new Date().toISOString().slice(0, 10)}]`;

    await prisma.debt.update({
      where: { id },
      data: {
        principal: nextPrincipal,
        notes: [debt.notes?.trim() || "", noteLine].filter(Boolean).join("\n") || null,
      },
    });

    await refreshDebtSettlement(id);

    res.json({ ok: true, principal: nextPrincipal });
  }),
);

const updateDebtSchema = z.object({
  direction: z.enum(["i_owe", "owed_to_me"]).optional(),
  contact_name: z.string().optional(),
  contact_id: z.string().uuid().nullable().optional(),
  principal: z.number().positive().optional(),
  currency: z.string().min(1).max(8).optional(),
  interest_rate: z.number().min(0).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().optional().nullable(),
});

debtsRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const id = z.string().uuid().parse(req.params.id);
    const body = updateDebtSchema.parse(req.body);

    const existing = await prisma.debt.findFirst({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    let nextContactId: string | null | undefined = body.contact_id;
    if (body.contact_id !== undefined && body.contact_id !== null) {
      const c = await prisma.contact.findFirst({ where: { id: body.contact_id, userId } });
      if (!c) {
        res.status(400).json({ error: "Invalid contact" });
        return;
      }
    }

    let nextContactName = body.contact_name;
    if (nextContactId && (nextContactName === undefined || !String(nextContactName).trim())) {
      const c = await prisma.contact.findFirst({ where: { id: nextContactId, userId } });
      if (c) nextContactName = c.name;
    }

    await prisma.debt.update({
      where: { id },
      data: {
        direction: body.direction,
        contactName: nextContactName !== undefined ? String(nextContactName).trim() || existing.contactName : undefined,
        contactId: nextContactId === undefined ? undefined : nextContactId,
        principal: body.principal !== undefined ? toMoney(body.principal) : undefined,
        currency: body.currency,
        interestRate:
          body.interest_rate !== undefined ? toMoney(body.interest_rate) : undefined,
        dueDate:
          body.due_date === undefined
            ? undefined
            : body.due_date
              ? new Date(`${body.due_date}T00:00:00Z`)
              : null,
        notes: body.notes,
      },
    });

    await refreshDebtSettlement(id);

    res.json({ ok: true });
  }),
);

const paymentSchema = z.object({
  account_id: z.string().uuid(),
  /** Reduction toward the debt, in the debt's currency. */
  amount: z.number().positive(),
  /** When paying from an account in another currency, the cash debited from the account (account currency). */
  account_amount: z.number().positive().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional(),
  attachment_url: z.string().max(2048).optional().nullable(),
});

debtsRouter.post(
  "/:id/payments",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const debtId = z.string().uuid().parse(req.params.id);
    const body = paymentSchema.parse(req.body);

    const debt = await prisma.debt.findFirst({ where: { id: debtId, userId } });
    if (!debt) {
      res.status(404).json({ error: "Debt not found" });
      return;
    }

    const account = await prisma.account.findFirst({
      where: { id: body.account_id, userId },
    });
    if (!account) {
      res.status(400).json({ error: "Invalid account" });
      return;
    }

    const debtCcy = debt.currency.toUpperCase();
    const accCcy = account.currency.toUpperCase();
    const debtReduction = toMoney(body.amount);
    let accountAmount: number | null = null;
    let exchangeRate: number | null = null;

    if (debtCcy !== accCcy) {
      if (body.account_amount == null || body.account_amount <= 0) {
        res.status(400).json({
          error:
            "When the bank account currency differs from the debt currency, send account_amount (cash leaving the account in the account's currency). The amount field is how much debt is reduced, in the debt's currency.",
        });
        return;
      }
      accountAmount = toMoney(body.account_amount);
      exchangeRate = debtReduction / accountAmount;
    }

    const payment = await prisma.debtPayment.create({
      data: {
        debtId,
        accountId: body.account_id,
        amount: debtReduction,
        accountAmount,
        exchangeRate,
        date: new Date(`${body.date}T00:00:00Z`),
        notes: body.notes ?? null,
        attachmentUrl: body.attachment_url ?? null,
      },
    });

    await recalculateAccountBalance(body.account_id);
    await refreshDebtSettlement(debtId);

    res.status(201).json({ id: payment.id });
  }),
);

debtsRouter.get(
  "/:id/payments",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const debtId = z.string().uuid().parse(req.params.id);

    const debt = await prisma.debt.findFirst({ where: { id: debtId, userId } });
    if (!debt) {
      res.status(404).json({ error: "Debt not found" });
      return;
    }

    const rows = await prisma.debtPayment.findMany({
      where: { debtId },
      include: { account: true },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });

    res.json(
      rows.map((p) => ({
        id: p.id,
        debt_id: p.debtId,
        amount: toMoney(Number(p.amount)),
        account_amount: p.accountAmount != null ? toMoney(Number(p.accountAmount)) : null,
        exchange_rate: p.exchangeRate != null ? Number(p.exchangeRate) : null,
        account_currency: p.account.currency,
        date: p.date,
        notes: p.notes,
        account_id: p.accountId,
        account_name: p.account.name,
        attachment_url: p.attachmentUrl,
        voided_at: p.voidedAt,
        void_reason: p.voidReason,
        created_at: p.createdAt,
      })),
    );
  }),
);

const updatePaymentSchema = z.object({
  notes: z.string().optional().nullable(),
  attachment_url: z.string().max(2048).optional().nullable(),
});

debtsRouter.put(
  "/:id/payments/:paymentId",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const debtId = z.string().uuid().parse(req.params.id);
    const paymentId = z.string().uuid().parse(req.params.paymentId);
    const body = updatePaymentSchema.parse(req.body);

    const debt = await prisma.debt.findFirst({ where: { id: debtId, userId } });
    if (!debt) {
      res.status(404).json({ error: "Debt not found" });
      return;
    }

    const payment = await prisma.debtPayment.findFirst({
      where: { id: paymentId, debtId },
    });
    if (!payment) {
      res.status(404).json({ error: "Payment not found" });
      return;
    }

    await prisma.debtPayment.update({
      where: { id: paymentId },
      data: {
        notes: body.notes === undefined ? undefined : body.notes,
        attachmentUrl: body.attachment_url === undefined ? undefined : body.attachment_url,
      },
    });

    res.json({ ok: true });
  }),
);

const voidPaymentSchema = z.object({
  reason: z.string().max(500).optional(),
});

debtsRouter.post(
  "/:id/payments/:paymentId/void",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const debtId = z.string().uuid().parse(req.params.id);
    const paymentId = z.string().uuid().parse(req.params.paymentId);
    const body = voidPaymentSchema.parse(req.body ?? {});

    const debt = await prisma.debt.findFirst({ where: { id: debtId, userId } });
    if (!debt) {
      res.status(404).json({ error: "Debt not found" });
      return;
    }

    const payment = await prisma.debtPayment.findFirst({
      where: { id: paymentId, debtId },
    });
    if (!payment) {
      res.status(404).json({ error: "Payment not found" });
      return;
    }
    if (payment.voidedAt) {
      res.status(400).json({ error: "Payment already voided" });
      return;
    }

    await prisma.debtPayment.update({
      where: { id: paymentId },
      data: {
        voidedAt: new Date(),
        voidReason: body.reason?.trim() || null,
      },
    });

    await recalculateAccountBalance(payment.accountId);
    await refreshDebtSettlement(debtId);

    res.json({ ok: true });
  }),
);

debtsRouter.post(
  "/:id/payments/:paymentId/unvoid",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const debtId = z.string().uuid().parse(req.params.id);
    const paymentId = z.string().uuid().parse(req.params.paymentId);

    const debt = await prisma.debt.findFirst({ where: { id: debtId, userId } });
    if (!debt) {
      res.status(404).json({ error: "Debt not found" });
      return;
    }

    const payment = await prisma.debtPayment.findFirst({
      where: { id: paymentId, debtId },
    });
    if (!payment) {
      res.status(404).json({ error: "Payment not found" });
      return;
    }
    if (!payment.voidedAt) {
      res.status(400).json({ error: "Payment is not voided" });
      return;
    }

    await prisma.debtPayment.update({
      where: { id: paymentId },
      data: { voidedAt: null, voidReason: null },
    });

    await recalculateAccountBalance(payment.accountId);
    await refreshDebtSettlement(debtId);

    res.json({ ok: true });
  }),
);
