import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { dec, parseYmd, ymd } from "../lib/dates.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { scopeOrganizationData } from "../middleware/orgScope.js";
import { asyncHandler } from "../utils/http.js";
import { ensureKitchenStockSeed } from "../services/kitchenSeed.js";
import { buildShoppingListForDate } from "../services/stockPlanning.js";
import { mapProductDto, mapStockItemDto, stockUnitsOf } from "../lib/stockDto.js";
import {
  buildUnitsList,
  type BaseUnit,
  productRefillToBase,
  roundQty,
  roundUnitCost,
  toBase,
  fromBase,
} from "../lib/units.js";

export const stockRouter = Router();
stockRouter.use(requireAuth);
stockRouter.use(scopeOrganizationData);

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

/** Latest ledger before `beforeDate` for many items — one query instead of N. */
async function previousBalancesByItem(
  userId: string,
  stockItemIds: string[],
  beforeDate: Date,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (stockItemIds.length === 0) return out;

  const rows = await prisma.stockLedgerDay.findMany({
    where: {
      userId,
      stockItemId: { in: stockItemIds },
      date: { lt: beforeDate },
    },
    orderBy: [{ stockItemId: "asc" }, { date: "desc" }],
    select: {
      stockItemId: true,
      opening: true,
      received: true,
      used: true,
    },
  });

  for (const row of rows) {
    if (out.has(row.stockItemId)) continue;
    out.set(
      row.stockItemId,
      balanceOf(dec(row.opening), dec(row.received), dec(row.used)),
    );
  }
  return out;
}

function normalizeBase(raw: string | undefined): BaseUnit {
  if (raw === "g" || raw === "ml" || raw === "pcs") return raw;
  return "pcs";
}

function unitsFromBody(opts: {
  base_unit?: string;
  measure?: "weight" | "volume" | "count";
  display_unit?: string;
  piece_label?: string | null;
  packs?: Array<{ code: string; label: string; to_base: number }>;
  unit?: string;
}) {
  const base: BaseUnit =
    opts.base_unit === "g" || opts.base_unit === "ml" || opts.base_unit === "pcs"
      ? opts.base_unit
      : opts.measure === "weight"
        ? "g"
        : opts.measure === "volume"
          ? "ml"
          : "pcs";
  const packs = opts.packs ?? [];
  const pieceLabel = opts.piece_label ?? (base === "pcs" ? opts.unit ?? "pcs" : undefined);
  const units = buildUnitsList(base, packs, pieceLabel);
  const displayUnit =
    opts.display_unit ||
    (base === "g" ? "kg" : base === "ml" ? "L" : packs[0]?.code || "pcs");
  const unitLabel =
    units.find((u) => u.code === displayUnit)?.label ||
    pieceLabel ||
    displayUnit;
  return { base, displayUnit, units, unitLabel };
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

    res.json({ items: items.map(mapStockItemDto) });
  }),
);

stockRouter.get(
  "/items/:id",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const id = z.string().uuid().parse(req.params.id);
    const item = await prisma.stockItem.findFirst({ where: { id, userId } });
    if (!item) {
      res.status(404).json({ error: "Item not found" });
      return;
    }
    const productCount = await prisma.stockProduct.count({
      where: { stockItemId: id, isActive: true },
    });
    res.json({ ...mapStockItemDto(item), product_count: productCount });
  }),
);

const packSchema = z.object({
  code: z.string().min(1).max(40),
  label: z.string().min(1).max(80),
  to_base: z.number().positive(),
});

const createItemSchema = z.object({
  name: z.string().min(1).max(200),
  kind: z.enum(["kitchen", "other"]).default("kitchen"),
  measure: z.enum(["weight", "volume", "count"]).optional(),
  base_unit: z.enum(["g", "ml", "pcs"]).optional(),
  display_unit: z.string().min(1).max(50).optional(),
  unit: z.string().min(1).max(50).optional(),
  piece_label: z.string().max(50).optional().nullable(),
  packs: z.array(packSchema).optional(),
  min_stock: z.number().min(0).optional(),
  min_stock_unit: z.string().max(50).optional(),
  use_notes: z.string().max(2000).optional().nullable(),
  pack_info: z.string().max(500).optional().nullable(),
});

stockRouter.post(
  "/items",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const body = createItemSchema.parse(req.body);
    const { base, displayUnit, units, unitLabel } = unitsFromBody(body);
    const minInput = body.min_stock ?? 0;
    const minUnit = body.min_stock_unit || displayUnit;
    const minBase = toBase(minInput, minUnit, units, base);

    const item = await prisma.stockItem.create({
      data: {
        userId,
        code: null,
        name: body.name,
        unit: unitLabel,
        baseUnit: base,
        displayUnit,
        units,
        kind: body.kind,
        minStock: minBase,
        useNotes: body.use_notes ?? null,
        packInfo: body.pack_info ?? null,
        sortOrder: 1000,
      },
    });
    res.status(201).json(mapStockItemDto(item));
  }),
);

const patchItemSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  measure: z.enum(["weight", "volume", "count"]).optional(),
  base_unit: z.enum(["g", "ml", "pcs"]).optional(),
  display_unit: z.string().min(1).max(50).optional(),
  unit: z.string().min(1).max(50).optional(),
  piece_label: z.string().max(50).optional().nullable(),
  packs: z.array(packSchema).optional(),
  min_stock: z.number().min(0).optional(),
  min_stock_unit: z.string().max(50).optional(),
  use_notes: z.string().max(2000).optional().nullable(),
  pack_info: z.string().max(500).optional().nullable(),
  is_active: z.boolean().optional(),
  /** When true and piece→gram size changes, rescale ledger + recipes. */
  rescale_existing: z.boolean().optional(),
  /** New grams per piece when converting a count item to weight via can size. */
  piece_to_base: z.number().positive().optional(),
  piece_code: z.string().max(40).optional(),
  piece_unit_label: z.string().max(80).optional(),
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

    let baseUnit = normalizeBase(existing.baseUnit);
    let displayUnit = existing.displayUnit || existing.unit;
    let units = stockUnitsOf(existing).units;
    let unitLabel = existing.unit;
    let rescaleFactor: number | null = null;

    // First-time can/piece weight: pcs → g with piece_to_base
    if (
      body.piece_to_base != null &&
      body.piece_to_base > 0 &&
      (existing.baseUnit === "pcs" || !existing.baseUnit)
    ) {
      const pieceCode = body.piece_code || "can";
      const pieceLabel = body.piece_unit_label || pieceCode;
      const grams = body.piece_to_base;
      baseUnit = "g";
      displayUnit = body.display_unit || pieceCode;
      units = buildUnitsList(
        "g",
        [
          { code: pieceCode, label: pieceLabel, to_base: grams },
          ...(body.packs ?? []),
        ],
        pieceLabel,
      );
      unitLabel = pieceLabel;
      rescaleFactor = grams;
    } else if (
      body.base_unit != null ||
      body.measure != null ||
      body.packs != null ||
      body.display_unit != null ||
      body.piece_label !== undefined
    ) {
      const built = unitsFromBody({
        base_unit: body.base_unit ?? baseUnit,
        measure: body.measure,
        display_unit: body.display_unit ?? displayUnit,
        piece_label: body.piece_label,
        packs: body.packs,
        unit: body.unit ?? unitLabel,
      });
      // Detect pack size change for rescale
      if (body.rescale_existing && body.packs?.length) {
        const oldCan = units.find((u) => u.kind === "pack");
        const newCan = body.packs[0];
        if (oldCan && newCan && oldCan.to_base > 0 && newCan.to_base !== oldCan.to_base) {
          rescaleFactor = newCan.to_base / oldCan.to_base;
        }
      }
      baseUnit = built.base;
      displayUnit = built.displayUnit;
      units = built.units;
      unitLabel = built.unitLabel;
    } else if (body.unit) {
      unitLabel = body.unit;
    }

    let minStock = dec(existing.minStock);
    if (body.min_stock != null) {
      const minUnit = body.min_stock_unit || displayUnit;
      minStock = toBase(body.min_stock, minUnit, units, baseUnit);
    } else if (rescaleFactor != null) {
      minStock = roundQty(minStock * rescaleFactor);
    }

    if (rescaleFactor != null && rescaleFactor !== 1) {
      const ledgers = await prisma.stockLedgerDay.findMany({ where: { stockItemId: id } });
      for (const row of ledgers) {
        await prisma.stockLedgerDay.update({
          where: { id: row.id },
          data: {
            opening: roundQty(dec(row.opening) * rescaleFactor),
            received: roundQty(dec(row.received) * rescaleFactor),
            used: roundQty(dec(row.used) * rescaleFactor),
            waste: roundQty(dec(row.waste) * rescaleFactor),
            unitCost:
              row.unitCost != null
                ? roundUnitCost(dec(row.unitCost) / rescaleFactor)
                : null,
          },
        });
      }
      const lines = await prisma.recipeLine.findMany({ where: { stockItemId: id } });
      for (const line of lines) {
        await prisma.recipeLine.update({
          where: { id: line.id },
          data: {
            qtyPerServing: roundQty(dec(line.qtyPerServing) * rescaleFactor),
          },
        });
      }
      const menuLines = await prisma.mealMenuLine.findMany({
        where: { stockItemId: id },
      });
      for (const line of menuLines) {
        await prisma.mealMenuLine.update({
          where: { id: line.id },
          data: {
            qtyPerServing: roundQty(dec(line.qtyPerServing) * rescaleFactor),
          },
        });
      }
      if (existing.lastUnitCost != null) {
        await prisma.stockItem.update({
          where: { id },
          data: {
            lastUnitCost: roundUnitCost(dec(existing.lastUnitCost) / rescaleFactor),
          },
        });
      }
    }

    const item = await prisma.stockItem.update({
      where: { id },
      data: {
        name: body.name,
        unit: unitLabel,
        baseUnit,
        displayUnit,
        units,
        minStock,
        useNotes: body.use_notes,
        packInfo: body.pack_info,
        isActive: body.is_active,
      },
    });
    res.json(mapStockItemDto(item));
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
      await prisma.stockItem.update({
        where: { id },
        data: { isActive: false },
      });
      res.status(204).send();
      return;
    }
    await prisma.$transaction([
      prisma.stockProduct.deleteMany({ where: { stockItemId: id } }),
      prisma.stockLedgerDay.deleteMany({ where: { stockItemId: id } }),
      prisma.stockItem.delete({ where: { id } }),
    ]);
    res.status(204).send();
  }),
);

/* ---------- Products ---------- */

stockRouter.get(
  "/products",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    await ensureKitchenStockSeed(userId);
    const stockItemId =
      typeof req.query.stock_item_id === "string" ? req.query.stock_item_id : undefined;
    if (stockItemId) z.string().uuid().parse(stockItemId);

    const products = await prisma.stockProduct.findMany({
      where: {
        userId,
        isActive: true,
        ...(stockItemId ? { stockItemId } : {}),
      },
      include: { stockItem: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    res.json({ items: products.map(mapProductDto) });
  }),
);

stockRouter.get(
  "/products/:id",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const id = z.string().uuid().parse(req.params.id);
    const product = await prisma.stockProduct.findFirst({
      where: { id, userId },
      include: { stockItem: true },
    });
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    res.json(mapProductDto(product));
  }),
);

const productBodySchema = z.object({
  name: z.string().min(1).max(200),
  stock_item_id: z.string().uuid(),
  description: z.string().max(2000).optional().nullable(),
  qty: z.number().positive(),
  unit_code: z.string().min(1).max(50),
  default_price: z.number().min(0).optional().nullable(),
  sort_order: z.number().int().optional(),
});

stockRouter.post(
  "/products",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const body = productBodySchema.parse(req.body);
    const item = await prisma.stockItem.findFirst({
      where: { id: body.stock_item_id, userId, isActive: true },
    });
    if (!item) {
      res.status(400).json({ error: "Stock item not found" });
      return;
    }
    const { units, baseUnit } = stockUnitsOf(item);
    if (!units.some((u) => u.code === body.unit_code) && body.unit_code !== baseUnit) {
      // Allow unit codes that match base or listed units
      const ok =
        body.unit_code === baseUnit ||
        units.some((u) => u.code.toLowerCase() === body.unit_code.toLowerCase());
      if (!ok) {
        res.status(400).json({
          error: `Unit “${body.unit_code}” is not available on this stock item`,
        });
        return;
      }
    }
    const created = await prisma.stockProduct.create({
      data: {
        userId,
        stockItemId: body.stock_item_id,
        name: body.name,
        description: body.description ?? null,
        qty: body.qty,
        unitCode: body.unit_code,
        defaultPrice: body.default_price ?? null,
        sortOrder: body.sort_order ?? 0,
      },
      include: { stockItem: true },
    });
    res.status(201).json(mapProductDto(created));
  }),
);

stockRouter.put(
  "/products/:id",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const id = z.string().uuid().parse(req.params.id);
    const body = productBodySchema.partial().extend({
      is_active: z.boolean().optional(),
    }).parse(req.body);
    const existing = await prisma.stockProduct.findFirst({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    if (body.stock_item_id) {
      const item = await prisma.stockItem.findFirst({
        where: { id: body.stock_item_id, userId },
      });
      if (!item) {
        res.status(400).json({ error: "Stock item not found" });
        return;
      }
    }
    const updated = await prisma.stockProduct.update({
      where: { id },
      data: {
        name: body.name,
        stockItemId: body.stock_item_id,
        description: body.description,
        qty: body.qty,
        unitCode: body.unit_code,
        defaultPrice: body.default_price,
        sortOrder: body.sort_order,
        isActive: body.is_active,
      },
      include: { stockItem: true },
    });
    res.json(mapProductDto(updated));
  }),
);

stockRouter.delete(
  "/products/:id",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const id = z.string().uuid().parse(req.params.id);
    const existing = await prisma.stockProduct.findFirst({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    await prisma.stockProduct.update({
      where: { id },
      data: { isActive: false },
    });
    res.status(204).send();
  }),
);

/* ---------- Inventory / ledger ---------- */

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
      include: {
        _count: { select: { products: { where: { isActive: true } } } },
      },
    });

    const itemIds = items.map((i) => i.id);
    const ledgers = await prisma.stockLedgerDay.findMany({
      where: {
        userId,
        date,
        stockItemId: { in: itemIds },
      },
    });
    const byItem = new Map(ledgers.map((l) => [l.stockItemId, l]));
    const missingIds = itemIds.filter((id) => !byItem.has(id));
    const openingByItem = await previousBalancesByItem(userId, missingIds, date);

    const rows = [];
    for (const item of items) {
      const mapped = mapStockItemDto(item);
      const lastUnitCost = mapped.last_unit_cost;
      const productCount = item._count.products;
      let ledger = byItem.get(item.id);
      if (!ledger) {
        const opening = openingByItem.get(item.id) ?? 0;
        rows.push({
          stock_item_id: item.id,
          code: mapped.code,
          name: mapped.name,
          unit: mapped.unit,
          base_unit: mapped.base_unit,
          display_unit: mapped.display_unit,
          units: mapped.units,
          kind: mapped.kind,
          use_notes: mapped.use_notes,
          pack_info: mapped.pack_info,
          min_stock: mapped.min_stock,
          opening,
          received: 0,
          used: 0,
          waste: 0,
          expenditure: 0,
          unit_cost: lastUnitCost,
          last_unit_cost: lastUnitCost,
          balance: opening,
          below_min: mapped.min_stock > 0 && opening <= mapped.min_stock,
          ledger_id: null as string | null,
          product_count: productCount,
        });
      } else {
        const opening = dec(ledger.opening);
        const received = dec(ledger.received);
        const used = dec(ledger.used);
        const bal = balanceOf(opening, received, used);
        const dayUnit =
          ledger.unitCost != null ? dec(ledger.unitCost) : lastUnitCost;
        rows.push({
          stock_item_id: item.id,
          code: mapped.code,
          name: mapped.name,
          unit: mapped.unit,
          base_unit: mapped.base_unit,
          display_unit: mapped.display_unit,
          units: mapped.units,
          kind: mapped.kind,
          use_notes: mapped.use_notes,
          pack_info: mapped.pack_info,
          min_stock: mapped.min_stock,
          opening,
          received,
          used,
          waste: dec(ledger.waste),
          expenditure: dec(ledger.expenditure),
          unit_cost: dayUnit,
          last_unit_cost: lastUnitCost,
          balance: bal,
          below_min: mapped.min_stock > 0 && bal <= mapped.min_stock,
          ledger_id: ledger.id,
          product_count: productCount,
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
  carry_opening: z.boolean().optional(),
  /** When set, quantities above are in this unit (converted to base). */
  qty_unit: z.string().max(50).optional(),
  /** Product-based refill */
  product_id: z.string().uuid().optional(),
  product_count: z.number().positive().optional(),
  product_unit_price: z.number().min(0).optional(),
  /** Add onto existing received (refill) instead of replacing. */
  add_received: z.boolean().optional(),
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
    const { baseUnit, units } = stockUnitsOf(item);
    const qtyUnit = body.qty_unit || item.displayUnit || baseUnit;

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
        ? toBase(body.opening, qtyUnit, units, baseUnit)
        : existing
          ? dec(existing.opening)
          : body.carry_opening !== false
            ? await previousBalance(userId, body.stock_item_id, date)
            : 0;

    let addBase = 0;
    let addSpend = 0;
    let refillUnitCost: number | null = null;

    if (body.product_id) {
      const product = await prisma.stockProduct.findFirst({
        where: {
          id: body.product_id,
          userId,
          stockItemId: body.stock_item_id,
          isActive: true,
        },
      });
      if (!product) {
        res.status(400).json({ error: "Product not found for this stock item" });
        return;
      }
      const count = body.product_count ?? 1;
      const price =
        body.product_unit_price ??
        (product.defaultPrice != null ? dec(product.defaultPrice) : null);
      if (price == null || !(price >= 0)) {
        res.status(400).json({ error: "Enter a price for this product" });
        return;
      }
      const converted = productRefillToBase({
        count,
        productQty: dec(product.qty),
        productUnit: product.unitCode,
        pricePerProduct: price,
        units,
        baseUnit,
      });
      addBase = converted.baseQty;
      addSpend = converted.expenditure;
      refillUnitCost = converted.unitCost;
    }

    let receivedQty: number;
    if (body.add_received || body.product_id) {
      const prevReceived = existing ? dec(existing.received) : 0;
      if (body.product_id) {
        receivedQty = prevReceived + addBase;
      } else if (body.received != null) {
        receivedQty =
          prevReceived + toBase(body.received, qtyUnit, units, baseUnit);
      } else {
        receivedQty = prevReceived;
      }
    } else if (body.received != null) {
      receivedQty = toBase(body.received, qtyUnit, units, baseUnit);
    } else {
      receivedQty = existing ? dec(existing.received) : 0;
    }

    let expenditure =
      body.expenditure !== undefined
        ? body.expenditure
        : body.product_id
          ? (existing ? dec(existing.expenditure) : 0) + addSpend
          : undefined;

    let unitCostToStore: number | null | undefined =
      refillUnitCost != null
        ? refillUnitCost
        : body.unit_cost !== undefined
          ? body.unit_cost != null
            ? // If client sent price per qty_unit, convert to per-base
              body.qty_unit
              ? roundUnitCost(
                  toBase(1, qtyUnit, units, baseUnit) > 0
                    ? body.unit_cost / toBase(1, qtyUnit, units, baseUnit)
                    : body.unit_cost,
                )
              : body.unit_cost
            : null
          : undefined;

    if (
      expenditure === undefined &&
      unitCostToStore != null &&
      receivedQty > 0 &&
      (body.received != null || body.unit_cost != null) &&
      !body.product_id
    ) {
      const prevExp = existing ? dec(existing.expenditure) : 0;
      const prevRec = existing ? dec(existing.received) : 0;
      const added = Math.max(0, receivedQty - prevRec);
      expenditure =
        body.add_received
          ? Math.round((prevExp + added * unitCostToStore) * 100) / 100
          : Math.round(receivedQty * unitCostToStore * 100) / 100;
    }

    if (
      unitCostToStore === undefined &&
      existing?.unitCost == null &&
      receivedQty > 0 &&
      expenditure != null &&
      expenditure > 0
    ) {
      unitCostToStore = roundUnitCost(expenditure / receivedQty);
    }

    const resolvedUnitCost =
      unitCostToStore !== undefined
        ? unitCostToStore
        : existing?.unitCost != null
          ? dec(existing.unitCost)
          : item.lastUnitCost != null
            ? dec(item.lastUnitCost)
            : null;

    const createUnitCost =
      unitCostToStore !== undefined ? unitCostToStore : resolvedUnitCost;

    const usedQty =
      body.used != null
        ? toBase(body.used, qtyUnit, units, baseUnit)
        : existing
          ? dec(existing.used)
          : 0;
    const wasteQty =
      body.waste != null
        ? toBase(body.waste, qtyUnit, units, baseUnit)
        : existing
          ? dec(existing.waste)
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
        received: receivedQty,
        used: body.used != null ? usedQty : 0,
        waste: body.waste != null ? wasteQty : 0,
        expenditure: expenditure ?? 0,
        unitCost: createUnitCost,
        notes: body.notes ?? null,
      },
      update: {
        opening: body.opening != null ? carried : undefined,
        received: receivedQty,
        used: body.used != null ? usedQty : undefined,
        waste: body.waste != null ? wasteQty : undefined,
        expenditure,
        unitCost: unitCostToStore,
        notes: body.notes,
      },
    });

    const catalogUnit =
      unitCostToStore != null
        ? unitCostToStore
        : row.unitCost != null
          ? dec(row.unitCost)
          : null;
    if (catalogUnit != null && catalogUnit >= 0) {
      await prisma.stockItem.update({
        where: { id: body.stock_item_id },
        data: { lastUnitCost: catalogUnit },
      });
    }

    const opening = dec(row.opening);
    const received = dec(row.received);
    const used = dec(row.used);
    const refreshed = await prisma.stockItem.findUnique({
      where: { id: body.stock_item_id },
      select: { lastUnitCost: true },
    });
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
      last_unit_cost:
        refreshed?.lastUnitCost != null ? dec(refreshed.lastUnitCost) : null,
      balance: balanceOf(opening, received, used),
      notes: row.notes,
      display_unit: item.displayUnit,
      base_unit: baseUnit,
      display_balance: fromBase(
        balanceOf(opening, received, used),
        item.displayUnit || baseUnit,
        units,
        baseUnit,
      ),
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
    await ensureKitchenStockSeed(userId);
    const list = await buildShoppingListForDate(userId, q.date);
    res.json(list);
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
