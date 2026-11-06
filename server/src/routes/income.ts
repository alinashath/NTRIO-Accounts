import { Router } from "express";
import { z } from "zod";
import { parseProjectScope, projectWhereClause } from "../lib/projectFilter.js";
import { prisma } from "../lib/prisma.js";
import { toMoney } from "../lib/money.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { scopeOrganizationData } from "../middleware/orgScope.js";
import { recalculateAccountBalance } from "../services/balanceService.js";
import { asyncHandler } from "../utils/http.js";

export const incomeRouter = Router();
incomeRouter.use(requireAuth);
incomeRouter.use(scopeOrganizationData);

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

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function parseYmd(s: string) {
  return new Date(`${s}T00:00:00Z`);
}

const listQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  category_id: z.string().uuid().optional(),
  account_id: z.string().uuid().optional(),
  pending_receivable: z.preprocess(
    (v) => (v === undefined || v === "" || v === false || v === "false" ? undefined : v === true || v === "true" || v === "1"),
    z.boolean().optional(),
  ),
  search: z.preprocess(
    (v) => (typeof v === "string" ? (v.trim() === "" ? undefined : v.trim()) : undefined),
    z.string().max(200).optional(),
  ),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  income_type: z.enum(["all", "uncategorized"]).optional(),
});

const incomeInclude = { category: true, project: true, account: true, contact: true } as const;

async function loadIncomeListRow(userId: string, id: string) {
  const row = await prisma.incomeEntry.findFirst({
    where: { id, userId, deletedAt: null },
    include: incomeInclude,
  });
  if (!row) return null;
  return mapIncomeListRow(row);
}

function mapIncomeListRow(r: {
  id: string;
  amount: unknown;
  date: Date;
  receivedDate: Date | null;
  currency: string;
  description: string | null;
  categoryId: string | null;
  category: { name: string } | null;
  projectId: string | null;
  project: { name: string } | null;
  accountId: string | null;
  account: { name: string; currency: string } | null;
  contactId: string | null;
  contact: { name: string } | null;
  source: string | null;
  notes: string | null;
  tags: string[];
  attachmentUrl: string | null;
  invoiceNumber: string | null;
  gstRate: unknown | null;
  gstSubtotal: unknown | null;
  gstAmount: unknown | null;
  zeroRatedAmount: unknown | null;
  greenTaxAmount: unknown | null;
  greenTaxCheckIn: Date | null;
  greenTaxCheckOut: Date | null;
  greenTaxFormUrl: string | null;
  greenTaxGuests: unknown;
  voidedAt: Date | null;
  voidReason: string | null;
  recurringId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const pending = r.accountId == null;
  return {
    id: r.id,
    amount: toMoney(Number(r.amount)),
    date: ymd(r.date),
    received_date: r.receivedDate ? ymd(r.receivedDate) : null,
    currency: r.currency,
    pending_receivable: pending,
    description: r.description,
    category_id: r.categoryId,
    category_name: r.category?.name ?? null,
    project_id: r.projectId,
    project_name: r.project?.name ?? null,
    account_id: r.accountId,
    account_name: r.account?.name ?? "Receivable",
    account_currency: r.account?.currency ?? r.currency,
    contact_id: r.contactId,
    contact_name: r.contact?.name ?? null,
    source: r.source,
    notes: r.notes,
    tags: r.tags,
    attachment_url: r.attachmentUrl,
    invoice_number: r.invoiceNumber,
    gst_rate: r.gstRate != null ? toMoney(Number(r.gstRate)) : null,
    gst_subtotal: r.gstSubtotal != null ? toMoney(Number(r.gstSubtotal)) : null,
    gst_amount: r.gstAmount != null ? toMoney(Number(r.gstAmount)) : null,
    zero_rated_amount: r.zeroRatedAmount != null ? toMoney(Number(r.zeroRatedAmount)) : null,
    green_tax_amount: r.greenTaxAmount != null ? toMoney(Number(r.greenTaxAmount)) : null,
    green_tax_check_in: r.greenTaxCheckIn ? r.greenTaxCheckIn.toISOString() : null,
    green_tax_check_out: r.greenTaxCheckOut ? r.greenTaxCheckOut.toISOString() : null,
    green_tax_form_url: r.greenTaxFormUrl,
    green_tax_guests: parseGreenTaxGuests(r.greenTaxGuests),
    voided_at: r.voidedAt,
    void_reason: r.voidReason,
    recurring_id: r.recurringId,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  };
}

function incomeListDateClause(from?: string, to?: string) {
  if (!from && !to) return {};
  const range = {
    ...(from ? { gte: new Date(`${from}T00:00:00Z`) } : {}),
    ...(to ? { lte: new Date(`${to}T00:00:00Z`) } : {}),
  };
  return {
    OR: [{ date: range }, { receivedDate: range }],
  };
}

incomeRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const q = listQuery.parse(req.query);
    const status = statusFromQuery(req.query.status);
    const projectScope = parseProjectScope(req.query);

    const search = q.search;
    const searchClause = search
      ? {
          OR: [
            { description: { contains: search, mode: "insensitive" as const } },
            { notes: { contains: search, mode: "insensitive" as const } },
            { source: { contains: search, mode: "insensitive" as const } },
            { contact: { name: { contains: search, mode: "insensitive" as const } } },
            { category: { name: { contains: search, mode: "insensitive" as const } } },
          ],
        }
      : {};

    const typeClause =
      q.income_type === "uncategorized" ? { categoryId: null } : {};

    const pendingClause = q.pending_receivable ? { accountId: null } : {};

    const whereBase = {
      userId,
      deletedAt: null,
      ...voidClause(status),
      ...incomeListDateClause(q.from, q.to),
      ...(q.category_id ? { categoryId: q.category_id } : {}),
      ...(q.account_id ? { accountId: q.account_id } : {}),
      ...projectWhereClause(projectScope),
      ...pendingClause,
      ...searchClause,
      ...typeClause,
    };

    const orderBy = [{ date: "desc" as const }, { createdAt: "desc" as const }];

    const usePaging = q.limit != null;
    if (usePaging) {
      const pageSize = q.limit!;
      const page = q.page ?? 1;
      const skip = (page - 1) * pageSize;

      const [total, rows] = await prisma.$transaction([
        prisma.incomeEntry.count({ where: whereBase }),
        prisma.incomeEntry.findMany({
          where: whereBase,
          include: incomeInclude,
          orderBy,
          skip,
          take: pageSize,
        }),
      ]);

      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      res.json({
        items: rows.map(mapIncomeListRow),
        total,
        page,
        page_size: pageSize,
        total_pages: totalPages,
      });
      return;
    }

    const rows = await prisma.incomeEntry.findMany({
      where: whereBase,
      include: incomeInclude,
      orderBy,
    });

    res.json(rows.map(mapIncomeListRow));
  }),
);

const greenTaxGuestSchema = z.object({
  guest_reg_no: z.string().max(64).optional().nullable(),
  name: z.string().trim().min(1).max(160),
  category: z.enum(["1", "2", "3"]).default("1"),
  identification_no: z.string().max(64).optional().nullable(),
  nationality: z.string().trim().min(1).max(80),
  booking_method: z.string().max(64).optional().nullable(),
});

const gstInvoiceFields = {
  invoice_number: z.string().max(64).optional().nullable(),
  gst_rate: z.number().min(0).max(100).optional().nullable(),
  gst_subtotal: z.number().min(0).optional().nullable(),
  gst_amount: z.number().min(0).optional().nullable(),
  zero_rated_amount: z.number().min(0).optional().nullable(),
  green_tax_amount: z.number().min(0).optional().nullable(),
  green_tax_check_in: z.string().max(64).optional().nullable(),
  green_tax_check_out: z.string().max(64).optional().nullable(),
  green_tax_form_url: z.string().max(2048).optional().nullable(),
  green_tax_guests: z.array(greenTaxGuestSchema).max(100).optional().nullable(),
};

type GreenTaxGuestRow = {
  guest_reg_no: string | null;
  name: string;
  category: "1" | "2" | "3";
  identification_no: string | null;
  nationality: string;
  booking_method: string | null;
};

/** Zod request shape (optional fields may be undefined). */
type GreenTaxGuestInput = z.infer<typeof greenTaxGuestSchema>;

function parseOptionalDateTime(raw: string | null | undefined): Date | null {
  if (raw == null || !String(raw).trim()) return null;
  const d = new Date(String(raw).trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseGreenTaxGuests(raw: unknown): GreenTaxGuestRow[] {
  if (!Array.isArray(raw)) return [];
  const out: GreenTaxGuestRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const name = String(row.name ?? "").trim();
    const nationality = String(row.nationality ?? "").trim();
    if (!name || !nationality) continue;
    const cat = String(row.category ?? "1");
    const category = cat === "2" || cat === "3" ? cat : "1";
    out.push({
      guest_reg_no: String(row.guest_reg_no ?? "").trim() || null,
      name,
      category,
      identification_no: String(row.identification_no ?? "").trim() || null,
      nationality,
      booking_method: String(row.booking_method ?? "").trim() || null,
    });
  }
  return out;
}

function normalizeGreenTaxGuests(
  raw: GreenTaxGuestInput[] | null | undefined,
): GreenTaxGuestRow[] {
  if (raw == null) return [];
  return parseGreenTaxGuests(raw);
}

function gstCreateData(body: {
  invoice_number?: string | null;
  gst_rate?: number | null;
  gst_subtotal?: number | null;
  gst_amount?: number | null;
  zero_rated_amount?: number | null;
  green_tax_amount?: number | null;
  green_tax_check_in?: string | null;
  green_tax_check_out?: string | null;
  green_tax_form_url?: string | null;
  green_tax_guests?: GreenTaxGuestInput[] | null;
}) {
  return {
    invoiceNumber: body.invoice_number?.trim() || null,
    gstRate: body.gst_rate != null ? toMoney(body.gst_rate) : null,
    gstSubtotal: body.gst_subtotal != null ? toMoney(body.gst_subtotal) : null,
    gstAmount: body.gst_amount != null ? toMoney(body.gst_amount) : null,
    zeroRatedAmount: body.zero_rated_amount != null ? toMoney(body.zero_rated_amount) : null,
    greenTaxAmount: body.green_tax_amount != null ? toMoney(body.green_tax_amount) : null,
    greenTaxCheckIn: parseOptionalDateTime(body.green_tax_check_in),
    greenTaxCheckOut: parseOptionalDateTime(body.green_tax_check_out),
    greenTaxFormUrl: body.green_tax_form_url?.trim() || null,
    greenTaxGuests: normalizeGreenTaxGuests(body.green_tax_guests),
  };
}

function gstUpdateData(body: {
  invoice_number?: string | null;
  gst_rate?: number | null;
  gst_subtotal?: number | null;
  gst_amount?: number | null;
  zero_rated_amount?: number | null;
  green_tax_amount?: number | null;
  green_tax_check_in?: string | null;
  green_tax_check_out?: string | null;
  green_tax_form_url?: string | null;
  green_tax_guests?: GreenTaxGuestInput[] | null;
}) {
  return {
    invoiceNumber:
      body.invoice_number === undefined ? undefined : body.invoice_number?.trim() || null,
    gstRate: body.gst_rate === undefined ? undefined : body.gst_rate == null ? null : toMoney(body.gst_rate),
    gstSubtotal:
      body.gst_subtotal === undefined
        ? undefined
        : body.gst_subtotal == null
          ? null
          : toMoney(body.gst_subtotal),
    gstAmount:
      body.gst_amount === undefined ? undefined : body.gst_amount == null ? null : toMoney(body.gst_amount),
    zeroRatedAmount:
      body.zero_rated_amount === undefined
        ? undefined
        : body.zero_rated_amount == null
          ? null
          : toMoney(body.zero_rated_amount),
    greenTaxAmount:
      body.green_tax_amount === undefined
        ? undefined
        : body.green_tax_amount == null
          ? null
          : toMoney(body.green_tax_amount),
    greenTaxCheckIn:
      body.green_tax_check_in === undefined
        ? undefined
        : parseOptionalDateTime(body.green_tax_check_in),
    greenTaxCheckOut:
      body.green_tax_check_out === undefined
        ? undefined
        : parseOptionalDateTime(body.green_tax_check_out),
    greenTaxFormUrl:
      body.green_tax_form_url === undefined
        ? undefined
        : body.green_tax_form_url?.trim() || null,
    greenTaxGuests:
      body.green_tax_guests === undefined
        ? undefined
        : normalizeGreenTaxGuests(body.green_tax_guests),
  };
}

const createSchema = z
  .object({
    amount: z.number().positive(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    received_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    pending_receivable: z.boolean().optional(),
    description: z.string().optional(),
    category_id: z.string().uuid().optional(),
    project_id: z.string().uuid().optional(),
    account_id: z.string().uuid().optional(),
    currency: z.string().min(1).max(8).optional(),
    contact_id: z.string().uuid().optional(),
    source: z.string().optional(),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
    attachment_url: z.string().max(2048).optional().nullable(),
    recurring_id: z.string().uuid().optional(),
    ...gstInvoiceFields,
  })
  .superRefine((b, ctx) => {
    const pend = b.pending_receivable === true;
    if (pend) {
      if (b.account_id) {
        ctx.addIssue({
          code: "custom",
          message: "Receivable income must not include account_id until received.",
        });
      }
      if (!b.currency?.trim()) {
        ctx.addIssue({ code: "custom", path: ["currency"], message: "Currency is required for receivable income." });
      }
    } else if (!b.account_id) {
      ctx.addIssue({
        code: "custom",
        path: ["account_id"],
        message: "Select a deposit account, or enable receivable (pending deposit).",
      });
    }
  });

incomeRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const body = createSchema.parse(req.body);

    const pending = body.pending_receivable === true;
    const earned = parseYmd(body.date);

    let accountId: string | null = null;
    let receivedDate: Date | null = null;
    let currency = (body.currency ?? "USD").toUpperCase();

    if (!pending) {
      const account = await prisma.account.findFirst({
        where: { id: body.account_id!, userId },
      });
      if (!account) {
        res.status(400).json({ error: "Invalid account" });
        return;
      }
      accountId = account.id;
      currency = account.currency.toUpperCase();
      receivedDate = parseYmd(body.received_date ?? body.date);
    }

    if (body.category_id) {
      const cat = await prisma.category.findFirst({
        where: { id: body.category_id, userId, type: "income" },
      });
      if (!cat) {
        res.status(400).json({ error: "Invalid income category" });
        return;
      }
    }

    if (body.project_id) {
      const project = await prisma.project.findFirst({
        where: { id: body.project_id, userId },
      });
      if (!project) {
        res.status(400).json({ error: "Invalid project" });
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

    const row = await prisma.incomeEntry.create({
      data: {
        userId,
        amount: toMoney(body.amount),
        date: earned,
        receivedDate,
        currency,
        description: body.description ?? null,
        categoryId: body.category_id ?? null,
        projectId: body.project_id ?? null,
        accountId,
        contactId: body.contact_id ?? null,
        source: body.source ?? null,
        notes: body.notes ?? null,
        tags: body.tags ?? [],
        attachmentUrl: body.attachment_url ?? null,
        recurringId: body.recurring_id ?? null,
        ...gstCreateData(body),
      },
    });

    if (accountId) {
      await recalculateAccountBalance(accountId);
    }

    res.status(201).json({ id: row.id });
  }),
);

const updateSchema = z.object({
  amount: z.number().positive().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  received_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  description: z.string().optional(),
  category_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  account_id: z.string().uuid().nullable().optional(),
  currency: z.string().min(1).max(8).optional(),
  contact_id: z.string().uuid().nullable().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  attachment_url: z.string().max(2048).nullable().optional(),
  recurring_id: z.string().uuid().optional(),
  ...gstInvoiceFields,
});

incomeRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const id = z.string().uuid().parse(req.params.id);
    const body = updateSchema.parse(req.body);

    const existing = await prisma.incomeEntry.findFirst({
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

    if (body.account_id === null && existing.accountId) {
      res.status(400).json({ error: "Cannot unset the deposit account for posted income." });
      return;
    }

    let nextAccountId = body.account_id !== undefined ? body.account_id : existing.accountId;

    let nextReceivedDate: Date | null =
      body.received_date === undefined
        ? existing.receivedDate
        : body.received_date === null
          ? null
          : parseYmd(body.received_date);

    let nextCurrency =
      body.currency !== undefined ? body.currency.toUpperCase() : existing.currency.toUpperCase();
    const nextEarned = body.date !== undefined ? parseYmd(body.date) : existing.date;

    if (!existing.accountId && nextAccountId) {
      if (!body.received_date || body.received_date === null) {
        res.status(400).json({ error: "received_date is required when marking income as received." });
        return;
      }
      const acc = await prisma.account.findFirst({
        where: { id: nextAccountId, userId },
      });
      if (!acc) {
        res.status(400).json({ error: "Invalid account" });
        return;
      }
      if (acc.currency.toUpperCase() !== existing.currency.toUpperCase()) {
        res.status(400).json({
          error: `Account currency (${acc.currency}) must match receivable amount currency (${existing.currency}).`,
        });
        return;
      }
      nextReceivedDate = parseYmd(body.received_date!);
      nextCurrency = acc.currency.toUpperCase();
    } else if (nextAccountId) {
      const acc = await prisma.account.findFirst({
        where: { id: nextAccountId, userId },
      });
      if (!acc) {
        res.status(400).json({ error: "Invalid account" });
        return;
      }
      if (acc.currency.toUpperCase() !== nextCurrency) {
        res.status(400).json({ error: "Amount currency must match the selected account currency." });
        return;
      }
      if (!nextReceivedDate) {
        res.status(400).json({ error: "received_date is required when an account is set." });
        return;
      }
    }

    if (!nextAccountId) {
      nextReceivedDate = null;
    }

    if (body.category_id) {
      const cat = await prisma.category.findFirst({
        where: { id: body.category_id, userId, type: "income" },
      });
      if (!cat) {
        res.status(400).json({ error: "Invalid income category" });
        return;
      }
    }

    if (body.project_id) {
      const project = await prisma.project.findFirst({
        where: { id: body.project_id, userId },
      });
      if (!project) {
        res.status(400).json({ error: "Invalid project" });
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

    await prisma.incomeEntry.update({
      where: { id },
      data: {
        amount: body.amount !== undefined ? toMoney(body.amount) : undefined,
        date: body.date !== undefined ? nextEarned : undefined,
        receivedDate:
          body.received_date !== undefined || body.account_id !== undefined ? nextReceivedDate : undefined,
        currency: body.currency !== undefined ? nextCurrency : undefined,
        description: body.description,
        categoryId: body.category_id === undefined ? undefined : body.category_id,
        projectId: body.project_id === undefined ? undefined : body.project_id,
        accountId: body.account_id === undefined ? undefined : nextAccountId,
        contactId: body.contact_id === undefined ? undefined : body.contact_id,
        source: body.source,
        notes: body.notes,
        tags: body.tags,
        attachmentUrl: body.attachment_url === undefined ? undefined : body.attachment_url,
        recurringId: body.recurring_id,
        ...gstUpdateData(body),
      },
    });

    if (existing.accountId) {
      await recalculateAccountBalance(existing.accountId);
    }
    if (nextAccountId && nextAccountId !== existing.accountId) {
      await recalculateAccountBalance(nextAccountId);
    }

    const row = await loadIncomeListRow(userId, id);
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

incomeRouter.post(
  "/:id/void",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const id = z.string().uuid().parse(req.params.id);
    const body = voidSchema.parse(req.body ?? {});

    const existing = await prisma.incomeEntry.findFirst({
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

    await prisma.incomeEntry.update({
      where: { id },
      data: {
        voidedAt: new Date(),
        voidReason: body.reason?.trim() || null,
      },
    });

    if (existing.accountId) {
      await recalculateAccountBalance(existing.accountId);
    }
    const row = await loadIncomeListRow(userId, id);
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ row });
  }),
);

incomeRouter.post(
  "/:id/unvoid",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const id = z.string().uuid().parse(req.params.id);

    const existing = await prisma.incomeEntry.findFirst({
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

    await prisma.incomeEntry.update({
      where: { id },
      data: { voidedAt: null, voidReason: null },
    });

    if (existing.accountId) {
      await recalculateAccountBalance(existing.accountId);
    }
    const row = await loadIncomeListRow(userId, id);
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ row });
  }),
);

incomeRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const id = z.string().uuid().parse(req.params.id);

    const existing = await prisma.incomeEntry.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    await prisma.incomeEntry.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    if (existing.accountId) {
      await recalculateAccountBalance(existing.accountId);
    }
    res.status(204).send();
  }),
);
