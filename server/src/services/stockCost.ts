import { dec } from "../lib/dates.js";
import { toMoney } from "../lib/money.js";

type StockPrice = {
  lastUnitCost?: { toNumber?: () => number } | number | null;
};

type BomLine = {
  qtyPerServing: { toNumber?: () => number } | number;
  stockItem: StockPrice | null | undefined;
};

/** Unit price from the latest stock refill. */
export function stockUnitPrice(item: StockPrice | null | undefined): number | null {
  if (!item || item.lastUnitCost == null) return null;
  const p = dec(item.lastUnitCost);
  return p >= 0 ? p : null;
}

/** Cost of one prepared-recipe BOM serving. */
export function costPreparedBom(lines: BomLine[]): {
  estimated_cost: number | null;
  cost_incomplete: boolean;
} {
  let total = 0;
  let incomplete = false;
  let hasPrice = false;
  for (const line of lines) {
    const qty = dec(line.qtyPerServing);
    if (!(qty > 0)) continue;
    const price = stockUnitPrice(line.stockItem);
    if (price == null) {
      incomplete = true;
      continue;
    }
    hasPrice = true;
    total += qty * price;
  }
  if (!hasPrice && incomplete) {
    return { estimated_cost: null, cost_incomplete: true };
  }
  if (!hasPrice) {
    return { estimated_cost: 0, cost_incomplete: false };
  }
  return { estimated_cost: toMoney(total), cost_incomplete: incomplete };
}

type MenuCostLine = {
  role: string;
  choiceGroupKey: string | null;
  qtyPerServing: { toNumber?: () => number } | number;
  stockItem: StockPrice | null | undefined;
  componentRecipe: { lines: BomLine[] } | null | undefined;
};

/**
 * Typical per-serving menu cost:
 * - all base lines
 * - average of each choice group
 * - options excluded (guest-selected extras)
 */
export function costMenuServing(lines: MenuCostLine[]): {
  estimated_cost: number | null;
  cost_incomplete: boolean;
} {
  let total = 0;
  let incomplete = false;
  let hasPrice = false;

  const addPriced = (amount: number | null, lineIncomplete: boolean) => {
    if (lineIncomplete) incomplete = true;
    if (amount == null) {
      incomplete = true;
      return;
    }
    hasPrice = true;
    total += amount;
  };

  const lineCost = (line: MenuCostLine): { cost: number | null; incomplete: boolean } => {
    const qty = dec(line.qtyPerServing);
    if (!(qty > 0) && !line.componentRecipe) {
      return { cost: 0, incomplete: false };
    }
    if (line.componentRecipe) {
      const bom = costPreparedBom(line.componentRecipe.lines);
      if (bom.estimated_cost == null) return { cost: null, incomplete: true };
      return {
        cost: toMoney(bom.estimated_cost * (qty > 0 ? qty : 1)),
        incomplete: bom.cost_incomplete,
      };
    }
    const price = stockUnitPrice(line.stockItem);
    if (price == null) return { cost: null, incomplete: true };
    return { cost: toMoney(qty * price), incomplete: false };
  };

  for (const line of lines) {
    if (line.role === "base") {
      const c = lineCost(line);
      addPriced(c.cost, c.incomplete);
    }
  }

  const byGroup = new Map<string, MenuCostLine[]>();
  for (const line of lines) {
    if (line.role !== "choice" || !line.choiceGroupKey) continue;
    const list = byGroup.get(line.choiceGroupKey) ?? [];
    list.push(line);
    byGroup.set(line.choiceGroupKey, list);
  }
  for (const group of byGroup.values()) {
    const priced = group.map(lineCost);
    const known = priced.filter((p) => p.cost != null) as Array<{ cost: number; incomplete: boolean }>;
    if (!known.length) {
      incomplete = true;
      continue;
    }
    if (priced.some((p) => p.incomplete || p.cost == null)) incomplete = true;
    const avg = known.reduce((s, p) => s + p.cost, 0) / known.length;
    hasPrice = true;
    total += avg;
  }

  if (!hasPrice && incomplete) {
    return { estimated_cost: null, cost_incomplete: true };
  }
  if (!hasPrice) {
    return { estimated_cost: 0, cost_incomplete: false };
  }
  return { estimated_cost: toMoney(total), cost_incomplete: incomplete };
}

/** Cost of a single stock/BOM menu line (qty × price). */
export function costMenuLine(line: MenuCostLine): {
  estimated_cost: number | null;
  cost_incomplete: boolean;
} {
  const qty = dec(line.qtyPerServing);
  if (line.componentRecipe) {
    const bom = costPreparedBom(line.componentRecipe.lines);
    if (bom.estimated_cost == null) {
      return { estimated_cost: null, cost_incomplete: true };
    }
    return {
      estimated_cost: toMoney(bom.estimated_cost * (qty > 0 ? qty : 1)),
      cost_incomplete: bom.cost_incomplete,
    };
  }
  const price = stockUnitPrice(line.stockItem);
  if (price == null) {
    return { estimated_cost: null, cost_incomplete: qty > 0 };
  }
  return { estimated_cost: toMoney(qty * price), cost_incomplete: false };
}
