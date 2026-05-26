import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { toMoney } from "../lib/money.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { recalculateAccountBalance } from "../services/balanceService.js";
import { refreshDebtSettlement } from "../services/debtService.js";
import { asyncHandler } from "../utils/http.js";

export const expensesRouter = Router();
expensesRouter.use(requireAuth);

function statusFromQuery(q: unknown) {
  return (
    z
      .preprocess(
        (v) => (Array.isArray(v) ? v[0] : v),
        z.enum(["active", "voided", "all"]).optional(),
      )
      .parse(q) ?? "active"
  );
}

function voidClause(status: "active" | "voided" | "all") {
  if (status === "voided") return { voidedAt: { not: null } as const };
  if (status === "all") return {};
  return { voidedAt: null };
}

function parseYmd(s: string) {
  return new Date(`${s}T00:00:00Z`);
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Match list range on bill date or paid date (either in range). */
function expenseListDateFilter(from?: string, to?: string) {
  if (!from && !to) return {};
  const range = {
    ...(from ? { gte: new Date(`${from}T00:00:00Z`) } : {}),
    ...(to ? { lte: new Date(`${to}T00:00:00Z`) } : {}),
  };
  return {
    OR: [{ billDate: range }, { paidDate: range }],
  };
}

const listQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  category_id: z.string().uuid().optional(),
  account_id: z.string().uuid().optional(),
  search: z.preprocess(
    (v) => (typeof v === "string" ? (v.trim() === "" ? undefined : v.trim()) : undefined),
    z.string().max(200).optional(),
  ),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  settlement: z.enum(["all", "account", "debt", "pay_later"]).optional(),
});

const expenseInclude = { category: true, account: true, debt: true, splits: true, contact: true } as const;

async function loadExpenseListRow(userId: string, id: string) {
  const row = await prisma.expenseEntry.findFirst({
    where: { id, userId, deletedAt: null },
    include: expenseInclude,
  });
  if (!row) return null;
  return mapExpenseListRow(row);
}

function settlementClause(t: "all" | "account" | "debt" | "pay_later") {
  if (t === "account") {
    return { payLater: false, debtId: null, accountId: { not: null } as const };
  }
  if (t === "debt") return { debtId: { not: null } as const };
  if (t === "pay_later") return { payLater: true as const };
  return {};
}

function mapExpenseListRow(r: {
  id: string;
  amount: unknown;
  date: Date;
  billDate: Date;
  paidDate: Date | null;
  description: string | null;
  categoryId: string | null;
  category: { name: string } | null;
  accountId: string | null;
  account: { name: string; currency: string } | null;
  payLater: boolean;
  billCurrency: string;
  debtId: string | null;
  debt: { contactName: string; currency: string } | null;
  contactId: string | null;
  contact: { name: string } | null;
  merchant: string | null;
  notes: string | null;
  tags: string[];
  attachmentUrl: string | null;
  voidedAt: Date | null;
  voidReason: string | null;
  recurringId: string | null;
  splits: Array<{
    id: string;
    categoryId: string;
    amount: unknown;
    percentage: unknown | null;
  }>;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: r.id,
    amount: toMoney(Number(r.amount)),
    date: ymd(r.date),
    bill_date: ymd(r.billDate),
    paid_date: r.paidDate ? ymd(r.paidDate) : null,
    description: r.description,
    category_id: r.categoryId,
    category_name: r.category?.name ?? null,
    account_id: r.accountId,
    account_name: r.payLater
      ? "Pay later"
      : (r.account?.name ?? (r.debt ? `Credit: ${r.debt.contactName}` : "—")),
    account_currency: r.payLater
      ? r.billCurrency
      : (r.account?.currency ?? r.debt?.currency ?? "USD"),
    debt_id: r.debtId,
    contact_id: r.contactId,
    contact_name: r.contact?.name ?? null,
    merchant: r.merchant,
    notes: r.notes,
    tags: r.tags,
    attachment_url: r.attachmentUrl,
    voided_at: r.voidedAt,
    void_reason: r.voidReason,
    recurring_id: r.recurringId,
    pay_later: r.payLater,
    bill_currency: r.billCurrency,
    splits: r.splits.map((s) => ({
      id: s.id,
      category_id: s.categoryId,
      amount: toMoney(Number(s.amount)),
      percentage: s.percentage != null ? toMoney(Number(s.percentage)) : null,
    })),
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  };
}

expensesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const q = listQuery.parse(req.query);
    const status = statusFromQuery(req.query.status);
    const settlement = q.settlement ?? "all";

    const dateFilter = expenseListDateFilter(q.from, q.to);

    const search = q.search;
    const searchClause = search
      ? {
          OR: [
            { description: { contains: search, mode: "insensitive" as const } },
            { notes: { contains: search, mode: "insensitive" as const } },
            { merchant: { contains: search, mode: "insensitive" as const } },
            { contact: { name: { contains: search, mode: "insensitive" as const } } },
            { category: { name: { contains: search, mode: "insensitive" as const } } },
            { debt: { contactName: { contains: search, mode: "insensitive" as const } } },
          ],
        }
      : {};

    const whereBase = {
      userId,
      deletedAt: null,
      ...voidClause(status),
      ...dateFilter,
      ...(q.category_id ? { categoryId: q.category_id } : {}),
      ...(q.account_id ? { accountId: q.account_id } : {}),
      ...settlementClause(settlement),
      ...searchClause,
    };

    const orderBy = [{ date: "desc" as const }, { createdAt: "desc" as const }];

    const usePaging = q.limit != null;
    if (usePaging) {
      const pageSize = q.limit!;
      const page = q.page ?? 1;
      const skip = (page - 1) * pageSize;

      const [total, rows] = await prisma.$transaction([
        prisma.expenseEntry.count({ where: whereBase }),
        prisma.expenseEntry.findMany({
          where: whereBase,
          include: expenseInclude,
          orderBy,
          skip,
          take: pageSize,
        }),
      ]);

      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      res.json({
        items: rows.map(mapExpenseListRow),
        total,
        page,
        page_size: pageSize,
        total_pages: totalPages,
      });
      return;
    }

    const rows = await prisma.expenseEntry.findMany({
      where: whereBase,
      include: expenseInclude,
      orderBy,
    });

    res.json(rows.map(mapExpenseListRow));
  }));

const splitSchema = z.object({
  category_id: z.string().uuid(),
  amount: z.number().positive(),
  percentage: z.number().optional(),
});

const createSchema = z
  .object({
    amount: z.number().positive(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    bill_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    paid_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    description: z.string().optional(),
    category_id: z.string().uuid().optional(),
    account_id: z.string().uuid().optional(),
    debt_id: z.string().uuid().optional(),
    pay_later: z.boolean().optional(),
    bill_currency: z.string().min(1).max(8).optional(),
    contact_id: z.string().uuid().optional(),
    merchant: z.string().optional(),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
    attachment_url: z.string().max(2048).optional().nullable(),
    recurring_id: z.string().uuid().optional(),
    splits: z.array(splitSchema).optional(),
  })
  .refine(
    (b) => {
      if (b.pay_later) return !b.account_id && !b.debt_id;
      return (!!b.account_id && !b.debt_id) || (!b.account_id && !!b.debt_id);
    },
    {
      message:
        "Pay later: leave account and debt unset. Otherwise set exactly one of account_id (paid from account) or debt_id (charge to an I-owe debt).",
    },
  )
  .superRefine((b, ctx) => {
    if (!b.date && !b.bill_date) {
      ctx.addIssue({ code: "custom", message: "Provide date or bill_date." });
    }
  });

expensesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const body = createSchema.parse(req.body);

    if (body.account_id) {
      const account = await prisma.account.findFirst({
        where: { id: body.account_id, userId },
      });
      if (!account) {
        res.status(400).json({ error: "Invalid account" });
        return;
      }
    }

    if (body.debt_id) {
      const debt = await prisma.debt.findFirst({
        where: { id: body.debt_id, userId, direction: "i_owe" },
      });
      if (!debt) {
        res.status(400).json({
          error: "Invalid debt — only an open 'I owe' debt can be charged from Spend without a bank account.",
        });
        return;
      }
    }

    if (body.category_id) {
      const cat = await prisma.category.findFirst({
        where: { id: body.category_id, userId, type: "expense" },
      });
      if (!cat) {
        res.status(400).json({ error: "Invalid expense category" });
        return;
      }
    }

    if (body.contact_id) {
      const c = await prisma.contact.findFirst({
        where: { id: body.contact_id, userId },
      });
      if (!c) {
        res.status(400).json({ error: "Invalid contact" });
        return;
      }
    }

    if (body.splits?.length) {
      const sum = toMoney(body.splits.reduce((a, s) => a + s.amount, 0));
      if (sum !== toMoney(body.amount)) {
        res.status(400).json({ error: "Split amounts must equal expense amount" });
        return;
      }
      for (const s of body.splits) {
        const cat = await prisma.category.findFirst({
          where: { id: s.category_id, userId, type: "expense" },
        });
        if (!cat) {
          res.status(400).json({ error: "Invalid split category" });
          return;
        }
      }
    }

    const payLater = body.pay_later ?? false;
    const billDate = parseYmd(body.bill_date ?? body.date!);
    const paidDate = payLater ? null : parseYmd(body.paid_date ?? body.date ?? body.bill_date!);
    const legacyDate = paidDate ?? billDate;

    const row = await prisma.$transaction(async (tx) => {
      const expense = await tx.expenseEntry.create({
        data: {
          userId,
          amount: toMoney(body.amount),
          date: legacyDate,
          billDate,
          paidDate,
          description: body.description ?? null,
          categoryId: body.category_id ?? null,
          accountId: body.account_id ?? null,
          debtId: body.debt_id ?? null,
          payLater: body.pay_later ?? false,
          billCurrency: (body.bill_currency ?? "USD").toUpperCase(),
          contactId: body.contact_id ?? null,
          merchant: body.merchant ?? null,
          notes: body.notes ?? null,
          tags: body.tags ?? [],
          attachmentUrl: body.attachment_url ?? null,
          recurringId: body.recurring_id ?? null,
        },
      });

      if (body.splits?.length) {
        await tx.expenseSplit.createMany({
          data: body.splits.map((s) => ({
            expenseId: expense.id,
            categoryId: s.category_id,
            amount: toMoney(s.amount),
            percentage: s.percentage != null ? toMoney(s.percentage) : null,
          })),
        });
      }

      return expense;
    });

    if (body.account_id) {
      await recalculateAccountBalance(body.account_id);
    }
    if (body.debt_id) {
      await refreshDebtSettlement(body.debt_id);
    }

    res.status(201).json({ id: row.id });
  }),
);

const updateSchema = z.object({
  amount: z.number().positive().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  bill_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  paid_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  description: z.string().optional(),
  category_id: z.string().uuid().nullable().optional(),
  account_id: z.string().uuid().nullable().optional(),
  debt_id: z.string().uuid().nullable().optional(),
  pay_later: z.boolean().optional(),
  bill_currency: z.string().min(1).max(8).optional(),
  contact_id: z.string().uuid().nullable().optional(),
  merchant: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  attachment_url: z.string().max(2048).nullable().optional(),
  recurring_id: z.string().uuid().optional(),
  splits: z.array(splitSchema).optional(),
});

expensesRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const id = z.string().uuid().parse(req.params.id);
    const body = updateSchema.parse(req.body);

    const existing = await prisma.expenseEntry.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    if (existing.voidedAt) {
      res.status(400).json({ error: "Cannot edit a voided entry — unvoid it first" });
      return;
    }

    const nextDebtId = body.debt_id !== undefined ? body.debt_id : existing.debtId;
    const nextAccountId = body.account_id !== undefined ? body.account_id : existing.accountId;
    let nextPayLater = body.pay_later !== undefined ? body.pay_later : existing.payLater;
    if (nextAccountId || nextDebtId) nextPayLater = false;

    if (nextPayLater) {
      if (nextAccountId || nextDebtId) {
        res.status(400).json({
          error: "Pay later expenses cannot have an account or debt until you settle them.",
        });
        return;
      }
    } else if (!!nextAccountId === !!nextDebtId) {
      res.status(400).json({
        error:
          "Expense must settle from exactly one target: a bank/cash account, an I-owe debt, or use pay_later with neither.",
      });
      return;
    }

    if (nextAccountId) {
      const acc = await prisma.account.findFirst({
        where: { id: nextAccountId, userId },
      });
      if (!acc) {
        res.status(400).json({ error: "Invalid account" });
        return;
      }
    }

    if (nextDebtId) {
      const debt = await prisma.debt.findFirst({
        where: { id: nextDebtId, userId, direction: "i_owe" },
      });
      if (!debt) {
        res.status(400).json({ error: "Invalid debt for a card charge — use an I-owe debt." });
        return;
      }
    }

    if (body.category_id) {
      const cat = await prisma.category.findFirst({
        where: { id: body.category_id, userId, type: "expense" },
      });
      if (!cat) {
        res.status(400).json({ error: "Invalid expense category" });
        return;
      }
    }

    if (body.contact_id) {
      const c = await prisma.contact.findFirst({
        where: { id: body.contact_id, userId },
      });
      if (!c) {
        res.status(400).json({ error: "Invalid contact" });
        return;
      }
    }

    if (body.splits?.length) {
      const baseAmount = body.amount !== undefined ? body.amount : Number(existing.amount);
      const sum = toMoney(body.splits.reduce((a, s) => a + s.amount, 0));
      if (sum !== toMoney(baseAmount)) {
        res.status(400).json({ error: "Split amounts must equal expense amount" });
        return;
      }
    }

    let billDate = existing.billDate;
    let paidDate = existing.paidDate;
    if (body.bill_date !== undefined) billDate = parseYmd(body.bill_date);
    if (body.paid_date !== undefined) {
      paidDate = body.paid_date === null ? null : parseYmd(body.paid_date);
    }
    if (body.date !== undefined && body.bill_date === undefined && body.paid_date === undefined) {
      billDate = parseYmd(body.date);
      if (!nextPayLater) paidDate = parseYmd(body.date);
    }
    if (nextPayLater) {
      paidDate = null;
    } else if (!paidDate && (nextAccountId || nextDebtId)) {
      paidDate = billDate;
    }
    const legacyDate = paidDate ?? billDate;

    await prisma.$transaction(async (tx) => {
      await tx.expenseSplit.deleteMany({ where: { expenseId: id } });

      await tx.expenseEntry.update({
        where: { id },
        data: {
          amount: body.amount !== undefined ? toMoney(body.amount) : undefined,
          date: legacyDate,
          billDate,
          paidDate,
          description: body.description,
          categoryId: body.category_id === undefined ? undefined : body.category_id,
          accountId: body.account_id === undefined ? undefined : body.account_id,
          debtId: body.debt_id === undefined ? undefined : body.debt_id,
          payLater: nextPayLater,
          billCurrency:
            body.bill_currency === undefined ? undefined : body.bill_currency.toUpperCase(),
          contactId: body.contact_id === undefined ? undefined : body.contact_id,
          merchant: body.merchant,
          notes: body.notes,
          tags: body.tags,
          attachmentUrl: body.attachment_url === undefined ? undefined : body.attachment_url,
          recurringId: body.recurring_id,
        },
      });

      if (body.splits?.length) {
        await tx.expenseSplit.createMany({
          data: body.splits.map((s) => ({
            expenseId: id,
            categoryId: s.category_id,
            amount: toMoney(s.amount),
            percentage: s.percentage != null ? toMoney(s.percentage) : null,
          })),
        });
      }
    });

    const accIds = new Set<string>();
    if (existing.accountId) accIds.add(existing.accountId);
    if (nextAccountId) accIds.add(nextAccountId);
    for (const aid of accIds) {
      await recalculateAccountBalance(aid);
    }
    const debtIds = new Set<string>();
    if (existing.debtId) debtIds.add(existing.debtId);
    if (nextDebtId) debtIds.add(nextDebtId);
    for (const did of debtIds) {
      await refreshDebtSettlement(did);
    }

    const row = await loadExpenseListRow(userId, id);
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ row });
  }),
);

const voidSchema = z.object({
  reason: z.string().max(500).optional(),
});

expensesRouter.post(
  "/:id/void",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const id = z.string().uuid().parse(req.params.id);
    const body = voidSchema.parse(req.body ?? {});

    const existing = await prisma.expenseEntry.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (existing.voidedAt) {
      res.status(400).json({ error: "Already voided" });
      return;
    }

    await prisma.expenseEntry.update({
      where: { id },
      data: {
        voidedAt: new Date(),
        voidReason: body.reason?.trim() || null,
      },
    });

    if (existing.accountId) {
      await recalculateAccountBalance(existing.accountId);
    }
    if (existing.debtId) {
      await refreshDebtSettlement(existing.debtId);
    }
    const row = await loadExpenseListRow(userId, id);
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ row });
  }),
);

expensesRouter.post(
  "/:id/unvoid",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const id = z.string().uuid().parse(req.params.id);

    const existing = await prisma.expenseEntry.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (!existing.voidedAt) {
      res.status(400).json({ error: "Not voided" });
      return;
    }

    await prisma.expenseEntry.update({
      where: { id },
      data: { voidedAt: null, voidReason: null },
    });

    if (existing.accountId) {
      await recalculateAccountBalance(existing.accountId);
    }
    if (existing.debtId) {
      await refreshDebtSettlement(existing.debtId);
    }
    const row = await loadExpenseListRow(userId, id);
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ row });
  }),
);

expensesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const id = z.string().uuid().parse(req.params.id);

    const existing = await prisma.expenseEntry.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    await prisma.$transaction([
      prisma.expenseSplit.deleteMany({ where: { expenseId: id } }),
      prisma.expenseEntry.update({
        where: { id },
        data: { deletedAt: new Date() },
      }),
    ]);

    if (existing.accountId) {
      await recalculateAccountBalance(existing.accountId);
    }
    if (existing.debtId) {
      await refreshDebtSettlement(existing.debtId);
    }
    res.status(204).send();
  }),
);
