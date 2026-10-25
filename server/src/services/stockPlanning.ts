/**
 * Stock planning: apply breakfast usage to the ledger, and build shopping lists
 * that cover order requirements and min-stock thresholds.
 */
import { prisma } from "../lib/prisma.js";
import { dec, parseYmd, ymd } from "../lib/dates.js";
import {
  computeIngredientNeeds,
  type ExtrasLike,
  type OrderLike,
} from "./breakfastRequirements.js";

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

/** On-hand available for planning = opening + received (before kitchen Used). */
async function availableForDate(
  userId: string,
  stockItemId: string,
  date: Date,
): Promise<{ opening: number; received: number; used: number; available: number }> {
  const ledger = await prisma.stockLedgerDay.findUnique({
    where: {
      userId_stockItemId_date: { userId, stockItemId, date },
    },
  });
  if (ledger) {
    const opening = dec(ledger.opening);
    const received = dec(ledger.received);
    const used = dec(ledger.used);
    return { opening, received, used, available: opening + received };
  }
  const opening = await previousBalance(userId, stockItemId, date);
  return { opening, received: 0, used: 0, available: opening };
}

async function loadOrderExtras(userId: string, date: Date) {
  const [orders, extras] = await Promise.all([
    prisma.breakfastOrder.findMany({
      where: { userId, breakfastDate: date },
      include: { room: true },
    }),
    prisma.roomDayExtras.findMany({
      where: { userId, date },
      include: { room: true },
    }),
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

  return { orderLikes, extrasLikes };
}

/**
 * Write computed breakfast ingredient needs into StockLedgerDay.used for the date.
 * Idempotent: replaces Used with the current requirement total for kitchen-coded items.
 */
export async function applyKitchenUsageForDate(userId: string, dateStr: string) {
  const date = parseYmd(dateStr);
  const { orderLikes, extrasLikes } = await loadOrderExtras(userId, date);
  const needs = computeIngredientNeeds(orderLikes, extrasLikes);

  const items = await prisma.stockItem.findMany({
    where: { userId, kind: "kitchen", isActive: true },
  });
  const byCode = new Map(items.filter((i) => i.code).map((i) => [i.code!, i]));

  const updated: string[] = [];
  const touchedIds = new Set<string>();

  for (const [code, qty] of needs.entries()) {
    const item = byCode.get(code);
    if (!item) continue;
    touchedIds.add(item.id);

    const opening = await previousBalance(userId, item.id, date);
    await prisma.stockLedgerDay.upsert({
      where: {
        userId_stockItemId_date: { userId, stockItemId: item.id, date },
      },
      create: {
        userId,
        stockItemId: item.id,
        date,
        opening,
        received: 0,
        used: qty,
        waste: 0,
        expenditure: 0,
      },
      update: {
        used: qty,
      },
    });
    updated.push(code);
  }

  // Clear Used on kitchen catalog lines no longer required for this date
  const stale = await prisma.stockLedgerDay.findMany({
    where: {
      userId,
      date,
      stockItemId: { in: items.map((i) => i.id) },
      used: { gt: 0 },
    },
  });
  for (const row of stale) {
    if (touchedIds.has(row.stockItemId)) continue;
    await prisma.stockLedgerDay.update({
      where: { id: row.id },
      data: { used: 0 },
    });
  }

  return { date: dateStr, updated_codes: updated };
}

export type ShoppingReason = "order_shortfall" | "min_stock" | "missing_item";

export type ShoppingLine = {
  code: string;
  stock_item_id: string | null;
  name: string;
  unit: string;
  required: number;
  on_hand: number;
  min_stock: number;
  to_buy: number;
  projected_after_use: number;
  reasons: ShoppingReason[];
  use_notes: string | null;
  pack_info: string | null;
};

/**
 * Shopping list for a breakfast date.
 * Available stock = opening + received (does not subtract Used — avoids double-count with apply-usage).
 * to_buy = max(0, required + min_stock − available) so orders are covered and balance stays ≥ min.
 * Also lists active items below min even with no order requirement.
 */
export async function buildShoppingListForDate(userId: string, dateStr: string) {
  const date = parseYmd(dateStr);
  const { orderLikes, extrasLikes } = await loadOrderExtras(userId, date);
  const needs = computeIngredientNeeds(orderLikes, extrasLikes);

  const items = await prisma.stockItem.findMany({
    where: { userId, isActive: true },
  });
  const byCode = new Map(items.filter((i) => i.code).map((i) => [i.code!, i]));

  const lines: ShoppingLine[] = [];
  const seen = new Set<string>();

  for (const [code, required] of needs.entries()) {
    const item = byCode.get(code);
    if (!item) {
      lines.push({
        code,
        stock_item_id: null,
        name: code.replace(/_/g, " "),
        unit: "",
        required,
        on_hand: 0,
        min_stock: 0,
        to_buy: required,
        projected_after_use: -required,
        reasons: ["missing_item", "order_shortfall"],
        use_notes: "Not in inventory catalog — add stock item or buy full requirement",
        pack_info: null,
      });
      seen.add(code);
      continue;
    }

    const { available } = await availableForDate(userId, item.id, date);
    const minStock = dec(item.minStock);
    // Cover orders and leave at least min_stock after use
    const toBuy = Math.max(0, required + minStock - available);
    const projected = available + toBuy - required;
    const reasons: ShoppingReason[] = [];
    if (available < required) reasons.push("order_shortfall");
    if (available - required < minStock && minStock > 0) reasons.push("min_stock");
    if (toBuy > 0 && reasons.length === 0) reasons.push("min_stock");

    lines.push({
      code,
      stock_item_id: item.id,
      name: item.name,
      unit: item.unit,
      required,
      on_hand: available,
      min_stock: minStock,
      to_buy: toBuy,
      projected_after_use: projected,
      reasons: toBuy > 0 ? reasons : [],
      use_notes: item.useNotes,
      pack_info: item.packInfo,
    });
    seen.add(code);
  }

  // Items below min with no breakfast requirement still need replenishment
  for (const item of items) {
    if (!item.code || seen.has(item.code)) continue;
    const minStock = dec(item.minStock);
    if (minStock <= 0) continue;
    const { available } = await availableForDate(userId, item.id, date);
    if (available >= minStock) continue;
    const toBuy = minStock - available;
    lines.push({
      code: item.code,
      stock_item_id: item.id,
      name: item.name,
      unit: item.unit,
      required: 0,
      on_hand: available,
      min_stock: minStock,
      to_buy: toBuy,
      projected_after_use: available + toBuy,
      reasons: ["min_stock"],
      use_notes: item.useNotes,
      pack_info: item.packInfo,
    });
  }

  lines.sort((a, b) => {
    if (a.to_buy > 0 && b.to_buy === 0) return -1;
    if (a.to_buy === 0 && b.to_buy > 0) return 1;
    return a.name.localeCompare(b.name);
  });

  const buy_items = lines.filter((l) => l.to_buy > 0);
  return {
    date: dateStr,
    items: lines,
    buy_items,
    summary: {
      buy_line_count: buy_items.length,
      order_shortfall_count: buy_items.filter((l) => l.reasons.includes("order_shortfall")).length,
      min_stock_count: buy_items.filter((l) => l.reasons.includes("min_stock")).length,
      missing_item_count: buy_items.filter((l) => l.reasons.includes("missing_item")).length,
    },
  };
}

export async function shoppingSummaryForDate(userId: string, dateStr: string) {
  const list = await buildShoppingListForDate(userId, dateStr);
  return list.summary;
}

export { ymd };
