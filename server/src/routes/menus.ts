import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { scopeOrganizationData } from "../middleware/orgScope.js";
import { asyncHandler } from "../utils/http.js";
import { ensureKitchenStockSeed } from "../services/kitchenSeed.js";
import { ensureMealMenus, loadMenusForUser, mapMenuDto } from "../services/mealMenus.js";

export const menusRouter = Router();
menusRouter.use(requireAuth);
menusRouter.use(scopeOrganizationData);

const lineSchema = z
  .object({
    role: z.enum(["base", "option", "choice"]),
    choice_group_key: z.string().max(64).optional().nullable(),
    choice_group_label: z.string().max(120).optional().nullable(),
    display_name: z.string().min(1).max(160),
    stock_item_id: z.string().uuid().optional().nullable(),
    component_recipe_id: z.string().uuid().optional().nullable(),
    qty_per_serving: z.number().min(0),
    notes: z.string().max(500).optional().nullable(),
    show_on_kot: z.boolean().optional().default(true),
    sort_order: z.number().int().optional().default(0),
  })
  .superRefine((l, ctx) => {
    if (!l.stock_item_id && !l.component_recipe_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Each line must map to a stock item or prepared recipe",
      });
    }
    if (l.stock_item_id && l.component_recipe_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Map to stock or prepared recipe, not both",
      });
    }
    if (l.role === "choice" && !l.choice_group_key?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choice lines need a choice group key",
      });
    }
  });

const createSchema = z.object({
  meal_period: z.enum(["breakfast", "lunch", "dinner"]),
  name: z.string().min(1).max(200),
  code: z.string().max(64).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  sort_order: z.number().int().optional().default(0),
  lines: z.array(lineSchema).default([]),
});

const updateSchema = createSchema.partial().extend({
  is_active: z.boolean().optional(),
  lines: z.array(lineSchema).optional(),
});

menusRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    await ensureKitchenStockSeed(userId);
    const period = z
      .enum(["breakfast", "lunch", "dinner"])
      .optional()
      .parse(typeof req.query.meal_period === "string" ? req.query.meal_period : undefined);
    const rows = await loadMenusForUser(userId, period);
    res.json({ items: rows.map(mapMenuDto) });
  }),
);

menusRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const id = z.string().uuid().parse(req.params.id);
    await ensureMealMenus(userId);
    const row = await prisma.mealMenu.findFirst({
      where: { id, userId },
      include: {
        lines: {
          include: {
            stockItem: true,
            componentRecipe: { include: { lines: { include: { stockItem: true } } } },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    });
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(mapMenuDto(row));
  }),
);

menusRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const body = createSchema.parse(req.body);
    await ensureKitchenStockSeed(userId);

    if (body.code) {
      const clash = await prisma.mealMenu.findUnique({
        where: { userId_code: { userId, code: body.code } },
      });
      if (clash) {
        res.status(400).json({ error: "Menu code already exists" });
        return;
      }
    }

    const created = await prisma.mealMenu.create({
      data: {
        userId,
        mealPeriod: body.meal_period,
        name: body.name.trim(),
        code: body.code?.trim() || null,
        notes: body.notes?.trim() || null,
        sortOrder: body.sort_order ?? 0,
        lines: {
          create: body.lines.map((l, i) => ({
            role: l.role,
            choiceGroupKey: l.role === "choice" ? l.choice_group_key?.trim() || null : null,
            choiceGroupLabel: l.role === "choice" ? l.choice_group_label?.trim() || null : null,
            displayName: l.display_name.trim(),
            stockItemId: l.stock_item_id ?? null,
            componentRecipeId: l.component_recipe_id ?? null,
            qtyPerServing: l.qty_per_serving,
            notes: l.notes?.trim() || null,
            showOnKot: l.show_on_kot ?? true,
            sortOrder: l.sort_order ?? i,
          })),
        },
      },
      include: {
        lines: {
          include: {
            stockItem: true,
            componentRecipe: { include: { lines: { include: { stockItem: true } } } },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    });
    res.status(201).json(mapMenuDto(created));
  }),
);

menusRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const id = z.string().uuid().parse(req.params.id);
    const body = updateSchema.parse(req.body);
    const existing = await prisma.mealMenu.findFirst({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.mealMenu.update({
        where: { id },
        data: {
          mealPeriod: body.meal_period,
          name: body.name?.trim(),
          code: body.code === undefined ? undefined : body.code?.trim() || null,
          notes: body.notes === undefined ? undefined : body.notes?.trim() || null,
          sortOrder: body.sort_order,
          isActive: body.is_active,
        },
      });
      if (body.lines) {
        await tx.mealMenuLine.deleteMany({ where: { menuId: id } });
        if (body.lines.length) {
          await tx.mealMenuLine.createMany({
            data: body.lines.map((l, i) => ({
              menuId: id,
              role: l.role,
              choiceGroupKey: l.role === "choice" ? l.choice_group_key?.trim() || null : null,
              choiceGroupLabel: l.role === "choice" ? l.choice_group_label?.trim() || null : null,
              displayName: l.display_name.trim(),
              stockItemId: l.stock_item_id ?? null,
              componentRecipeId: l.component_recipe_id ?? null,
              qtyPerServing: l.qty_per_serving,
              notes: l.notes?.trim() || null,
              showOnKot: l.show_on_kot ?? true,
              sortOrder: l.sort_order ?? i,
            })),
          });
        }
      }
    });

    const row = await prisma.mealMenu.findFirstOrThrow({
      where: { id, userId },
      include: {
        lines: {
          include: {
            stockItem: true,
            componentRecipe: { include: { lines: { include: { stockItem: true } } } },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    });
    res.json(mapMenuDto(row));
  }),
);

menusRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const id = z.string().uuid().parse(req.params.id);
    const existing = await prisma.mealMenu.findFirst({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await prisma.mealMenu.update({
      where: { id },
      data: { isActive: false },
    });
    res.json({ ok: true });
  }),
);
