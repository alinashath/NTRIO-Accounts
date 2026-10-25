import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { dec, parseYmd, ymd } from "../lib/dates.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { asyncHandler } from "../utils/http.js";
import { ensureKitchenStockSeed } from "../services/kitchenSeed.js";
import {
  computeIngredientNeeds,
  type ExtrasLike,
  type OrderLike,
} from "../services/breakfastRequirements.js";

export const stockRouter = Router();
stockRouter.use(requireAuth);

function balanceOf(opening: number, received: number, used: number) {
  return opening + received - used;
}

async function previousBalance(
  userId: string,
  stockItemId: string,
  beforeDate: Date,
): Promise<number> {
  const prev = await prisma.stockLedgerDay.findFirst({
    where: { userId, stockItemId, date: { lt: beforeDate } },
    orderBy: { date: "desc" },
  });
  if (!prev) return 0;
  return balanceOf(dec(prev.opening), dec(prev.received), dec(prev.used));
}

stockRouter.get(
  "/items",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    await ensureKitchenStockSeed(userId);
    const kind = z
      .enum(["kitchen", "other", "all"])
      .optional()
      .parse(typeof req.query.kind === "string" ? req.query.kind : "all");

    const items = await prisma.stockItem.findMany({
      where: {
        userId,
        isActive: true,
        ...(kind && kind !== "all" ? { kind } : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    res.json({
      items: items.map((i) => ({
        id: i.id,
        code: i.code,
        name: i.name,
        unit: i.unit,
        kind: i.kind,
        min_stock: dec(i.minStock),
        use_notes: i.useNotes,
        pack_info: i.packInfo,
        sort_order: i.sortOrder,
      })),
    });
  }),
);

const createItemSchema = z.object({
  name: z.string().min(1).max(200),
  unit: z.string().min(1).max(50),
  kind: z.enum(["kitchen", "other"]).default("other"),
  min_stock: z.number().min(0).optional(),
  use_notes: z.string().max(2000).optional().nullable(),
  pack_info: z.string().max(500).optional().nullable(),
});

stockRouter.post(
  "/items",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const body = createItemSchema.parse(req.body);
    const item = await prisma.stockItem.create({
      data: {
        userId,
        code: null,
        name: body.name,
        unit: body.unit,
        kind: body.kind,
        minStock: body.min_stock ?? 0,
        useNotes: body.use_notes ?? null,
        packInfo: body.pack_info ?? null,
        sortOrder: 1000,
      },
    });
    res.status(201).json({
      id: item.id,
      code: item.code,
      name: item.name,
      unit: item.unit,
      kind: item.kind,
      min_stock: dec(item.minStock),
      use_notes: item.useNotes,
      pack_info: item.packInfo,
      sort_order: item.sortOrder,
    });
  }),
);

const patchItemSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  unit: z.string().min(1).max(50).optional(),
  min_stock: z.number().min(0).optional(),
  use_notes: z.string().max(2000).optional().nullable(),
  pack_info: z.string().max(500).optional().nullable(),
  is_active: z.boolean().optional(),
});

stockRouter.patch(
  "/items/:id",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const id = z.string().uuid().parse(req.params.id);
    const body = patchItemSchema.parse(req.body);
    const existing = await prisma.stockItem.findFirst({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ error: "Item not found" });
      return;
    }
    const item = await prisma.stockItem.update({
      where: { id },
      data: {
        name: body.name,
        unit: body.unit,
        minStock: body.min_stock,
        useNotes: body.use_notes,
        packInfo: body.pack_info,
        isActive: body.is_active,
      },
    });
    res.json({
      id: item.id,
      code: item.code,
      name: item.name,
      unit: item.unit,
      kind: item.kind,
      min_stock: dec(item.minStock),
      use_notes: item.useNotes,
      pack_info: item.packInfo,
      sort_order: item.sortOrder,
      is_active: item.isActive,
    });
  }),
);

stockRouter.delete(
  "/items/:id",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const id = z.string().uuid().parse(req.params.id);
    const existing = await prisma.stockItem.findFirst({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ error: "Item not found" });
      return;
    }
    const inRecipe = await prisma.recipeLine.count({ where: { stockItemId: id } });
    if (inRecipe > 0) {
      // Soft-delete so recipe history stays valid
      await prisma.stockItem.update({
        where: { id },
        data: { isActive: false },
      });
      res.status(204).send();
      return;
    }
    await prisma.$transaction([
      prisma.stockLedgerDay.deleteMany({ where: { stockItemId: id } }),
      prisma.stockItem.delete({ where: { id } }),
    ]);
    res.status(204).send();
  }),
);

const inventoryQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(["kitchen", "other", "all"]).optional(),
});

stockRouter.get(
  "/inventory",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const q = inventoryQuery.parse(req.query);
    const date = parseYmd(q.date);
    await ensureKitchenStockSeed(userId);

    const items = await prisma.stockItem.findMany({
      where: {
        userId,
        isActive: true,
        ...(q.kind && q.kind !== "all" ? { kind: q.kind } : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    const ledgers = await prisma.stockLedgerDay.findMany({
      where: {
        userId,
        date,
        stockItemId: { in: items.map((i) => i.id) },
      },
    });
    const byItem = new Map(ledgers.map((l) => [l.stockItemId, l]));

    const rows = [];
    for (const item of items) {
      let ledger = byItem.get(item.id);
      if (!ledger) {
        const opening = await previousBalance(userId, item.id, date);
        rows.push({
          stock_item_id: item.id,
          code: item.code,
          name: item.name,
          unit: item.unit,
          kind: item.kind,
          use_notes: item.useNotes,
          pack_info: item.packInfo,
          min_stock: dec(item.minStock),
          opening,
          received: 0,
          used: 0,
          waste: 0,
          expenditure: 0,
          unit_cost: null as number | null,
          balance: opening,
          below_min: opening < dec(item.minStock),
          ledger_id: null as string | null,
        });
      } else {
        const opening = dec(ledger.opening);
        const received = dec(ledger.received);
        const used = dec(ledger.used);
        const bal = balanceOf(opening, received, used);
        rows.push({
          stock_item_id: item.id,
          code: item.code,
          name: item.name,
          unit: item.unit,
          kind: item.kind,
          use_notes: item.useNotes,
          pack_info: item.packInfo,
          min_stock: dec(item.minStock),
          opening,
          received,
          used,
          waste: dec(ledger.waste),
          expenditure: dec(ledger.expenditure),
          unit_cost: ledger.unitCost != null ? dec(ledger.unitCost) : null,
          balance: bal,
          below_min: bal < dec(item.minStock),
          ledger_id: ledger.id,
        });
      }
    }

    res.json({ date: q.date, items: rows });
  }),
);

const ledgerUpsertSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  stock_item_id: z.string().uuid(),
  opening: z.number().optional(),
  received: z.number().min(0).optional(),
  used: z.number().min(0).optional(),
  waste: z.number().min(0).optional(),
  expenditure: z.number().min(0).optional(),
  unit_cost: z.number().min(0).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  /** If true, set opening from previous day's balance when creating. */
  carry_opening: z.boolean().optional(),
});

stockRouter.put(
  "/ledger",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const body = ledgerUpsertSchema.parse(req.body);
    const date = parseYmd(body.date);
    const item = await prisma.stockItem.findFirst({
      where: { id: body.stock_item_id, userId },
    });
    if (!item) {
      res.status(404).json({ error: "Stock item not found" });
      return;
    }

    const existing = await prisma.stockLedgerDay.findUnique({
      where: {
        userId_stockItemId_date: {
          userId,
          stockItemId: body.stock_item_id,
          date,
        },
      },
    });

    const carried =
      body.opening != null
        ? body.opening
        : existing
          ? dec(existing.opening)
          : body.carry_opening !== false
            ? await previousBalance(userId, body.stock_item_id, date)
            : 0;

    const row = await prisma.stockLedgerDay.upsert({
      where: {
        userId_stockItemId_date: {
          userId,
          stockItemId: body.stock_item_id,
          date,
        },
      },
      create: {
        userId,
        stockItemId: body.stock_item_id,
        date,
        opening: carried,
        received: body.received ?? 0,
        used: body.used ?? 0,
        waste: body.waste ?? 0,
        expenditure: body.expenditure ?? 0,
        unitCost: body.unit_cost ?? null,
        notes: body.notes ?? null,
      },
      update: {
        opening: body.opening,
        received: body.received,
        used: body.used,
        waste: body.waste,
        expenditure: body.expenditure,
        unitCost: body.unit_cost === undefined ? undefined : body.unit_cost,
        notes: body.notes,
      },
    });

    const opening = dec(row.opening);
    const received = dec(row.received);
    const used = dec(row.used);
    res.json({
      id: row.id,
      stock_item_id: row.stockItemId,
      date: ymd(row.date),
      opening,
      received,
      used,
      waste: dec(row.waste),
      expenditure: dec(row.expenditure),
      unit_cost: row.unitCost != null ? dec(row.unitCost) : null,
      balance: balanceOf(opening, received, used),
      notes: row.notes,
    });
  }),
);

stockRouter.get(
  "/shopping-list",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const q = z
      .object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
      .parse(req.query);
    const date = parseYmd(q.date);
    await ensureKitchenStockSeed(userId);

    const [orders, extras, items] = await Promise.all([
      prisma.breakfastOrder.findMany({
        where: { userId, breakfastDate: date },
        include: { room: true },
      }),
      prisma.roomDayExtras.findMany({
        where: { userId, date },
        include: { room: true },
      }),
      prisma.stockItem.findMany({ where: { userId, isActive: true } }),
    ]);

    const orderLikes: OrderLike[] = orders.map((o) => ({
      breakfastType: o.breakfastType,
      eggStyle: o.eggStyle,
      potato: o.potato,
      juice: o.juice,
      tea: o.tea,
      coffee: o.coffee,
      milk: o.milk,
      sugar: o.sugar,
      status: o.status,
      servingTime: o.servingTime,
      outsideNormalWindow: o.outsideNormalWindow,
      specialRequests: o.specialRequests,
      roomNumber: o.room.number,
      guestNumber: o.guestNumber,
    }));
    const extrasLikes: ExtrasLike[] = extras.map((e) => ({
      roomNumber: e.room.number,
      fruits: e.fruits,
      pancake: e.pancake,
      honey: e.honey,
      nutella: e.nutella,
      cereal: e.cereal,
      waterBottle: e.waterBottle,
    }));

    const needs = computeIngredientNeeds(orderLikes, extrasLikes);
    const byCode = new Map(items.filter((i) => i.code).map((i) => [i.code!, i]));

    const lines = [];
    for (const [code, required] of needs.entries()) {
      const item = byCode.get(code);
      if (!item) continue;
      const ledger = await prisma.stockLedgerDay.findUnique({
        where: {
          userId_stockItemId_date: { userId, stockItemId: item.id, date },
        },
      });
      let bal: number;
      if (ledger) {
        bal = balanceOf(dec(ledger.opening), dec(ledger.received), dec(ledger.used));
      } else {
        bal = await previousBalance(userId, item.id, date);
      }
      const toBuy = Math.max(0, required - bal);
      lines.push({
        code,
        stock_item_id: item.id,
        name: item.name,
        unit: item.unit,
        required,
        on_hand: bal,
        to_buy: toBuy,
        use_notes: item.useNotes,
        pack_info: item.packInfo,
      });
    }

    lines.sort((a, b) => a.name.localeCompare(b.name));
    res.json({
      date: q.date,
      items: lines,
      buy_items: lines.filter((l) => l.to_buy > 0),
    });
  }),
);

const reportQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

stockRouter.get(
  "/reports",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const q = reportQuery.parse(req.query);
    const from = parseYmd(q.from);
    const to = parseYmd(q.to);
    await ensureKitchenStockSeed(userId);

    const [ledgers, orders] = await Promise.all([
      prisma.stockLedgerDay.findMany({
        where: { userId, date: { gte: from, lte: to } },
        include: { stockItem: true },
        orderBy: { date: "asc" },
      }),
      prisma.breakfastOrder.findMany({
        where: {
          userId,
          breakfastDate: { gte: from, lte: to },
          status: { not: "cancelled" },
        },
      }),
    ]);

    const guestCount = orders.length;
    let totalExpenditure = 0;
    let totalWaste = 0;
    let totalUsed = 0;

    const consumptionByItem = new Map<
      string,
      { name: string; unit: string; used: number; waste: number; expenditure: number }
    >();

    for (const l of ledgers) {
      const used = dec(l.used);
      const waste = dec(l.waste);
      const exp = dec(l.expenditure);
      totalUsed += used;
      totalWaste += waste;
      totalExpenditure += exp;
      const key = l.stockItemId;
      const cur = consumptionByItem.get(key) ?? {
        name: l.stockItem.name,
        unit: l.stockItem.unit,
        used: 0,
        waste: 0,
        expenditure: 0,
      };
      cur.used += used;
      cur.waste += waste;
      cur.expenditure += exp;
      consumptionByItem.set(key, cur);
    }

    const costPerGuest = guestCount > 0 ? totalExpenditure / guestCount : null;

    res.json({
      from: q.from,
      to: q.to,
      guest_count: guestCount,
      ingredient_consumption: [...consumptionByItem.entries()].map(([id, v]) => ({
        stock_item_id: id,
        name: v.name,
        unit: v.unit,
        used: v.used,
        waste: v.waste,
        expenditure: v.expenditure,
      })),
      expenditure: totalExpenditure,
      cost_per_guest: costPerGuest,
      food_waste: {
        total_waste_qty: totalWaste,
        total_used_qty: totalUsed,
        lines: [...consumptionByItem.entries()]
          .filter(([, v]) => v.waste > 0)
          .map(([id, v]) => ({
            stock_item_id: id,
            name: v.name,
            unit: v.unit,
            waste: v.waste,
          })),
      },
    });
  }),
);
