import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { toMoney } from "../lib/money.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { recalculateAccountBalance } from "../services/balanceService.js";
import { asyncHandler } from "../utils/http.js";

export const contactsRouter = Router();
contactsRouter.use(requireAuth);

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function parseYmd(s: string) {
  return new Date(`${s}T00:00:00Z`);
}

function mapContact(c: {
  id: string;
  name: string;
  kind: string;
  email: string | null;
  phone: string | null;
  tgstNumber: string | null;
  notes: string | null;
  createdAt: Date;
}) {
  return {
    id: c.id,
    name: c.name,
    kind: c.kind,
    email: c.email,
    phone: c.phone,
    tgst_number: c.tgstNumber,
    notes: c.notes,
    created_at: c.createdAt,
  };
}

const createSchema = z.object({
  name: z.string().min(1).max(200),
  kind: z.enum(["vendor", "customer", "other"]).optional(),
  email: z.string().email().max(320).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  tgst_number: z.string().max(64).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

const listContactsQuery = z.object({
  kind: z.preprocess((v) => (Array.isArray(v) ? v[0] : v), z.enum(["vendor", "customer", "other"]).optional()),
  search: z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : undefined),
    z.string().max(200).optional(),
  ),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

contactsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const q = listContactsQuery.parse(req.query);
    const kind = q.kind;
    const search = q.search;
    const usePaging = q.page != null || q.limit != null || (search != null && search.length > 0);

    const whereBase = {
      userId,
      ...(kind ? { kind } : {}),
      ...(search
        ? {
            name: { contains: search, mode: "insensitive" as const },
          }
        : {}),
    };

    if (!usePaging) {
      const rows = await prisma.contact.findMany({
        where: whereBase,
        orderBy: [{ name: "asc" }],
      });
      res.json(rows.map(mapContact));
      return;
    }

    const pageSize = q.limit ?? 25;
    const page = q.page ?? 1;
    const skip = (page - 1) * pageSize;

    const [total, rows] = await prisma.$transaction([
      prisma.contact.count({ where: whereBase }),
      prisma.contact.findMany({
        where: whereBase,
        orderBy: [{ name: "asc" }],
        skip,
        take: pageSize,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    res.json({
      items: rows.map(mapContact),
      total,
      page,
      page_size: pageSize,
      total_pages: totalPages,
    });
  }),
);

contactsRouter.get(
  "/:id/statement",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const id = z.string().uuid().parse(req.params.id);

    const contact = await prisma.contact.findFirst({ where: { id, userId } });
    if (!contact) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }

    const [incomes, expenses] = await Promise.all([
      prisma.incomeEntry.findMany({
        where: { userId, contactId: id, deletedAt: null, voidedAt: null },
        include: { account: true, category: true },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      }),
      prisma.expenseEntry.findMany({
        where: { userId, contactId: id, deletedAt: null, voidedAt: null },
        include: { account: true, debt: true, category: true },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      }),
    ]);

    type Line = {
      id: string;
      kind: "income" | "expense";
      date: string;
      description: string | null;
      amount: number;
      currency: string;
      via: string;
      category_name: string | null;
      pending_receivable?: boolean;
      pay_later?: boolean;
      bill_date?: string;
    };

    const lines: Line[] = [];

    for (const r of incomes) {
      const eff = r.receivedDate ?? r.date;
      const pendingReceivable = r.accountId == null;
      lines.push({
        id: r.id,
        kind: "income",
        date: ymd(eff),
        description: r.description,
        amount: toMoney(Number(r.amount)),
        currency: r.currency,
        via: r.account?.name ?? "Receivable",
        category_name: r.category?.name ?? null,
        ...(pendingReceivable ? { pending_receivable: true } : {}),
      });
    }

    for (const r of expenses) {
      const eff = r.paidDate ?? r.billDate;
      const ccy = r.payLater
        ? r.billCurrency.toUpperCase()
        : (r.account?.currency ?? r.debt?.currency ?? "USD").toUpperCase();
      let via = "—";
      if (r.payLater) via = "Pay later";
      else if (r.account) via = r.account.name;
      else if (r.debt) via = `Debt: ${r.debt.contactName}`;

      lines.push({
        id: r.id,
        kind: "expense",
        date: ymd(eff),
        description: r.description ?? r.merchant,
        amount: toMoney(Number(r.amount)),
        currency: ccy,
        via,
        category_name: r.category?.name ?? null,
        bill_date: ymd(r.billDate),
        pay_later: r.payLater,
      });
    }

    lines.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id)));

    res.json({
      contact: mapContact(contact),
      lines,
    });
  }),
);

const settleVendorExpensesSchema = z.object({
  expense_ids: z.array(z.string().uuid()).min(1).max(100),
  account_id: z.string().uuid(),
  paid_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Settle multiple pay-later expenses for this contact in one transaction (vendor bills). */
contactsRouter.post(
  "/:id/settle-expenses",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const contactId = z.string().uuid().parse(req.params.id);
    const body = settleVendorExpensesSchema.parse(req.body);

    const contact = await prisma.contact.findFirst({
      where: { id: contactId, userId },
    });
    if (!contact) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }

    const account = await prisma.account.findFirst({
      where: { id: body.account_id, userId },
    });
    if (!account) {
      res.status(400).json({ error: "Invalid account" });
      return;
    }

    const paidAt = parseYmd(body.paid_date);
    const uniqueIds = [...new Set(body.expense_ids)];

    const expenses = await prisma.expenseEntry.findMany({
      where: {
        id: { in: uniqueIds },
        userId,
        contactId,
        deletedAt: null,
        voidedAt: null,
        payLater: true,
      },
    });

    if (expenses.length !== uniqueIds.length) {
      res.status(400).json({
        error:
          "Some expenses were not found, are not unpaid pay-later bills, or are not linked to this vendor.",
      });
      return;
    }

    const first = expenses[0]!;
    const ccy = first.billCurrency.toUpperCase();
    if (!expenses.every((e) => e.billCurrency.toUpperCase() === ccy)) {
      res.status(400).json({ error: "Selected bills must all use the same currency." });
      return;
    }
    if (account.currency.toUpperCase() !== ccy) {
      res.status(400).json({
        error: `Account currency (${account.currency}) must match bill currency (${ccy}).`,
      });
      return;
    }

    await prisma.$transaction(async (tx) => {
      for (const e of expenses) {
        await tx.expenseEntry.update({
          where: { id: e.id },
          data: {
            payLater: false,
            accountId: body.account_id,
            debtId: null,
            paidDate: paidAt,
            date: paidAt,
          },
        });
      }
    });

    await recalculateAccountBalance(body.account_id);

    res.json({ settled: expenses.length });
  }),
);

const mergePayLaterSchema = z.object({
  expense_ids: z.array(z.string().uuid()).min(2).max(50),
});

/** Combine several pay-later vendor bills into one unpaid bill (same vendor & currency). */
contactsRouter.post(
  "/:id/merge-pay-later-bills",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const contactId = z.string().uuid().parse(req.params.id);
    const body = mergePayLaterSchema.parse(req.body);

    const contact = await prisma.contact.findFirst({
      where: { id: contactId, userId },
    });
    if (!contact) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }
    if (contact.kind !== "vendor") {
      res.status(400).json({ error: "Merge pay-later bills is only available for vendor contacts." });
      return;
    }

    const uniqueIds = [...new Set(body.expense_ids)];
    const expenses = await prisma.expenseEntry.findMany({
      where: {
        id: { in: uniqueIds },
        userId,
        contactId,
        deletedAt: null,
        voidedAt: null,
        payLater: true,
      },
    });

    if (expenses.length !== uniqueIds.length) {
      res.status(400).json({
        error:
          "Some expenses were not found, are not pay-later, or are not linked to this contact.",
      });
      return;
    }

    const first = expenses[0]!;
    const ccy = first.billCurrency.toUpperCase();
    if (!expenses.every((e) => e.billCurrency.toUpperCase() === ccy)) {
      res.status(400).json({ error: "Merged bills must share the same currency." });
      return;
    }

    const mergedAmount = toMoney(expenses.reduce((s, e) => s + Number(e.amount), 0));
    let maxBill = first.billDate;
    for (const e of expenses) {
      if (e.billDate > maxBill) maxBill = e.billDate;
    }
    const parts = expenses
      .map((e) => (e.description ?? e.merchant ?? "").trim())
      .filter(Boolean)
      .slice(0, 8);
    const description =
      parts.length > 0
        ? `Merged: ${parts.join(" · ")}`.slice(0, 2000)
        : `Merged ${expenses.length} pay-later bills`;
    const categoryId =
      expenses.find((e) => e.categoryId != null)?.categoryId ?? null;

    const newRow = await prisma.$transaction(async (tx) => {
      for (const e of expenses) {
        await tx.expenseSplit.deleteMany({ where: { expenseId: e.id } });
        await tx.expenseEntry.update({
          where: { id: e.id },
          data: { deletedAt: new Date() },
        });
      }
      return tx.expenseEntry.create({
        data: {
          userId,
          amount: mergedAmount,
          date: maxBill,
          billDate: maxBill,
          paidDate: null,
          payLater: true,
          billCurrency: ccy,
          contactId,
          categoryId,
          description,
          merchant: null,
          notes: `Merged ${expenses.length} pay-later entries for this vendor.`,
          tags: [],
        },
      });
    });

    res.status(201).json({ id: newRow.id });
  }),
);

contactsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const body = createSchema.parse(req.body);

    const row = await prisma.contact.create({
      data: {
        userId,
        name: body.name.trim(),
        kind: body.kind ?? "other",
        email: body.email ?? null,
        phone: body.phone?.trim() || null,
        tgstNumber: body.tgst_number?.trim() || null,
        notes: body.notes ?? null,
      },
    });

    res.status(201).json({ id: row.id });
  }),
);

const updateSchema = createSchema.partial();

contactsRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const id = z.string().uuid().parse(req.params.id);
    const body = updateSchema.parse(req.body);

    const existing = await prisma.contact.findFirst({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    await prisma.contact.update({
      where: { id },
      data: {
        name: body.name !== undefined ? body.name.trim() : undefined,
        kind: body.kind,
        email: body.email,
        phone: body.phone !== undefined ? (body.phone?.trim() || null) : undefined,
        tgstNumber:
          body.tgst_number !== undefined ? (body.tgst_number?.trim() || null) : undefined,
        notes: body.notes,
      },
    });

    res.json({ ok: true });
  }),
);

contactsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const id = z.string().uuid().parse(req.params.id);

    const existing = await prisma.contact.findFirst({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    await prisma.contact.delete({ where: { id } });
    res.status(204).send();
  }),
);
