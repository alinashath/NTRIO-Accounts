import { dec } from "./dates.js";
import {
  type BaseUnit,
  type StockUnitsJson,
  buildUnitsList,
  parseUnitsJson,
  toBase,
  unitFactor,
} from "./units.js";

export type StockItemRow = {
  id: string;
  code: string | null;
  name: string;
  unit: string;
  baseUnit?: string | null;
  displayUnit?: string | null;
  units?: unknown;
  kind: "kitchen" | "other";
  minStock: unknown;
  lastUnitCost?: unknown | null;
  useNotes: string | null;
  packInfo: string | null;
  sortOrder: number;
  isActive?: boolean;
};

export function stockUnitsOf(item: {
  baseUnit?: string | null;
  units?: unknown;
}): { baseUnit: BaseUnit; units: StockUnitsJson } {
  const base =
    item.baseUnit === "g" || item.baseUnit === "ml" || item.baseUnit === "pcs"
      ? item.baseUnit
      : ("pcs" as BaseUnit);
  let units = parseUnitsJson(item.units);
  if (!units.length) units = buildUnitsList(base);
  return { baseUnit: base, units };
}

export function mapStockItemDto(item: StockItemRow) {
  const { baseUnit, units } = stockUnitsOf(item);
  const displayUnit = item.displayUnit || item.unit || baseUnit;
  return {
    id: item.id,
    code: item.code,
    name: item.name,
    unit: item.unit,
    base_unit: baseUnit,
    display_unit: displayUnit,
    units,
    kind: item.kind,
    min_stock: dec(item.minStock as never),
    last_unit_cost: item.lastUnitCost != null ? dec(item.lastUnitCost as never) : null,
    use_notes: item.useNotes,
    pack_info: item.packInfo,
    sort_order: item.sortOrder,
    ...(item.isActive !== undefined ? { is_active: item.isActive } : {}),
  };
}

export function mapProductDto(p: {
  id: string;
  stockItemId: string;
  name: string;
  description: string | null;
  qty: unknown;
  unitCode: string;
  defaultPrice: unknown | null;
  sortOrder: number;
  isActive: boolean;
  stockItem: StockItemRow;
}) {
  const { baseUnit, units } = stockUnitsOf(p.stockItem);
  const qty = dec(p.qty as never);
  const baseQty = toBase(qty, p.unitCode, units, baseUnit);
  return {
    id: p.id,
    stock_item_id: p.stockItemId,
    stock_item_name: p.stockItem.name,
    stock_item_unit: p.stockItem.unit,
    name: p.name,
    description: p.description,
    qty,
    unit_code: p.unitCode,
    default_price: p.defaultPrice != null ? dec(p.defaultPrice as never) : null,
    sort_order: p.sortOrder,
    is_active: p.isActive,
    base_qty: baseQty,
  };
}

export function resolveMinStockBase(
  minStockInput: number,
  minStockUnit: string | undefined,
  item: { baseUnit?: string | null; units?: unknown; displayUnit?: string | null },
): number {
  const { baseUnit, units } = stockUnitsOf(item);
  const unit = minStockUnit || item.displayUnit || baseUnit;
  return toBase(minStockInput, unit, units, baseUnit);
}

export function factorForDisplay(item: {
  baseUnit?: string | null;
  units?: unknown;
  displayUnit?: string | null;
}): number {
  const { baseUnit, units } = stockUnitsOf(item);
  return unitFactor(units, item.displayUnit || baseUnit, baseUnit);
}
