import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { toMoney } from "../lib/money.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { asyncHandler } from "../utils/http.js";

export const categoriesRouter = Router();
categoriesRouter.use(requireAuth);

categoriesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const type = z
      .preprocess(
        (v) => (Array.isArray(v) ? v[0] : v),
        z.enum(["income", "expense"]).optional(),
      )
      .parse(req.query.type);

    const rows = await prisma.category.findMany({
      where: { userId, ...(type ? { type } : {}) },
      orderBy: { createdAt: "asc" },
    });

    res.json(
      rows.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        color: c.color,
        icon: c.icon,
        budget_limit: c.budgetLimit != null ? toMoney(Number(c.budgetLimit)) : null,
        created_at: c.createdAt,
      })),
    );
  }),
);

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["income", "expense"]),
  color: z.string().optional(),
  icon: z.string().optional(),
  budget_limit: z.number().finite().optional(),
});

categoriesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const body = createSchema.parse(req.body);

    const row = await prisma.category.create({
      data: {
        userId,
        name: body.name,
        type: body.type,
        color: body.color ?? null,
        icon: body.icon ?? null,
        budgetLimit:
          body.type === "expense" && body.budget_limit != null
            ? toMoney(body.budget_limit)
            : null,
      },
    });

    res.status(201).json({
      id: row.id,
      name: row.name,
      type: row.type,
      color: row.color,
      icon: row.icon,
      budget_limit: row.budgetLimit != null ? toMoney(Number(row.budgetLimit)) : null,
      created_at: row.createdAt,
    });
  }),
);

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  budget_limit: z.number().finite().nullable().optional(),
});

categoriesRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const id = z.string().uuid().parse(req.params.id);
    const body = updateSchema.parse(req.body);

    const existing = await prisma.category.findFirst({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ error: "Category not found" });
      return;
    }

    const row = await prisma.category.update({
      where: { id },
      data: {
        name: body.name,
        color: body.color === undefined ? undefined : body.color,
        icon: body.icon === undefined ? undefined : body.icon,
        budgetLimit:
          body.budget_limit === undefined
            ? undefined
            : body.budget_limit === null
              ? null
              : toMoney(body.budget_limit),
      },
    });

    res.json({
      id: row.id,
      name: row.name,
      type: row.type,
      color: row.color,
      icon: row.icon,
      budget_limit: row.budgetLimit != null ? toMoney(Number(row.budgetLimit)) : null,
      created_at: row.createdAt,
    });
  }),
);

categoriesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const id = z.string().uuid().parse(req.params.id);

    const existing = await prisma.category.findFirst({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ error: "Category not found" });
      return;
    }

    const [ic, ec] = await Promise.all([
      prisma.incomeEntry.count({ where: { categoryId: id, deletedAt: null } }),
      prisma.expenseEntry.count({ where: { categoryId: id, deletedAt: null } }),
    ]);

    if (ic + ec > 0) {
      res.status(400).json({ error: "Category is linked to entries" });
      return;
    }

    await prisma.expenseSplit.deleteMany({ where: { categoryId: id } });
    await prisma.category.delete({ where: { id } });
    res.status(204).send();
  }),
);
