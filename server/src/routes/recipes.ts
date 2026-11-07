import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { dec } from "../lib/dates.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { scopeOrganizationData } from "../middleware/orgScope.js";
import { asyncHandler } from "../utils/http.js";
import { ensureKitchenStockSeed } from "../services/kitchenSeed.js";
import { costPreparedBom, stockUnitPrice } from "../services/stockCost.js";
import { toMoney } from "../lib/money.js";
import { stockUnitsOf } from "../lib/stockDto.js";
import { roundQty, toBase } from "../lib/units.js";

export const recipesRouter = Router();
recipesRouter.use(requireAuth);
recipesRouter.use(scopeOrganizationData);

function kindFromApplyTo(applyTo: string): "menu_legacy" | "prepared" | "addons" {
  if (applyTo === "room_extras") return "addons";
  if (applyTo === "custom") return "prepared";
  return "menu_legacy";
}

function mapRecipe(r: {
  id: string;
  name: string;
  applyTo: string;
  kind?: string;
  code: string | null;
  notes: string | null;
  batchSize?: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  lines: Array<{
    id: string;
    stockItemId: string;
    qtyPerServing: { toNumber?: () => number } | number;
    inputQty?: { toNumber?: () => number } | number | null;
    inputUnit?: string | null;
    componentRecipeId?: string | null;
    notes: string | null;
    showOnKot?: boolean;
    isOption?: boolean;
    stockItem: {
      name: string;
      unit: string;
      code: string | null;
      baseUnit?: string | null;
      displayUnit?: string | null;
      units?: unknown;
      lastUnitCost?: { toNumber?: () => number } | number | null;
    };
    componentRecipe?: { id: string; name: string } | null;
  }>;
}) {
  const bom = costPreparedBom(r.lines);
  return {
    id: r.id,
    name: r.name,
    apply_to: r.applyTo,
    kind: (r.kind as "menu_legacy" | "prepared" | "addons") ?? kindFromApplyTo(r.applyTo),
    code: r.code,
    notes: r.notes,
    batch_size: r.batchSize && r.batchSize > 0 ? r.batchSize : 1,
    is_active: r.isActive,
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
    estimated_cost: bom.estimated_cost,
    cost_incomplete: bom.cost_incomplete,
    lines: r.lines.map((l) => {
      const unit = stockUnitPrice(l.stockItem);
      const qty = dec(l.qtyPerServing);
      const { baseUnit, units } = stockUnitsOf(l.stockItem);
      return {
        id: l.id,
        stock_item_id: l.stockItemId,
        stock_item_name: l.stockItem.name,
        stock_item_unit: l.stockItem.unit,
        stock_item_code: l.stockItem.code,
        stock_item_base_unit: baseUnit,
        stock_item_units: units,
        qty_per_serving: qty,
        input_qty: l.inputQty != null ? dec(l.inputQty as never) : null,
        input_unit: l.inputUnit ?? null,
        component_recipe_id: l.componentRecipeId ?? null,
        component_recipe_name: l.componentRecipe?.name ?? null,
        notes: l.notes,
        show_on_kot: l.showOnKot !== false,
        is_option: Boolean(l.isOption),
        unit_cost: unit,
        estimated_cost: unit != null ? toMoney(qty * unit) : null,
      };
    }),
  };
}

const lineSchema = z.object({
  stock_item_id: z.string().uuid(),
  qty_per_serving: z.number().positive().optional(),
  input_qty: z.number().positive().optional(),
  input_unit: z.string().min(1).max(50).optional(),
  component_recipe_id: z.string().uuid().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  show_on_kot: z.boolean().optional().default(true),
  is_option: z.boolean().optional().default(false),
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  apply_to: z.enum(["maldivian", "continental", "room_extras", "custom"]).default("custom"),
  kind: z.enum(["menu_legacy", "prepared", "addons"]).optional(),
  notes: z.string().max(2000).optional().nullable(),
  batch_size: z.number().int().positive().optional(),
  lines: z.array(lineSchema).default([]),
});

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  apply_to: z.enum(["maldivian", "continental", "room_extras", "custom"]).optional(),
  kind: z.enum(["menu_legacy", "prepared", "addons"]).optional(),
  notes: z.string().max(2000).optional().nullable(),
  batch_size: z.number().int().positive().optional(),
  is_active: z.boolean().optional(),
  lines: z.array(lineSchema).optional(),
});

async function resolveLineQty(
  userId: string,
  line: z.infer<typeof lineSchema>,
): Promise<{
  stockItemId: string;
  qtyPerServing: number;
  inputQty: number | null;
  inputUnit: string | null;
  componentRecipeId: string | null;
  notes: string | null;
  showOnKot: boolean;
  isOption: boolean;
} | null> {
  const item = await prisma.stockItem.findFirst({
    where: { id: line.stock_item_id, userId, isActive: true },
  });
  if (!item) return null;
  let componentRecipeId: string | null = line.component_recipe_id ?? null;
  if (componentRecipeId) {
    const prep = await prisma.recipe.findFirst({
      where: {
        id: componentRecipeId,
        userId,
        isActive: true,
        OR: [{ kind: "prepared" }, { applyTo: "custom" }],
      },
    });
    if (!prep) return null;
  }
  const { baseUnit, units } = stockUnitsOf(item);
  let qtyBase: number;
  let inputQty: number | null = null;
  let inputUnit: string | null = null;
  if (line.input_qty != null && line.input_unit) {
    inputQty = line.input_qty;
    inputUnit = line.input_unit;
    qtyBase = roundQty(toBase(line.input_qty, line.input_unit, units, baseUnit));
  } else if (line.qty_per_serving != null) {
    qtyBase = line.qty_per_serving;
    inputQty = line.input_qty ?? line.qty_per_serving;
    inputUnit = line.input_unit ?? item.displayUnit ?? baseUnit;
  } else {
    return null;
  }
  if (!(qtyBase > 0)) return null;
  return {
    stockItemId: line.stock_item_id,
    qtyPerServing: qtyBase,
    inputQty,
    inputUnit,
    componentRecipeId,
    notes: line.notes ?? null,
    showOnKot: line.show_on_kot ?? true,
    isOption: Boolean(line.is_option),
  };
}

recipesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    await ensureKitchenStockSeed(userId);
    const rows = await prisma.recipe.findMany({
      where: { userId, isActive: true },
      include: {
        lines: { include: { stockItem: true, componentRecipe: { select: { id: true, name: true } } } },
      },
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
      include: {
        lines: { include: { stockItem: true, componentRecipe: { select: { id: true, name: true } } } },
      },
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

    const resolved = [];
    for (const line of body.lines) {
      const r = await resolveLineQty(userId, line);
      if (!r) {
        res.status(400).json({ error: "One or more stock items or quantities are invalid" });
        return;
      }
      resolved.push(r);
    }

    const kind = body.kind ?? kindFromApplyTo(body.apply_to);
    const created = await prisma.recipe.create({
      data: {
        userId,
        name: body.name,
        applyTo: body.apply_to,
        kind,
        notes: body.notes ?? null,
        batchSize: body.batch_size ?? 1,
        lines: {
          create: resolved.map((l) => ({
            stockItemId: l.stockItemId,
            qtyPerServing: l.qtyPerServing,
            inputQty: l.inputQty,
            inputUnit: l.inputUnit,
            componentRecipeId: l.componentRecipeId,
            notes: l.notes,
            showOnKot: l.showOnKot,
            isOption:
              body.apply_to === "room_extras" || kind === "addons" ? false : l.isOption,
          })),
        },
      },
      include: {
        lines: { include: { stockItem: true, componentRecipe: { select: { id: true, name: true } } } },
      },
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
      const resolved = [];
      for (const line of body.lines) {
        const r = await resolveLineQty(userId, line);
        if (!r) {
          res.status(400).json({ error: "One or more stock items or quantities are invalid" });
          return;
        }
        resolved.push(r);
      }
      await prisma.recipeLine.deleteMany({ where: { recipeId: id } });
      const applyTo = body.apply_to ?? existing.applyTo;
      await prisma.recipeLine.createMany({
        data: resolved.map((l) => ({
          recipeId: id,
          stockItemId: l.stockItemId,
          qtyPerServing: l.qtyPerServing,
          inputQty: l.inputQty,
          inputUnit: l.inputUnit,
          componentRecipeId: l.componentRecipeId,
          notes: l.notes,
          showOnKot: l.showOnKot,
          isOption: applyTo === "room_extras" ? false : l.isOption,
        })),
      });
    }

    const updated = await prisma.recipe.update({
      where: { id },
      data: {
        name: body.name,
        applyTo: body.apply_to,
        kind: body.kind ?? (body.apply_to ? kindFromApplyTo(body.apply_to) : undefined),
        notes: body.notes,
        batchSize: body.batch_size,
        isActive: body.is_active,
      },
      include: {
        lines: { include: { stockItem: true, componentRecipe: { select: { id: true, name: true } } } },
      },
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
