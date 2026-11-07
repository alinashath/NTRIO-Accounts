export {
  type BaseUnit,
  type MeasureKind,
  type StockUnitDef,
  type StockUnitsJson,
  buildUnitsList,
  findUnit,
  fromBase,
  labelForUnit,
  measureForBase,
  baseForMeasure,
  parseUnitsJson,
  pricePerBase,
  pricePerUnit,
  productRefillToBase,
  roundMoney,
  roundQty,
  roundUnitCost,
  toBase,
  unitFactor,
} from "../../../shared/units";

import { fromBase, labelForUnit, pricePerUnit, type StockUnitsJson } from "../../../shared/units";

export function fmtQty(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  const rounded = Math.round(n * 10 ** digits) / 10 ** digits;
  return String(rounded);
}

export function displayQty(
  baseQty: number,
  displayUnit: string,
  units: StockUnitsJson | null | undefined,
  baseUnit: "g" | "ml" | "pcs" = "pcs",
): { qty: number; label: string; text: string } {
  const qty = fromBase(baseQty, displayUnit, units, baseUnit);
  const label = labelForUnit(units, displayUnit, displayUnit);
  return { qty, label, text: `${fmtQty(qty)} ${label}` };
}

export function displayPrice(
  pricePerBase: number | null | undefined,
  displayUnit: string,
  units: StockUnitsJson | null | undefined,
  baseUnit: "g" | "ml" | "pcs" = "pcs",
): string {
  if (pricePerBase == null || !Number.isFinite(pricePerBase)) return "—";
  const p = pricePerUnit(pricePerBase, displayUnit, units, baseUnit);
  const label = labelForUnit(units, displayUnit, displayUnit);
  return `${p.toFixed(2)} / ${label}`;
}
