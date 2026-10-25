import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { dec } from "../lib/dates.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { asyncHandler } from "../utils/http.js";
import { ensureKitchenStockSeed } from "../services/kitchenSeed.js";

export const recipesRouter = Router();
recipesRouter.use(requireAuth);

function mapRecipe(r: {
  id: string;
  name: string;
  applyTo: string;
  code: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  lines: Array<{
    id: string;
    stockItemId: string;
    qtyPerServing: { toNumber?: () => number } | number;
    notes: string | null;
    stockItem: { name: string; unit: string; code: string | null };
  }>;
}) {
  return {
    id: r.id,
    name: r.name,
    apply_to: r.applyTo,
    code: r.code,
    notes: r.notes,
    is_active: r.isActive,
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
    lines: r.lines.map((l) => ({
      id: l.id,
      stock_item_id: l.stockItemId,
      stock_item_name: l.stockItem.name,
      stock_item_unit: l.stockItem.unit,
      stock_item_code: l.stockItem.code,
      qty_per_serving: dec(l.qtyPerServing),
      notes: l.notes,
    })),
  };
}

const lineSchema = z.object({
  stock_item_id: z.string().uuid(),
  qty_per_serving: z.number().positive(),
  notes: z.string().max(500).optional().nullable(),
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  apply_to: z.enum(["maldivian", "continental", "room_extras", "custom"]).default("custom"),
  notes: z.string().max(2000).optional().nullable(),
  lines: z.array(lineSchema).default([]),
});

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  apply_to: z.enum(["maldivian", "continental", "room_extras", "custom"]).optional(),
  notes: z.string().max(2000).optional().nullable(),
  is_active: z.boolean().optional(),
  lines: z.array(lineSchema).optional(),
});

recipesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    await ensureKitchenStockSeed(userId);
    const rows = await prisma.recipe.findMany({
      where: { userId, isActive: true },
      include: { lines: { include: { stockItem: true } } },
      orderBy: [{ applyTo: "asc" }, { name: "asc" }],
    });
    res.json({ items: rows.map(mapRecipe) });
  }),
);

recipesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const id = z.string().uuid().parse(req.params.id);
    const row = await prisma.recipe.findFirst({
      where: { id, userId },
      include: { lines: { include: { stockItem: true } } },
    });
    if (!row) {
      res.status(404).json({ error: "Recipe not found" });
      return;
    }
    res.json(mapRecipe(row));
  }),
);

recipesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    await ensureKitchenStockSeed(userId);
    const body = createSchema.parse(req.body);

    if (body.lines.length) {
      const ids = body.lines.map((l) => l.stock_item_id);
      const count = await prisma.stockItem.count({
        where: { userId, id: { in: ids }, isActive: true },
      });
      if (count !== new Set(ids).size) {
        res.status(400).json({ error: "One or more stock items are invalid" });
        return;
      }
    }

    const created = await prisma.recipe.create({
      data: {
        userId,
        name: body.name,
        applyTo: body.apply_to,
        notes: body.notes ?? null,
        lines: {
          create: body.lines.map((l) => ({
            stockItemId: l.stock_item_id,
            qtyPerServing: l.qty_per_serving,
            notes: l.notes ?? null,
          })),
        },
      },
      include: { lines: { include: { stockItem: true } } },
    });
    res.status(201).json(mapRecipe(created));
  }),
);

recipesRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const id = z.string().uuid().parse(req.params.id);
    const body = updateSchema.parse(req.body);
    const existing = await prisma.recipe.findFirst({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ error: "Recipe not found" });
      return;
    }

    if (body.lines) {
      const ids = body.lines.map((l) => l.stock_item_id);
      if (ids.length) {
        const count = await prisma.stockItem.count({
          where: { userId, id: { in: ids }, isActive: true },
        });
        if (count !== new Set(ids).size) {
          res.status(400).json({ error: "One or more stock items are invalid" });
          return;
        }
      }
      await prisma.recipeLine.deleteMany({ where: { recipeId: id } });
      await prisma.recipeLine.createMany({
        data: body.lines.map((l) => ({
          recipeId: id,
          stockItemId: l.stock_item_id,
          qtyPerServing: l.qty_per_serving,
          notes: l.notes ?? null,
        })),
      });
    }

    const updated = await prisma.recipe.update({
      where: { id },
      data: {
        name: body.name,
        applyTo: body.apply_to,
        notes: body.notes,
        isActive: body.is_active,
      },
      include: { lines: { include: { stockItem: true } } },
    });
    res.json(mapRecipe(updated));
  }),
);

recipesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const id = z.string().uuid().parse(req.params.id);
    const existing = await prisma.recipe.findFirst({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ error: "Recipe not found" });
      return;
    }
    await prisma.recipe.delete({ where: { id } });
    res.status(204).send();
  }),
);
