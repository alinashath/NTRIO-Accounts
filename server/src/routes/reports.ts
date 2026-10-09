import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { convertWithUsdMvrRate } from "../lib/displayFx.js";
import { loadFxRateResolver } from "../lib/fxRates.js";
import { prisma } from "../lib/prisma.js";
import { toMoney } from "../lib/money.js";
import {
  buildBalanceSheet,
  buildCashFlowStatement,
  buildIncomeStatement,
  type DateBasis,
} from "../services/statementService.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { asyncHandler } from "../utils/http.js";

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

const rangeQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  account_id: z.string().uuid().optional(),
  category_id: z.string().uuid().optional(),
});

function parseDateBasis(raw: unknown): DateBasis {
  const v = z
    .preprocess(
      (x) => (Array.isArray(x) ? x[0] : x),
      z.enum(["accrual", "cash"]).optional(),
    )
    .parse(raw);
  return v ?? "accrual";
}

const DAY_MS = 86_400_000;

function previousInclusivePeriod(from: Date, to: Date): { prevFrom: Date; prevTo: Date } {
  const inclusiveDays = Math.floor((to.getTime() - from.getTime()) / DAY_MS) + 1;
  const prevTo = new Date(from.getTime() - DAY_MS);
  const prevFrom = new Date(prevTo.getTime() - (inclusiveDays - 1) * DAY_MS);
  return { prevFrom, prevTo };
}

function ymdReport(d: Date) {
  return d.toISOString().slice(0, 10);
}

const categoryDetailQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(["income", "expense"]),
  category_id: z.string().uuid().optional(),
  uncategorized: z.preprocess(
    (v) => v === true || v === "true" || v === "1" || v === 1,
    z.boolean().optional(),
  ),
  display_currency: z
    .preprocess((v) => (Array.isArray(v) ? v[0] : v), z.enum(["USD", "MVR"]).optional())
    .optional(),
});

reportsRouter.get(
  "/category-detail",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const q = categoryDetailQuery.parse(req.query);
    const from = new Date(`${q.from}T00:00:00Z`);
    const to = new Date(`${q.to}T00:00:00Z`);
    const displayCurrency = q.display_currency ?? null;

    if (q.uncategorized && q.category_id) {
      res.status(400).json({ error: "Use either category_id or uncategorized, not both." });
      return;
    }
    if (!q.uncategorized && !q.category_id) {
      res.status(400).json({ error: "Provide category_id or uncategorized=true." });
      return;
    }

    const catFilter =
      q.uncategorized === true
        ? { categoryId: null as null }
        : { categoryId: q.category_id! };

    let categoryName = "Uncategorized";
    if (q.category_id) {
      const cat = await prisma.category.findFirst({
        where: { id: q.category_id, userId, type: q.kind },
      });
      if (!cat) {
        res.status(404).json({ error: "Category not found" });
        return;
      }
      categoryName = cat.name;
    }

    const rateFor = displayCurrency ? await loadFxRateResolver(userId) : null;

    const sumConvertedIncome = (
      rows: {
        amount: unknown;
        currency: string;
        date: Date;
        account: { currency: string } | null;
      }[],
    ) =>
      toMoney(
        rows.reduce((s, r) => {
          const ccy = r.account?.currency ?? r.currency ?? "USD";
          const amt = Number(r.amount);
          if (!displayCurrency || !rateFor) return s + amt;
          const asOf = r.date.toISOString().slice(0, 10);
          return s + convertWithUsdMvrRate(amt, ccy, displayCurrency, rateFor(asOf));
        }, 0),
      );

    const sumConvertedExpense = (
      rows: {
        amount: unknown;
        billCurrency: string;
        billDate: Date;
        account: { currency: string } | null;
        debt: { currency: string } | null;
      }[],
    ) =>
      toMoney(
        rows.reduce((s, r) => {
          const ccy = r.account?.currency ?? r.debt?.currency ?? r.billCurrency ?? "USD";
          const amt = Number(r.amount);
          if (!displayCurrency || !rateFor) return s + amt;
          const asOf = r.billDate.toISOString().slice(0, 10);
          return s + convertWithUsdMvrRate(amt, ccy, displayCurrency, rateFor(asOf));
        }, 0),
      );

    const trend: Array<{ month: string; period_from: string; period_to: string; total: number }> = [];

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let cur = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
    while (cur.getTime() <= to.getTime()) {
      const y = cur.getUTCFullYear();
      const m = cur.getUTCMonth();
      const monthStart = new Date(Date.UTC(y, m, 1));
      const monthEnd = new Date(Date.UTC(y, m + 1, 0));
      const sliceFrom = monthStart < from ? from : monthStart;
      const sliceTo = monthEnd > to ? to : monthEnd;

      if (sliceFrom.getTime() <= sliceTo.getTime()) {
        let monthTotal = 0;
        if (q.kind === "income") {
          const rows = await prisma.incomeEntry.findMany({
            where: {
              userId,
              deletedAt: null,
              voidedAt: null,
              date: { gte: sliceFrom, lte: sliceTo },
              ...catFilter,
            },
            include: { account: true },
          });
          monthTotal = sumConvertedIncome(rows);
        } else {
          const rows = await prisma.expenseEntry.findMany({
            where: {
              userId,
              deletedAt: null,
              voidedAt: null,
              billDate: { gte: sliceFrom, lte: sliceTo },
              ...catFilter,
            },
            include: { account: true, debt: true },
          });
          monthTotal = sumConvertedExpense(rows);
        }

        trend.push({
          month: `${monthNames[m]} ${y}`,
          period_from: ymdReport(sliceFrom),
          period_to: ymdReport(sliceTo),
          total: monthTotal,
        });
      }

      cur = new Date(Date.UTC(y, m + 1, 1));
    }

    const transactions: Array<{
      id: string;
      kind: "income" | "expense";
      date: string;
      description: string | null;
      amount: number;
      currency: string;
    }> = [];

    if (q.kind === "income") {
      const rows = await prisma.incomeEntry.findMany({
        where: {
          userId,
          deletedAt: null,
          voidedAt: null,
          date: { gte: from, lte: to },
          ...catFilter,
        },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        take: 200,
        include: { account: true },
      });
      for (const r of rows) {
        const ccy = r.account?.currency ?? r.currency ?? "USD";
        transactions.push({
          id: r.id,
          kind: "income",
          date: ymdReport(r.date),
          description: r.description,
          amount: toMoney(Number(r.amount)),
          currency: ccy,
        });
      }
    } else {
      const rows = await prisma.expenseEntry.findMany({
        where: {
          userId,
          deletedAt: null,
          voidedAt: null,
          billDate: { gte: from, lte: to },
          ...catFilter,
        },
        orderBy: [{ billDate: "desc" }, { createdAt: "desc" }],
        take: 200,
        include: { account: true, debt: true },
      });
      for (const r of rows) {
        const ccy = r.account?.currency ?? r.debt?.currency ?? r.billCurrency ?? "USD";
        transactions.push({
          id: r.id,
          kind: "expense",
          date: ymdReport(r.billDate),
          description: r.description ?? r.merchant,
          amount: toMoney(Number(r.amount)),
          currency: ccy,
        });
      }
    }

    res.json({
      kind: q.kind,
      category_id: q.category_id ?? null,
      name: categoryName,
      from: q.from,
      to: q.to,
      display_currency: displayCurrency,
      trend,
      transactions,
    });
  }),
);

reportsRouter.get(
  "/pnl",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const q = rangeQuery.parse(req.query);
    const displayCurrency = z
      .preprocess(
        (v) => (Array.isArray(v) ? v[0] : v),
        z.enum(["USD", "MVR"]).optional(),
      )
      .parse(req.query.display_currency);
    const dateBasis = parseDateBasis(req.query.date_basis);

    if (displayCurrency) {
      const stmt = await buildIncomeStatement(userId, q.from, q.to, displayCurrency, dateBasis);
      res.json(stmt);
      return;
    }

    const from = new Date(`${q.from}T00:00:00Z`);
    const to = new Date(`${q.to}T00:00:00Z`);
    const incomeWhere: Prisma.IncomeEntryWhereInput = {
      userId,
      deletedAt: null,
      voidedAt: null,
      ...(dateBasis === "accrual"
        ? { date: { gte: from, lte: to } }
        : { receivedDate: { not: null, gte: from, lte: to } }),
      ...(q.account_id ? { accountId: q.account_id } : {}),
      ...(q.category_id ? { categoryId: q.category_id } : {}),
    };
    const expenseWhere: Prisma.ExpenseEntryWhereInput = {
      userId,
      deletedAt: null,
      voidedAt: null,
      ...(dateBasis === "accrual"
        ? { billDate: { gte: from, lte: to } }
        : { paidDate: { not: null, gte: from, lte: to } }),
      ...(q.account_id ? { accountId: q.account_id } : {}),
      ...(q.category_id ? { categoryId: q.category_id } : {}),
    };
    const [incomeAgg, expenseAgg] = await Promise.all([
      prisma.incomeEntry.aggregate({ where: incomeWhere, _sum: { amount: true } }),
      prisma.expenseEntry.aggregate({ where: expenseWhere, _sum: { amount: true } }),
    ]);
    const totalIncome = toMoney(Number(incomeAgg._sum.amount ?? 0));
    const totalExpenses = toMoney(Number(expenseAgg._sum.amount ?? 0));
    const net = toMoney(totalIncome - totalExpenses);
    res.json({
      from: q.from,
      to: q.to,
      display_currency: null,
      basis: dateBasis,
      date_basis: dateBasis,
      total_income: totalIncome,
      total_expenses: totalExpenses,
      gross_profit: totalIncome,
      net,
      net_income: net,
      income_lines: [],
      expense_lines: [],
    });
  }),
);

reportsRouter.get(
  "/cashflow",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const q = rangeQuery.parse(req.query);
    const displayCurrency = z
      .preprocess(
        (v) => (Array.isArray(v) ? v[0] : v),
        z.enum(["USD", "MVR"]).optional(),
      )
      .parse(req.query.display_currency);
    const dateBasis = parseDateBasis(req.query.date_basis);

    const dc = displayCurrency ?? "USD";
    const stmt = await buildCashFlowStatement(userId, q.from, q.to, dc, dateBasis);
    res.json(stmt);
  }),
);

reportsRouter.get(
  "/balance-sheet",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const asOf = z.object({ as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(req.query);
    const displayCurrency = z
      .preprocess(
        (v) => (Array.isArray(v) ? v[0] : v),
        z.enum(["USD", "MVR"]).optional(),
      )
      .parse(req.query.display_currency);

    const stmt = await buildBalanceSheet(userId, asOf.as_of, displayCurrency ?? "USD");
    res.json(stmt);
  }),
);

reportsRouter.get(
  "/net-worth",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const asOf = z.object({ as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(req.query);
    const displayCurrency = z
      .preprocess(
        (v) => (Array.isArray(v) ? v[0] : v),
        z.enum(["USD", "MVR"]).optional(),
      )
      .parse(req.query.display_currency);

    const stmt = await buildBalanceSheet(userId, asOf.as_of, displayCurrency ?? "USD");
    res.json({
      as_of: stmt.as_of,
      display_currency: stmt.display_currency,
      cash_and_accounts: stmt.cash_and_accounts,
      outstanding_i_owe: stmt.outstanding_i_owe,
      outstanding_owed_to_me: stmt.outstanding_owed_to_me,
      net_worth: stmt.net_worth,
      pay_later_unpaid: stmt.pay_later_unpaid,
    });
  }),
);

reportsRouter.get(
  "/category-breakdown",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const q = rangeQuery.parse(req.query);
    const from = new Date(`${q.from}T00:00:00Z`);
    const to = new Date(`${q.to}T00:00:00Z`);
    const displayCurrency = z
      .preprocess(
        (v) => (Array.isArray(v) ? v[0] : v),
        z.enum(["USD", "MVR"]).optional(),
      )
      .parse(req.query.display_currency);

    const comparePrev =
      z.preprocess((v) => v === true || v === "true" || v === "1", z.boolean().optional()).parse(req.query.compare) ??
      false;
    const dateBasis = parseDateBasis(req.query.date_basis);

    if (displayCurrency) {
      const rateFor = await loadFxRateResolver(userId);

      const incomeWhere = {
        userId,
        deletedAt: null,
        voidedAt: null,
        ...(dateBasis === "accrual"
          ? { date: { gte: from, lte: to } }
          : { receivedDate: { not: null, gte: from, lte: to } }),
        ...(q.account_id ? { accountId: q.account_id } : {}),
        ...(q.category_id ? { categoryId: q.category_id } : {}),
      };
      const expenseWhere = {
        userId,
        deletedAt: null,
        voidedAt: null,
        ...(dateBasis === "accrual"
          ? { billDate: { gte: from, lte: to } }
          : { paidDate: { not: null, gte: from, lte: to } }),
        ...(q.account_id ? { accountId: q.account_id } : {}),
        ...(q.category_id ? { categoryId: q.category_id } : {}),
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

      type Agg = { kind: string; category_id: string | null; name: string; total: number };
      const aggMap = new Map<string, Agg>();

      const bump = (
        kind: "income" | "expense",
        categoryId: string | null,
        name: string,
        rawAmt: number,
        ccy: string,
        asOfYmd: string,
      ) => {
        const conv = convertWithUsdMvrRate(rawAmt, ccy, displayCurrency, rateFor(asOfYmd));
        const key = `${kind}\t${categoryId ?? ""}`;
        const prev = aggMap.get(key);
        if (prev) prev.total = toMoney(prev.total + conv);
        else aggMap.set(key, { kind, category_id: categoryId, name, total: conv });
      };

      for (const r of incomeRows) {
        const name = r.category?.name ?? "Uncategorized";
        const ccy = r.account?.currency ?? r.currency ?? "USD";
        const asOf =
          dateBasis === "accrual"
            ? r.date.toISOString().slice(0, 10)
            : (r.receivedDate ?? r.date).toISOString().slice(0, 10);
        bump("income", r.categoryId, name, Number(r.amount), ccy, asOf);
      }
      for (const r of expenseRows) {
        const name = r.category?.name ?? "Uncategorized";
        const ccy = r.account?.currency ?? r.debt?.currency ?? r.billCurrency ?? "USD";
        const asOf =
          dateBasis === "accrual"
            ? r.billDate.toISOString().slice(0, 10)
            : (r.paidDate ?? r.billDate).toISOString().slice(0, 10);
        bump("expense", r.categoryId, name, Number(r.amount), ccy, asOf);
      }

      const rowsArr = Array.from(aggMap.values()).sort((a, b) => {
        if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
        return b.total - a.total;
      });

      const totals = rowsArr.reduce(
        (acc, r) => {
          if (r.kind === "income") acc.income = toMoney(acc.income + r.total);
          else acc.expense = toMoney(acc.expense + r.total);
          return acc;
        },
        { income: 0, expense: 0 },
      );

      let previous_period: { from: string; to: string } | undefined;
      const prevTotalsMap = new Map<string, number>();
      if (comparePrev) {
        const { prevFrom, prevTo } = previousInclusivePeriod(from, to);
        previous_period = { from: ymdReport(prevFrom), to: ymdReport(prevTo) };
        const incomeWherePrev = {
          userId,
          deletedAt: null,
          voidedAt: null,
          ...(dateBasis === "accrual"
            ? { date: { gte: prevFrom, lte: prevTo } }
            : { receivedDate: { not: null, gte: prevFrom, lte: prevTo } }),
          ...(q.account_id ? { accountId: q.account_id } : {}),
          ...(q.category_id ? { categoryId: q.category_id } : {}),
        };
        const expenseWherePrev = {
          userId,
          deletedAt: null,
          voidedAt: null,
          ...(dateBasis === "accrual"
            ? { billDate: { gte: prevFrom, lte: prevTo } }
            : { paidDate: { not: null, gte: prevFrom, lte: prevTo } }),
          ...(q.account_id ? { accountId: q.account_id } : {}),
          ...(q.category_id ? { categoryId: q.category_id } : {}),
        };
        const [incPrev, expPrev] = await Promise.all([
          prisma.incomeEntry.findMany({
            where: incomeWherePrev,
            include: { account: true, category: true },
          }),
          prisma.expenseEntry.findMany({
            where: expenseWherePrev,
            include: { account: true, debt: true, category: true },
          }),
        ]);
        const bumpPrev = (
          kind: "income" | "expense",
          categoryId: string | null,
          rawAmt: number,
          ccy: string,
          asOfYmd: string,
        ) => {
          const conv = convertWithUsdMvrRate(rawAmt, ccy, displayCurrency, rateFor(asOfYmd));
          const key = `${kind}\t${categoryId ?? ""}`;
          prevTotalsMap.set(key, toMoney((prevTotalsMap.get(key) ?? 0) + conv));
        };
        for (const r of incPrev) {
          const ccy = r.account?.currency ?? r.currency ?? "USD";
          const asOf =
            dateBasis === "accrual"
              ? r.date.toISOString().slice(0, 10)
              : (r.receivedDate ?? r.date).toISOString().slice(0, 10);
          bumpPrev("income", r.categoryId, Number(r.amount), ccy, asOf);
        }
        for (const r of expPrev) {
          const ccy = r.account?.currency ?? r.debt?.currency ?? r.billCurrency ?? "USD";
          const asOf =
            dateBasis === "accrual"
              ? r.billDate.toISOString().slice(0, 10)
              : (r.paidDate ?? r.billDate).toISOString().slice(0, 10);
          bumpPrev("expense", r.categoryId, Number(r.amount), ccy, asOf);
        }
      }

      const rows = rowsArr.map((r) => {
        const key = `${r.kind}\t${r.category_id ?? ""}`;
        const prevVal = comparePrev ? (prevTotalsMap.get(key) ?? 0) : 0;
        const change = comparePrev ? toMoney(r.total - prevVal) : 0;
        const prevAbs = Math.abs(prevVal);
        const change_pct =
          comparePrev && prevAbs > 1e-6 ? toMoney(((r.total - prevVal) / prevVal) * 100) : null;
        return {
          kind: r.kind,
          category_id: r.category_id,
          name: r.name,
          total: toMoney(r.total),
          ...(comparePrev
            ? {
                previous_total: toMoney(prevVal),
                change,
                change_pct,
              }
            : {}),
          pct_of_kind:
            r.kind === "income" && totals.income > 0
              ? toMoney((r.total / totals.income) * 100)
              : r.kind === "expense" && totals.expense > 0
                ? toMoney((r.total / totals.expense) * 100)
                : 0,
        };
      });

      res.json({
        from: q.from,
        to: q.to,
        display_currency: displayCurrency,
        date_basis: dateBasis,
        totals,
        rows,
        ...(previous_period ? { previous_period } : {}),
      });
      return;
    }

    const rows = await prisma.$queryRaw<
      Array<{ kind: string; category_id: string | null; name: string | null; total: unknown }>
    >(Prisma.sql`
      SELECT x.kind,
             x.category_id,
             c.name,
             SUM(x.amount)::numeric AS total
      FROM (
        SELECT 'income'::text AS kind,
               i.category_id,
               i.amount
        FROM income_entries i
        WHERE i.user_id = ${userId}::uuid
          AND i.deleted_at IS NULL
          AND i.voided_at IS NULL
          AND i.date >= ${from}::date
          AND i.date <= ${to}::date
        UNION ALL
        SELECT 'expense'::text AS kind,
               e.category_id,
               e.amount
        FROM expense_entries e
        WHERE e.user_id = ${userId}::uuid
          AND e.deleted_at IS NULL
          AND e.voided_at IS NULL
          AND e.bill_date >= ${from}::date
          AND e.bill_date <= ${to}::date
      ) x
      LEFT JOIN categories c ON c.id = x.category_id
      GROUP BY x.kind, x.category_id, c.name
      ORDER BY x.kind, total DESC
    `);

    const totals = rows.reduce(
      (acc, r) => {
        const t = toMoney(Number(r.total));
        if (r.kind === "income") acc.income += t;
        else acc.expense += t;
        return acc;
      },
      { income: 0, expense: 0 },
    );

    res.json({
      from: q.from,
      to: q.to,
      display_currency: null,
      totals,
      rows: rows.map((r) => ({
        kind: r.kind,
        category_id: r.category_id,
        name: r.name ?? "Uncategorized",
        total: toMoney(Number(r.total)),
        pct_of_kind:
          r.kind === "income" && totals.income > 0
            ? toMoney((Number(r.total) / totals.income) * 100)
            : r.kind === "expense" && totals.expense > 0
              ? toMoney((Number(r.total) / totals.expense) * 100)
              : 0,
      })),
    });
  }),
);

const exportSchema = z.object({
  format: z.enum(["csv", "pdf"]),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

reportsRouter.post(
  "/export",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const body = exportSchema.parse(req.body);

    if (body.format === "pdf") {
      res.status(501).json({
        error: "PDF export not wired yet — add react-pdf on the client or a template engine on the server.",
      });
      return;
    }

    const from = new Date(`${body.from}T00:00:00Z`);
    const to = new Date(`${body.to}T00:00:00Z`);

    const [income, expenses] = await Promise.all([
      prisma.incomeEntry.findMany({
        where: {
          userId,
          deletedAt: null,
          voidedAt: null,
          date: { gte: from, lte: to },
        },
        orderBy: { date: "asc" },
      }),
      prisma.expenseEntry.findMany({
        where: {
          userId,
          deletedAt: null,
          voidedAt: null,
          billDate: { gte: from, lte: to },
        },
        orderBy: { billDate: "asc" },
      }),
    ]);

    const lines = [
      "kind,date,amount,description",
      ...income.map(
        (r) => `income,${r.date.toISOString().slice(0, 10)},${Number(r.amount)},${escapeCsv(r.description)}`,
      ),
      ...expenses.map(
        (r) => `expense,${r.billDate.toISOString().slice(0, 10)},${Number(r.amount)},${escapeCsv(r.description)}`,
      ),
    ];

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="export-${body.from}_${body.to}.csv"`,
    );
    res.send(lines.join("\n"));
  }),
);

function escapeCsv(s: string | null) {
  if (!s) return "";
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
