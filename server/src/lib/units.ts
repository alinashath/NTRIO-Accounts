/**
 * Stock unit conversion: store ledger/recipe qty in the lowest base unit
 * (g, ml, or pcs). Purchase and recipe UIs pick larger units (kg, L, can, …).
 */

export type BaseUnit = "g" | "ml" | "pcs";
export type MeasureKind = "weight" | "volume" | "count";

export type StockUnitDef = {
  code: string;
  label: string;
  /** Multiply qty in this unit by to_base to get base units. */
  to_base: number;
  kind: "standard" | "pack";
};

export type StockUnitsJson = StockUnitDef[];

export function measureForBase(base: BaseUnit): MeasureKind {
  if (base === "g") return "weight";
  if (base === "ml") return "volume";
  return "count";
}

export function baseForMeasure(measure: MeasureKind): BaseUnit {
  if (measure === "weight") return "g";
  if (measure === "volume") return "ml";
  return "pcs";
}

export function standardUnitsForBase(base: BaseUnit): StockUnitDef[] {
  if (base === "g") {
    return [
      { code: "g", label: "g", to_base: 1, kind: "standard" },
      { code: "kg", label: "kg", to_base: 1000, kind: "standard" },
    ];
  }
  if (base === "ml") {
    return [
      { code: "ml", label: "ml", to_base: 1, kind: "standard" },
      { code: "L", label: "L", to_base: 1000, kind: "standard" },
    ];
  }
  return [{ code: "pcs", label: "pcs", to_base: 1, kind: "standard" }];
}

/** Build units list: standards for the base + optional packs (can, case, box, …). */
export function buildUnitsList(
  base: BaseUnit,
  packs: Array<{ code: string; label: string; to_base: number }> = [],
  pieceLabel?: string,
): StockUnitsJson {
  const standards = standardUnitsForBase(base).map((u) =>
    base === "pcs" && u.code === "pcs" && pieceLabel
      ? { ...u, label: pieceLabel }
      : u,
  );
  const packDefs: StockUnitDef[] = packs
    .filter((p) => p.to_base > 0 && p.code)
    .map((p) => ({
      code: p.code,
      label: p.label || p.code,
      to_base: p.to_base,
      kind: "pack" as const,
    }));
  const byCode = new Map<string, StockUnitDef>();
  for (const u of [...standards, ...packDefs]) byCode.set(u.code, u);
  return [...byCode.values()];
}

export function findUnit(
  units: StockUnitsJson | null | undefined,
  code: string,
): StockUnitDef | null {
  if (!units?.length) return null;
  const want = code.trim().toLowerCase();
  return units.find((u) => u.code.toLowerCase() === want) ?? null;
}

export function unitFactor(
  units: StockUnitsJson | null | undefined,
  code: string,
  fallbackBase: BaseUnit = "pcs",
): number {
  const found = findUnit(units, code);
  if (found) return found.to_base;
  const standards = standardUnitsForBase(fallbackBase);
  const std = standards.find((u) => u.code.toLowerCase() === code.trim().toLowerCase());
  return std?.to_base ?? 1;
}

/** Convert a quantity in `fromUnit` into base units. */
export function toBase(
  qty: number,
  fromUnit: string,
  units: StockUnitsJson | null | undefined,
  fallbackBase: BaseUnit = "pcs",
): number {
  if (!Number.isFinite(qty)) return 0;
  return qty * unitFactor(units, fromUnit, fallbackBase);
}

/** Convert base qty into a display unit. */
export function fromBase(
  baseQty: number,
  toUnit: string,
  units: StockUnitsJson | null | undefined,
  fallbackBase: BaseUnit = "pcs",
): number {
  const f = unitFactor(units, toUnit, fallbackBase);
  if (!(f > 0) || !Number.isFinite(baseQty)) return 0;
  return baseQty / f;
}

/** Price per base unit from a purchase of `qty` in `unit` at `pricePerUnit`. */
export function pricePerBase(
  pricePerUnit: number,
  unit: string,
  units: StockUnitsJson | null | undefined,
  fallbackBase: BaseUnit = "pcs",
): number {
  const f = unitFactor(units, unit, fallbackBase);
  if (!(f > 0) || !Number.isFinite(pricePerUnit)) return 0;
  return pricePerUnit / f;
}

/** Price shown per `unit` from a stored per-base price. */
export function pricePerUnit(
  pricePerBaseUnit: number,
  unit: string,
  units: StockUnitsJson | null | undefined,
  fallbackBase: BaseUnit = "pcs",
): number {
  const f = unitFactor(units, unit, fallbackBase);
  if (!(f > 0) || !Number.isFinite(pricePerBaseUnit)) return 0;
  return pricePerBaseUnit * f;
}

export function roundQty(n: number, digits = 4): number {
  if (!Number.isFinite(n)) return 0;
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

export function roundMoney(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function roundUnitCost(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1e8) / 1e8;
}

export function labelForUnit(
  units: StockUnitsJson | null | undefined,
  code: string,
  fallback = code,
): string {
  return findUnit(units, code)?.label ?? fallback;
}

export function displayLabelForBase(base: BaseUnit): string {
  if (base === "g") return "g";
  if (base === "ml") return "ml";
  return "pcs";
}

/**
 * Infer base unit + scale factor from a legacy free-text unit string.
 * Returns factor to multiply quantities by (and divide costs by).
 */
export function inferLegacyUnit(unitRaw: string): {
  baseUnit: BaseUnit;
  displayUnit: string;
  factor: number;
  pieceLabel: string | null;
  units: StockUnitsJson;
} {
  const u = unitRaw.trim();
  const lower = u.toLowerCase();

  if (lower === "kg" || lower === "kgs" || lower === "kilogram" || lower === "kilograms") {
    const units = buildUnitsList("g");
    return { baseUnit: "g", displayUnit: "kg", factor: 1000, pieceLabel: null, units };
  }
  if (lower === "g" || lower === "gram" || lower === "grams") {
    const units = buildUnitsList("g");
    return { baseUnit: "g", displayUnit: "g", factor: 1, pieceLabel: null, units };
  }
  if (lower === "l" || lower === "lt" || lower === "liter" || lower === "litre" || lower === "liters" || lower === "litres") {
    const units = buildUnitsList("ml");
    return { baseUnit: "ml", displayUnit: "L", factor: 1000, pieceLabel: null, units };
  }
  if (lower === "ml" || lower === "millilitre" || lower === "milliliter" || lower === "millilitres" || lower === "milliliters") {
    const units = buildUnitsList("ml");
    return { baseUnit: "ml", displayUnit: "ml", factor: 1, pieceLabel: null, units };
  }

  // Count-like: keep as pcs with the human label
  const pieceLabel = u || "pcs";
  const displayCode =
    lower === "number" || lower === "pcs" || lower === "pc" || lower === "piece" || lower === "pieces"
      ? "pcs"
      : lower.replace(/\s+/g, "_");
  const units = buildUnitsList("pcs", [], pieceLabel === "Number" ? "pcs" : pieceLabel);
  // Prefer a labelled pcs entry when display is Slice/Teabag/etc.
  if (displayCode !== "pcs") {
    const withLabel = buildUnitsList("pcs", [], pieceLabel);
    // Also expose the named code as alias for the piece
    const aliased = [
      ...withLabel.filter((x) => x.code !== displayCode),
      { code: displayCode, label: pieceLabel, to_base: 1, kind: "standard" as const },
    ];
    return {
      baseUnit: "pcs",
      displayUnit: displayCode,
      factor: 1,
      pieceLabel,
      units: aliased,
    };
  }
  return {
    baseUnit: "pcs",
    displayUnit: "pcs",
    factor: 1,
    pieceLabel,
    units,
  };
}

export function parseUnitsJson(raw: unknown): StockUnitsJson {
  if (!Array.isArray(raw)) return [];
  const out: StockUnitDef[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const code = typeof r.code === "string" ? r.code : "";
    const label = typeof r.label === "string" ? r.label : code;
    const to_base = typeof r.to_base === "number" ? r.to_base : Number(r.to_base);
    const kind = r.kind === "pack" ? "pack" : "standard";
    if (!code || !(to_base > 0)) continue;
    out.push({ code, label, to_base, kind });
  }
  return out;
}

/** Product refill: count of products × product qty in product unit → base qty + per-base cost. */
export function productRefillToBase(opts: {
  count: number;
  productQty: number;
  productUnit: string;
  pricePerProduct: number;
  units: StockUnitsJson | null | undefined;
  baseUnit: BaseUnit;
}): { baseQty: number; unitCost: number; expenditure: number } {
  const oneBase = toBase(opts.productQty, opts.productUnit, opts.units, opts.baseUnit);
  const baseQty = roundQty(opts.count * oneBase);
  const expenditure = roundMoney(opts.count * opts.pricePerProduct);
  const unitCost = baseQty > 0 ? roundUnitCost(expenditure / baseQty) : 0;
  return { baseQty, unitCost, expenditure };
}
