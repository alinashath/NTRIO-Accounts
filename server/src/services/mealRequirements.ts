/**
 * Expand meal orders + room extras into kitchen prep counts and ingredient requirements.
 * Menu-driven: base + selected options + selected choices; prepared recipes explode to stock BOM.
 */

export type MealPeriod = "breakfast" | "lunch" | "dinner";

export type MealOrderLike = {
  mealPeriod: MealPeriod;
  menuId: string | null;
  /** Legacy fallback when menuId is null */
  breakfastType?: "maldivian" | "continental";
  eggStyle?: "omelette" | "fried" | "boiled" | "scrambled";
  selectedOptionIds: string[];
  /** { [choiceGroupKey]: mealMenuLineId } */
  selectedChoiceIds: Record<string, string>;
  status: "pending" | "served" | "cancelled";
  servingTime: string;
  outsideNormalWindow: boolean;
  specialRequests: string | null;
  roomNumber: string;
  guestNumber: number;
  /** Legacy flags for dual-read */
  potato?: boolean;
  juice?: boolean;
  tea?: boolean;
  coffee?: boolean;
  milk?: boolean;
  sugar?: boolean;
};

export type ExtraSelectionLike = {
  stockItemId: string;
  quantity: number;
};

export type ExtrasLike = {
  roomNumber: string;
  mealPeriod?: MealPeriod;
  fruits: string[];
  selectedLines: ExtraSelectionLike[];
  selectedItemIds: string[];
  pancake: boolean;
  honey: boolean;
  nutella: boolean;
  cereal: boolean;
  waterBottle: boolean;
};

export type MenuLineSource = {
  id: string;
  role: "base" | "option" | "choice";
  choice_group_key: string | null;
  choice_group_label: string | null;
  display_name: string;
  stock_item_id: string | null;
  stock_item_code: string | null;
  stock_item_unit: string | null;
  component_recipe_id: string | null;
  component_recipe_name: string | null;
  qty_per_serving: number;
  show_on_kot: boolean;
  notes: string | null;
};

export type MenuSource = {
  id: string;
  meal_period: MealPeriod;
  name: string;
  code: string | null;
  lines: MenuLineSource[];
};

export type PreparedBomLine = {
  stock_item_id: string;
  code: string | null;
  name: string;
  unit: string;
  qty_per_serving: number;
};

export type PreparedRecipeSource = {
  id: string;
  name: string;
  lines: PreparedBomLine[];
};

export type AddonLineSource = {
  stock_item_id: string;
  code: string | null;
  name: string;
  unit: string;
  qty_per_serving: number;
  show_on_kot: boolean;
  notes: string | null;
};

export type KotPrepLine = {
  key: string;
  name: string;
  unit: string;
  code: string | null;
  quantity: number;
  rooms: string[];
};

export type IngredientNeedLine = {
  stock_item_id: string | null;
  code: string | null;
  quantity: number;
};

export type KitchenPrep = {
  prep_lines: KotPrepLine[];
  /** @deprecated legacy counters */
  eggs_omelette: number;
  eggs_fried: number;
  eggs_boiled: number;
  eggs_scrambled: number;
  pancakes: number;
  roshi: number;
  mashuni_cups: number;
  sausages: number;
  potato_servings: number;
};

function activeOrders(orders: MealOrderLike[]) {
  return orders.filter((o) => o.status !== "cancelled");
}

function parseChoices(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" && v) out[k] = v;
  }
  return out;
}

export function normalizeChoiceIds(raw: unknown): Record<string, string> {
  return parseChoices(raw);
}

/** Resolve which menu lines apply to an order. */
export function resolveOrderMenuLines(
  order: MealOrderLike,
  menus: MenuSource[],
): MenuLineSource[] {
  const menu =
    (order.menuId ? menus.find((m) => m.id === order.menuId) : undefined) ??
    (order.breakfastType
      ? menus.find((m) => m.code === order.breakfastType && m.meal_period === "breakfast")
      : undefined);
  if (!menu) return [];

  const selectedOptions = new Set(order.selectedOptionIds ?? []);
  const choices = order.selectedChoiceIds ?? {};
  const out: MenuLineSource[] = [];

  for (const line of menu.lines) {
    if (line.role === "base") {
      out.push(line);
      continue;
    }
    if (line.role === "option") {
      // Options may be stored as menu-line id or stock-item id (legacy).
      if (
        selectedOptions.has(line.id) ||
        (line.stock_item_id && selectedOptions.has(line.stock_item_id))
      ) {
        out.push(line);
      }
      continue;
    }
    if (line.role === "choice" && line.choice_group_key) {
      if (choices[line.choice_group_key] === line.id) out.push(line);
    }
  }

  // Legacy egg style when no choice recorded
  if (!choices.egg_style && order.eggStyle) {
    const egg = menu.lines.find(
      (l) =>
        l.role === "choice" &&
        l.choice_group_key === "egg_style" &&
        (l.notes === order.eggStyle ||
          l.display_name.toLowerCase() === order.eggStyle),
    );
    if (egg && !out.some((l) => l.id === egg.id)) out.push(egg);
  }

  return out;
}

function bumpPrep(
  agg: Map<string, KotPrepLine>,
  key: string,
  name: string,
  unit: string,
  code: string | null,
  qty: number,
  roomNumber: string,
) {
  if (!(qty > 0)) return;
  const cur = agg.get(key);
  if (cur) {
    cur.quantity += qty;
    if (!cur.rooms.includes(roomNumber)) cur.rooms.push(roomNumber);
  } else {
    agg.set(key, { key, name, unit, code, quantity: qty, rooms: [roomNumber] });
  }
}

function addNeed(
  map: Map<string, IngredientNeedLine>,
  stockItemId: string | null,
  code: string | null,
  qty: number,
) {
  if (!qty) return;
  const key = stockItemId ? `id:${stockItemId}` : code ? `code:${code}` : null;
  if (!key) return;
  const cur = map.get(key);
  if (cur) {
    cur.quantity += qty;
    return;
  }
  map.set(key, { stock_item_id: stockItemId, code, quantity: qty });
}

/** Expand a menu line into stock needs (stock item or prepared BOM). */
function expandLineNeeds(
  map: Map<string, IngredientNeedLine>,
  line: MenuLineSource,
  preparedById: Map<string, PreparedRecipeSource>,
  servings = 1,
) {
  const mult = line.qty_per_serving * servings;
  if (!(mult > 0) && !line.component_recipe_id) {
    // qty 0 choice markers (egg style) — no stock
    return;
  }
  if (line.component_recipe_id) {
    const prep = preparedById.get(line.component_recipe_id);
    if (!prep) return;
    for (const bom of prep.lines) {
      addNeed(map, bom.stock_item_id, bom.code, bom.qty_per_serving * mult);
    }
    return;
  }
  if (line.stock_item_id) {
    addNeed(map, line.stock_item_id, line.stock_item_code, mult);
  }
}

function expandLinePrep(
  agg: Map<string, KotPrepLine>,
  line: MenuLineSource,
  roomNumber: string,
) {
  if (!line.show_on_kot) return;
  const name = line.display_name;
  const unit = line.stock_item_unit ?? (line.component_recipe_id ? "serving" : "");
  const code = line.stock_item_code;
  const key = line.id;
  bumpPrep(agg, key, name, unit, code, line.qty_per_serving || 1, roomNumber);
}

const PANCAKE_CODES = new Set(["pancake", "pancake_batch", "pancakes"]);

export function isPancakeCode(code: string | null | undefined) {
  return !!code && PANCAKE_CODES.has(code);
}

export function isPancakeName(name: string | null | undefined) {
  return (name ?? "").toLowerCase().includes("pancake");
}

/** @deprecated Prefer MealOrderLike — adapter for older call sites. */
export type OrderLike = {
  breakfastType: "maldivian" | "continental";
  eggStyle: "omelette" | "fried" | "boiled" | "scrambled";
  potato: boolean;
  juice: boolean;
  tea: boolean;
  coffee: boolean;
  milk: boolean;
  sugar: boolean;
  selectedOptionIds?: string[];
  selectedChoiceIds?: Record<string, string>;
  menuId?: string | null;
  mealPeriod?: MealPeriod;
  status: "pending" | "served" | "cancelled";
  servingTime: string;
  outsideNormalWindow: boolean;
  specialRequests: string | null;
  roomNumber: string;
  guestNumber: number;
};

export function toMealOrderLike(o: OrderLike): MealOrderLike {
  return {
    mealPeriod: o.mealPeriod ?? "breakfast",
    menuId: o.menuId ?? null,
    breakfastType: o.breakfastType,
    eggStyle: o.eggStyle,
    selectedOptionIds: o.selectedOptionIds ?? [],
    selectedChoiceIds: o.selectedChoiceIds ?? {},
    status: o.status,
    servingTime: o.servingTime,
    outsideNormalWindow: o.outsideNormalWindow,
    specialRequests: o.specialRequests,
    roomNumber: o.roomNumber,
    guestNumber: o.guestNumber,
    potato: o.potato,
    juice: o.juice,
    tea: o.tea,
    coffee: o.coffee,
    milk: o.milk,
    sugar: o.sugar,
  };
}

export function computeKitchenPrep(
  orders: MealOrderLike[],
  extras: ExtrasLike[],
  menus: MenuSource[] = [],
  addons: AddonLineSource[] = [],
): KitchenPrep {
  const active = activeOrders(orders);
  const prepAgg = new Map<string, KotPrepLine>();
  const prep: KitchenPrep = {
    prep_lines: [],
    eggs_omelette: 0,
    eggs_fried: 0,
    eggs_boiled: 0,
    eggs_scrambled: 0,
    pancakes: 0,
    roshi: 0,
    mashuni_cups: 0,
    sausages: 0,
    potato_servings: 0,
  };

  for (const o of active) {
    const lines = resolveOrderMenuLines(o, menus);
    for (const line of lines) {
      expandLinePrep(prepAgg, line, o.roomNumber);
      if (line.choice_group_key === "egg_style") {
        const style = (line.notes ?? line.display_name.toLowerCase()) as string;
        if (style.includes("omelette")) prep.eggs_omelette += 1;
        else if (style.includes("fried")) prep.eggs_fried += 1;
        else if (style.includes("boiled")) prep.eggs_boiled += 1;
        else if (style.includes("scrambled")) prep.eggs_scrambled += 1;
      }
      if (isPancakeCode(line.stock_item_code) || isPancakeName(line.display_name)) {
        prep.pancakes += line.qty_per_serving || 1;
      }
      const code = (line.stock_item_code ?? "").toLowerCase();
      if (code === "roshi") prep.roshi += line.qty_per_serving;
      if (code === "mashuni") prep.mashuni_cups += line.qty_per_serving;
      if (code === "sausages") prep.sausages += line.qty_per_serving;
      if (code === "potatoes" || code === "potato" || code === "potato_portion") {
        prep.potato_servings += line.qty_per_serving;
      }
    }

    // Selected add-ons by stock id (shared catalog)
    const addonById = new Map(addons.map((a) => [a.stock_item_id, a]));
    for (const id of o.selectedOptionIds) {
      const addon = addonById.get(id);
      if (!addon || !addon.show_on_kot) continue;
      // Skip if already covered as a menu option line
      if (lines.some((l) => l.stock_item_id === id || l.id === id)) continue;
      bumpPrep(
        prepAgg,
        `addon:${id}`,
        addon.name,
        addon.unit,
        addon.code,
        addon.qty_per_serving,
        o.roomNumber,
      );
      if (isPancakeCode(addon.code) || isPancakeName(addon.name)) {
        prep.pancakes += addon.qty_per_serving;
      }
    }
  }

  for (const e of extras) {
    for (const sel of e.selectedLines) {
      const addon = addons.find((a) => a.stock_item_id === sel.stockItemId);
      if (!addon || !addon.show_on_kot || !(sel.quantity > 0)) continue;
      bumpPrep(
        prepAgg,
        `addon:${sel.stockItemId}`,
        addon.name,
        addon.unit,
        addon.code,
        sel.quantity,
        e.roomNumber,
      );
      if (isPancakeCode(addon.code) || isPancakeName(addon.name)) {
        prep.pancakes += sel.quantity;
      }
    }
  }

  prep.prep_lines = [...prepAgg.values()].sort((a, b) => a.name.localeCompare(b.name));
  return prep;
}

export function resolveSelectedExtras(
  e: ExtrasLike,
  addons: AddonLineSource[],
): ExtraSelectionLike[] {
  if (e.selectedLines.length) {
    const merged = new Map<string, number>();
    for (const line of e.selectedLines) {
      if (!line.stockItemId || !(line.quantity > 0)) continue;
      merged.set(line.stockItemId, (merged.get(line.stockItemId) ?? 0) + line.quantity);
    }
    return [...merged.entries()].map(([stockItemId, quantity]) => ({ stockItemId, quantity }));
  }
  if (e.selectedItemIds.length) {
    return [...new Set(e.selectedItemIds)].map((stockItemId) => ({ stockItemId, quantity: 1 }));
  }
  const byCode = new Map(addons.filter((l) => l.code).map((l) => [l.code!, l.stock_item_id]));
  const out: ExtraSelectionLike[] = [];
  const pushCode = (code: string, qty = 1) => {
    const id = byCode.get(code);
    if (id) out.push({ stockItemId: id, quantity: qty });
  };
  if (e.honey) pushCode("honey");
  if (e.nutella) pushCode("nutella");
  if (e.cereal) pushCode("cornflakes");
  if (e.waterBottle) pushCode("water_bottle");
  if (e.pancake) {
    for (const code of PANCAKE_CODES) {
      if (byCode.has(code)) {
        pushCode(code);
        break;
      }
    }
  }
  return out;
}

export function computeKotExtras(
  extras: ExtrasLike[],
  addons: AddonLineSource[],
): KotPrepLine[] {
  const byId = new Map(addons.map((l) => [l.stock_item_id, l]));
  const agg = new Map<string, KotPrepLine>();
  for (const e of extras) {
    for (const sel of resolveSelectedExtras(e, addons)) {
      const line = byId.get(sel.stockItemId);
      if (!line || !line.show_on_kot) continue;
      bumpPrep(
        agg,
        `addon:${sel.stockItemId}`,
        line.name,
        line.unit,
        line.code,
        sel.quantity,
        e.roomNumber,
      );
    }
  }
  return [...agg.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function computeIngredientNeeds(
  orders: MealOrderLike[],
  extras: ExtrasLike[],
  menus: MenuSource[] = [],
  prepared: PreparedRecipeSource[] = [],
  addons: AddonLineSource[] = [],
): IngredientNeedLine[] {
  const active = activeOrders(orders);
  const map = new Map<string, IngredientNeedLine>();
  const preparedById = new Map(prepared.map((p) => [p.id, p]));
  const addonById = new Map(addons.map((a) => [a.stock_item_id, a]));

  for (const o of active) {
    const lines = resolveOrderMenuLines(o, menus);
    for (const line of lines) {
      expandLineNeeds(map, line, preparedById);
    }
    for (const id of o.selectedOptionIds) {
      if (lines.some((l) => l.id === id || l.stock_item_id === id)) continue;
      const addon = addonById.get(id);
      if (!addon) continue;
      addNeed(map, addon.stock_item_id, addon.code, addon.qty_per_serving);
      // If addon maps to a prepared recipe by code match — handled via stock qty only
    }
  }

  for (const e of extras) {
    for (const sel of resolveSelectedExtras(e, addons)) {
      const line = addonById.get(sel.stockItemId);
      if (!line) {
        addNeed(map, sel.stockItemId, null, sel.quantity);
        continue;
      }
      addNeed(map, line.stock_item_id, line.code, sel.quantity);
    }
    for (const f of e.fruits) {
      if (f === "watermelon") addNeed(map, null, "watermelon", 1);
      else if (f === "papaya") addNeed(map, null, "papaya", 1);
      else if (f === "apple") addNeed(map, null, "apple", 4);
      else if (f === "orange") addNeed(map, null, "orange", 4);
    }
  }

  // Pancake batter: if pancake pieces selected, expand prepared recipe named/coded pancake if present
  let pancakePieces = 0;
  for (const need of map.values()) {
    if (isPancakeCode(need.code)) pancakePieces += need.quantity;
  }
  const pancakePrep =
    prepared.find((p) => isPancakeName(p.name) || p.lines.some((l) => isPancakeCode(l.code))) ??
    prepared.find((p) => /pancake/i.test(p.name));
  // Prefer dedicated batter recipe with flour in BOM
  const batter = prepared.find(
    (p) =>
      p.lines.some((l) => l.code === "flour") &&
      (isPancakeName(p.name) || p.lines.some((l) => isPancakeCode(l.code))),
  );
  const usePrep = batter ?? pancakePrep;
  if (pancakePieces > 0 && usePrep && usePrep.lines.some((l) => l.code === "flour")) {
    // Assume prepared recipe BOM is sized per 1 piece OR per batch — prefer notes in seed (20 pieces).
    // Convention: if BOM has flour ~0.25, treat as per-20-piece batch.
    const flourLine = usePrep.lines.find((l) => l.code === "flour");
    const perBatch = flourLine && flourLine.qty_per_serving >= 0.2;
    const batches = perBatch ? pancakePieces / 20 : pancakePieces;
    for (const bom of usePrep.lines) {
      if (isPancakeCode(bom.code)) continue;
      addNeed(map, bom.stock_item_id, bom.code, bom.qty_per_serving * batches);
    }
  } else if (pancakePieces > 0) {
    // Legacy hardcoded batter fallback
    const batches = pancakePieces / 20;
    addNeed(map, null, "flour", batches * 0.25);
    addNeed(map, null, "eggs", batches * 4);
    addNeed(map, null, "baking_powder", batches * 10);
    addNeed(map, null, "sugar_g", batches * 200);
    addNeed(map, null, "banana_essence", batches * 15);
  }

  return [...map.values()].filter((l) => l.quantity > 0);
}

export type ServerSummaryRow = {
  date: string;
  meal_period: MealPeriod;
  breakfast_time: string;
  room_number: string;
  menu_name: string;
  menu_count: number;
  option_sides: Array<{ name: string; code: string | null; quantity: number }>;
  juice: number;
  tea_or_coffee: number;
  maldivian: number;
  continental: number;
  special_requests: string[];
  outside_normal_window: boolean;
};

export function computeServerSummary(
  dateYmd: string,
  orders: MealOrderLike[],
  menus: MenuSource[] = [],
  mealPeriod?: MealPeriod,
): ServerSummaryRow[] {
  const active = activeOrders(orders).filter((o) =>
    mealPeriod ? o.mealPeriod === mealPeriod : true,
  );
  type Acc = ServerSummaryRow & {
    sideAgg: Map<string, { name: string; code: string | null; quantity: number }>;
  };
  const map = new Map<string, Acc>();

  for (const o of active) {
    const menu =
      (o.menuId ? menus.find((m) => m.id === o.menuId) : undefined) ??
      menus.find((m) => m.code === o.breakfastType);
    const k = `${o.mealPeriod}|${o.roomNumber}|${o.servingTime}|${menu?.id ?? o.breakfastType ?? ""}`;
    let row = map.get(k);
    if (!row) {
      row = {
        date: dateYmd,
        meal_period: o.mealPeriod,
        breakfast_time: o.servingTime,
        room_number: o.roomNumber,
        menu_name: menu?.name ?? o.breakfastType ?? "Meal",
        menu_count: 0,
        option_sides: [],
        juice: 0,
        tea_or_coffee: 0,
        maldivian: 0,
        continental: 0,
        special_requests: [],
        outside_normal_window: false,
        sideAgg: new Map(),
      };
      map.set(k, row);
    }
    row.menu_count += 1;
    if (o.breakfastType === "maldivian" || menu?.code === "maldivian") row.maldivian += 1;
    if (o.breakfastType === "continental" || menu?.code === "continental") row.continental += 1;

    for (const line of resolveOrderMenuLines(o, menus)) {
      if (line.role === "base") continue;
      const cur = row.sideAgg.get(line.id);
      if (cur) cur.quantity += 1;
      else {
        row.sideAgg.set(line.id, {
          name: line.display_name,
          code: line.stock_item_code,
          quantity: 1,
        });
      }
      const code = (line.stock_item_code ?? "").toLowerCase();
      if (code === "sunquick" || code === "juice") row.juice += 1;
      if (code === "tea" || code === "coffee") row.tea_or_coffee += 1;
    }

    if (o.specialRequests?.trim()) row.special_requests.push(o.specialRequests.trim());
    if (o.outsideNormalWindow) row.outside_normal_window = true;
  }

  return [...map.values()]
    .map(({ sideAgg, ...row }) => ({
      ...row,
      option_sides: [...sideAgg.values()].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => {
      const p = a.meal_period.localeCompare(b.meal_period);
      if (p !== 0) return p;
      const t = a.breakfast_time.localeCompare(b.breakfast_time);
      if (t !== 0) return t;
      return a.room_number.localeCompare(b.room_number);
    });
}

export function isOutsideNormalWindow(servingTime: string): boolean {
  const m = /^(\d{1,2}):(\d{2})$/.exec(servingTime.trim());
  if (!m) return true;
  const mins = Number(m[1]) * 60 + Number(m[2]);
  const start = 7 * 60;
  const end = 9 * 60 + 30;
  if (mins < start || mins > end) return true;
  if (mins % 15 !== 0) return true;
  return false;
}

export function normalServingTimes(): string[] {
  const out: string[] = [];
  for (let mins = 7 * 60; mins <= 9 * 60 + 30; mins += 15) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
  return out;
}

/** Legacy RecipeNeedSource bridge for older kitchenSeed paths. */
export type RecipeNeedSource = {
  apply_to: "maldivian" | "continental" | "room_extras" | "custom";
  lines: Array<{
    stock_item_id: string;
    code: string | null;
    name?: string;
    unit?: string;
    qty_per_serving: number;
    show_on_kot?: boolean;
    is_option?: boolean;
  }>;
};
