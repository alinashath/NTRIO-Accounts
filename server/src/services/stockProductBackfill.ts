/**
 * Configure StockProduct rows from:
 * 1. Kitchen catalog seed products (via ensureKitchenStockSeed)
 * 2. Grocery bill / past purchase hints
 * 3. Existing stock item packs + display unit
 * 4. Ledger history (defaultPrice from lastUnitCost / recent received)
 */
import { prisma } from "../lib/prisma.js";
import { findGroceryHint } from "../data/groceryProductHints.js";
import { stockUnitsOf } from "../lib/stockDto.js";
import {
  type BaseUnit,
  type StockUnitDef,
  type StockUnitsJson,
  roundMoney,
  toBase,
} from "../lib/units.js";

const SKIP_CODES = new Set([
  "potato_portion",
  "pancake_batch",
  "roshi",
  "mashuni",
  "egg_style",
]);

function shouldSkipItem(item: { code: string | null; name: string }): boolean {
  if (item.code && SKIP_CODES.has(item.code)) return true;
  const n = item.name.toLowerCase();
  return n.includes("(prep)") || n.includes("prepared");
}

function resolveUnitCode(units: StockUnitsJson, want: string, baseUnit: BaseUnit): string {
  const found = units.find((u) => u.code.toLowerCase() === want.toLowerCase());
  if (found) return found.code;
  if (want.toLowerCase() === baseUnit) return baseUnit;
  return want;
}

function ensureUnitOnItem(
  units: StockUnitsJson,
  code: string,
  label: string,
  toBaseFactor: number,
  kind: "standard" | "pack" = "standard",
): StockUnitsJson {
  if (units.some((u) => u.code.toLowerCase() === code.toLowerCase())) return units;
  return [
    ...units,
    { code, label: label || code, to_base: toBaseFactor > 0 ? toBaseFactor : 1, kind },
  ];
}

function productBaseQty(
  qty: number,
  unitCode: string,
  units: StockUnitsJson,
  baseUnit: BaseUnit,
): number {
  try {
    return toBase(qty, unitCode, units, baseUnit);
  } catch {
    return qty;
  }
}

function priceFromUnitCost(
  unitCost: number | null,
  qty: number,
  unitCode: string,
  units: StockUnitsJson,
  baseUnit: BaseUnit,
): number | null {
  if (unitCost == null || !(unitCost >= 0)) return null;
  const base = productBaseQty(qty, unitCode, units, baseUnit);
  if (!(base > 0)) return null;
  return roundMoney(unitCost * base);
}

/** Mode of positive received values (as integers when close). */
function receivedModes(values: number[]): Array<{ value: number; count: number }> {
  const counts = new Map<number, number>();
  for (const v of values) {
    if (!(v > 0)) continue;
    const key = Math.abs(v - Math.round(v)) < 1e-6 ? Math.round(v) : Math.round(v * 1000) / 1000;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || b.value - a.value);
}

type Pending = {
  userId: string;
  stockItemId: string;
  name: string;
  description: string | null;
  qty: number;
  unitCode: string;
  defaultPrice: number | null;
  sortOrder: number;
};

/** Soft-delete duplicate products (same stock item + name); keep the best-priced row. */
export async function dedupeStockProducts(userId: string): Promise<number> {
  const products = await prisma.stockProduct.findMany({
    where: { userId, isActive: true },
    orderBy: [{ createdAt: "asc" }],
  });
  const keep = new Map<string, (typeof products)[0]>();
  const deactivate: string[] = [];
  for (const p of products) {
    const key = `${p.stockItemId}\0${p.name.trim().toLowerCase()}`;
    const prev = keep.get(key);
    if (!prev) {
      keep.set(key, p);
      continue;
    }
    // Prefer row with a default price; otherwise keep the older one.
    if (prev.defaultPrice == null && p.defaultPrice != null) {
      deactivate.push(prev.id);
      keep.set(key, p);
    } else {
      deactivate.push(p.id);
    }
  }
  if (deactivate.length) {
    await prisma.stockProduct.updateMany({
      where: { id: { in: deactivate } },
      data: { isActive: false },
    });
  }
  return deactivate.length;
}

/**
 * Create missing products and fill null default prices from grocery history + ledger.
 * Idempotent: never renames or overwrites a user-set defaultPrice.
 */
export async function ensureProductsFromHistory(userId: string): Promise<{
  created: number;
  priced: number;
  deduped: number;
}> {
  const deduped = await dedupeStockProducts(userId);

  // Soft-delete products on prepared / virtual stock items
  const prepItems = await prisma.stockItem.findMany({
    where: {
      userId,
      OR: [
        { code: { in: [...SKIP_CODES] } },
        { name: { contains: "(prep)", mode: "insensitive" } },
        { name: { contains: "prepared", mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });
  if (prepItems.length) {
    await prisma.stockProduct.updateMany({
      where: { userId, stockItemId: { in: prepItems.map((i) => i.id) }, isActive: true },
      data: { isActive: false },
    });
  }

  const items = await prisma.stockItem.findMany({
    where: { userId, isActive: true },
    include: {
      products: { where: { isActive: true } },
    },
  });

  const ledgers = await prisma.stockLedgerDay.findMany({
    where: {
      userId,
      OR: [{ received: { gt: 0 } }, { unitCost: { not: null } }],
    },
    orderBy: { date: "desc" },
    select: {
      stockItemId: true,
      received: true,
      expenditure: true,
      unitCost: true,
      date: true,
    },
  });
  const ledgersByItem = new Map<string, typeof ledgers>();
  for (const row of ledgers) {
    const list = ledgersByItem.get(row.stockItemId) ?? [];
    list.push(row);
    ledgersByItem.set(row.stockItemId, list);
  }

  const pending: Pending[] = [];
  let priced = 0;

  for (const item of items) {
    if (shouldSkipItem(item)) continue;

    let { baseUnit, units } = stockUnitsOf(item);
    const displayUnit = item.displayUnit || item.unit || baseUnit;
    let unitsDirty = false;

    const existingNames = new Set(item.products.map((p) => p.name.toLowerCase()));
    const hint = findGroceryHint({ code: item.code, name: item.name });

    const queue = (
      name: string,
      qty: number,
      unitCodeRaw: string,
      opts?: { description?: string | null; defaultPrice?: number | null; sortOrder?: number },
    ) => {
      if (existingNames.has(name.toLowerCase())) return;
      let unitCode = resolveUnitCode(units, unitCodeRaw, baseUnit);
      if (!units.some((u) => u.code.toLowerCase() === unitCode.toLowerCase())) {
        const factor =
          unitCode.toLowerCase() === "kg" || unitCode.toLowerCase() === "l" ? 1000 : 1;
        units = ensureUnitOnItem(units, unitCode, unitCode, factor, factor > 1 ? "standard" : "pack");
        unitsDirty = true;
      }
      unitCode = resolveUnitCode(units, unitCode, baseUnit);

      let defaultPrice = opts?.defaultPrice ?? null;
      if (defaultPrice == null) {
        const last =
          item.lastUnitCost != null ? Number(item.lastUnitCost) : null;
        defaultPrice = priceFromUnitCost(last, qty, unitCode, units, baseUnit);
      }

      existingNames.add(name.toLowerCase());
      pending.push({
        userId,
        stockItemId: item.id,
        name,
        description: opts?.description ?? null,
        qty,
        unitCode,
        defaultPrice,
        sortOrder: opts?.sortOrder ?? pending.length * 10,
      });
    };

    const pendingBefore = pending.length;

    // 1) Grocery bill hints
    if (hint) {
      hint.products.forEach((p, i) => {
        queue(p.name, p.qty, p.unitCode, {
          description: p.description ?? null,
          defaultPrice: p.defaultPrice ?? null,
          sortOrder: i * 10,
        });
      });
    }

    const queuedFromHint = pending.length > pendingBefore;

    // 2) If item has no products yet, invent from packs / display unit
    if (item.products.length === 0 && !queuedFromHint) {
      const packs = units.filter((u) => u.kind === "pack");
      if (packs.length) {
        queue(item.name, 1, displayUnit, { sortOrder: 0 });
        packs.forEach((p, i) => {
          queue(`${item.name} (${p.label})`, 1, p.code, {
            description: `1 ${p.label} = ${p.to_base} ${baseUnit}`,
            sortOrder: (i + 1) * 10,
          });
        });
      } else {
        queue(item.name, 1, displayUnit, {
          description: item.packInfo,
          sortOrder: 0,
        });
      }
    }

    // 3) Ledger received modes → pack product when the same received qty repeats
    const itemLedgers = ledgersByItem.get(item.id) ?? [];
    const modes = receivedModes(itemLedgers.map((l) => Number(l.received)));
    for (const { value: mode, count } of modes.slice(0, 3)) {
      if (mode <= 1 || count < 2) continue;
      const candidates = [
        ...item.products.map((p) => ({
          qty: Number(p.qty),
          unitCode: p.unitCode,
        })),
        ...pending
          .filter((p) => p.stockItemId === item.id)
          .map((p) => ({ qty: p.qty, unitCode: p.unitCode })),
      ];
      const covers = candidates.some(
        (p) => Math.abs(productBaseQty(p.qty, p.unitCode, units, baseUnit) - mode) < 1e-6,
      );
      if (covers) continue;
      const packCode = `pack_${mode}`;
      units = ensureUnitOnItem(units, packCode, `pack of ${mode}`, mode, "pack");
      unitsDirty = true;
      const day = itemLedgers.find((l) => Math.abs(Number(l.received) - mode) < 1e-6);
      const expenditure = day ? Number(day.expenditure) : null;
      queue(`${item.name} (×${mode})`, 1, packCode, {
        description: `Inferred from stock received ${mode} ${baseUnit}`,
        defaultPrice: expenditure != null && expenditure > 0 ? roundMoney(expenditure) : null,
        sortOrder: 100 + mode,
      });
    }

    if (unitsDirty) {
      await prisma.stockItem.update({
        where: { id: item.id },
        data: { units: units as never },
      });
    }

    // 4) Fill null prices on existing single-unit products from lastUnitCost.
    // Skip multi-base packs here — grocery hints / ledger expenditure set those.
    const displayBase = productBaseQty(1, displayUnit, units, baseUnit);
    for (const p of item.products) {
      if (p.defaultPrice != null) continue;
      const pBase = productBaseQty(Number(p.qty), p.unitCode, units, baseUnit);
      if (pBase > displayBase + 1e-6 && pBase > 1) continue;
      const last =
        item.lastUnitCost != null
          ? Number(item.lastUnitCost)
          : itemLedgers.find((l) => l.unitCost != null)
            ? Number(itemLedgers.find((l) => l.unitCost != null)!.unitCost)
            : null;
      const price = priceFromUnitCost(
        last,
        Number(p.qty),
        p.unitCode,
        units,
        baseUnit,
      );
      if (price == null) continue;
      await prisma.stockProduct.update({
        where: { id: p.id },
        data: { defaultPrice: price },
      });
      priced += 1;
    }
  }

  if (pending.length > 0) {
    await prisma.stockProduct.createMany({ data: pending });
  }

  // Apply grocery hint prices onto existing products that still lack a price
  // (and fix wrong lastUnitCost×pack factor when a hint price exists).
  let hintPriced = 0;
  for (const item of items) {
    const hint = findGroceryHint({ code: item.code, name: item.name });
    if (!hint) continue;
    const live = await prisma.stockProduct.findMany({
      where: { userId, stockItemId: item.id, isActive: true },
    });
    for (const hp of hint.products) {
      if (hp.defaultPrice == null) continue;
      const match = live.find((p) => p.name.toLowerCase() === hp.name.toLowerCase());
      if (!match) continue;
      if (match.defaultPrice != null && Number(match.defaultPrice) === hp.defaultPrice) continue;
      // Only overwrite when null, or when current price looks like a bad pack×base inflate
      const cur = match.defaultPrice != null ? Number(match.defaultPrice) : null;
      const shouldSet =
        cur == null ||
        (hp.defaultPrice > 0 && cur > hp.defaultPrice * 3);
      if (!shouldSet) continue;
      await prisma.stockProduct.update({
        where: { id: match.id },
        data: { defaultPrice: hp.defaultPrice },
      });
      hintPriced += 1;
    }
  }

  return { created: pending.length, priced: priced + hintPriced, deduped };
}

/** Merge catalog pack unit codes onto existing stock items so seed products convert. */
export async function ensureCatalogPackUnitsOnItems(
  userId: string,
  catalog: Array<{
    code: string;
    packs?: Array<{ code: string; label: string; to_base: number }>;
  }>,
): Promise<number> {
  let updated = 0;
  for (const entry of catalog) {
    if (!entry.packs?.length) continue;
    const item = await prisma.stockItem.findFirst({
      where: { userId, code: entry.code, isActive: true },
    });
    if (!item) continue;
    let { units } = stockUnitsOf(item);
    let dirty = false;
    for (const pack of entry.packs) {
      const next = ensureUnitOnItem(units, pack.code, pack.label, pack.to_base, "pack");
      if (next !== units) {
        units = next;
        dirty = true;
      }
    }
    if (dirty) {
      await prisma.stockItem.update({
        where: { id: item.id },
        data: { units: units as never },
      });
      updated += 1;
    }
  }
  return updated;
}

export type { StockUnitDef };
