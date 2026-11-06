/**
 * Expand breakfast orders + room extras into kitchen prep counts and ingredient requirements.
 * Maldivian / Continental ingredients and sides come only from editable Recipes.
 * Room extras come from the room_extras recipe. No hardcoded menu items.
 */

export type OrderLike = {
  breakfastType: "maldivian" | "continental";
  eggStyle: "omelette" | "fried" | "boiled" | "scrambled";
  potato: boolean;
  juice: boolean;
  tea: boolean;
  coffee: boolean;
  milk: boolean;
  sugar: boolean;
  /** Selected optional side stock-item ids from the breakfast-type recipe. */
  selectedOptionIds?: string[];
  status: "pending" | "served" | "cancelled";
  servingTime: string;
  outsideNormalWindow: boolean;
  specialRequests: string | null;
  roomNumber: string;
  guestNumber: number;
};

export type ExtraSelectionLike = {
  stockItemId: string;
  quantity: number;
};

export type ExtrasLike = {
  roomNumber: string;
  /** breakfast | lunch | dinner — used for labels; all meals feed stock/KOT. */
  mealPeriod?: "breakfast" | "lunch" | "dinner";
  fruits: string[];
  /** Configurable extras with quantities (stock units). */
  selectedLines: ExtraSelectionLike[];
  /** @deprecated Prefer selectedLines */
  selectedItemIds: string[];
  pancake: boolean;
  honey: boolean;
  nutella: boolean;
  cereal: boolean;
  waterBottle: boolean;
};

export type RecipeNeedSource = {
  apply_to: "maldivian" | "continental" | "room_extras" | "custom";
  lines: Array<{
    stock_item_id: string;
    code: string | null;
    name?: string;
    unit?: string;
    qty_per_serving: number;
    show_on_kot?: boolean;
    /** Choosable side on maldivian/continental (not always included). */
    is_option?: boolean;
  }>;
};

export type KotBreakfastSideLine = {
  stock_item_id: string;
  name: string;
  unit: string;
  code: string | null;
  quantity: number;
  rooms: string[];
};

function optionLinesForType(
  recipes: RecipeNeedSource[],
  applyTo: "maldivian" | "continental",
) {
  return recipes
    .filter((r) => r.apply_to === applyTo)
    .flatMap((r) => r.lines)
    .filter((l) => l.is_option);
}

function baseLinesForType(
  recipes: RecipeNeedSource[],
  applyTo: "maldivian" | "continental",
) {
  return recipes
    .filter((r) => r.apply_to === applyTo)
    .flatMap((r) => r.lines)
    .filter((l) => !l.is_option);
}

export type KotExtraLine = {
  stock_item_id: string;
  name: string;
  unit: string;
  code: string | null;
  quantity: number;
  rooms: string[];
};

/** Codes that still trigger pancake batch prep math when selected as an extra. */
const PANCAKE_TRIGGER_CODES = new Set(["pancake", "pancake_batch", "pancakes"]);

export function isPancakeExtraCode(code: string | null | undefined) {
  return !!code && PANCAKE_TRIGGER_CODES.has(code);
}

export function isPancakeExtraLine(line: { code?: string | null; name?: string }) {
  if (isPancakeExtraCode(line.code ?? null)) return true;
  return (line.name ?? "").toLowerCase().includes("pancake");
}

export type IngredientNeedLine = {
  stock_item_id: string | null;
  code: string | null;
  quantity: number;
};

const TSP_G = 5; // approx salt tsp → grams

export type KitchenPrep = {
  /** Derived from recipe prep_lines codes for older CSV labels. */
  roshi: number;
  mashuni_cups: number;
  sausages: number;
  eggs_omelette: number;
  eggs_fried: number;
  eggs_boiled: number;
  eggs_scrambled: number;
  potato_servings: number;
  pancakes: number;
  /** Recipe-driven KOT lines (base Show on KOT + selected options). */
  prep_lines: KotBreakfastSideLine[];
};

export type IngredientNeed = {
  code: string;
  quantity: number;
};

function activeOrders(orders: OrderLike[]) {
  return orders.filter((o) => o.status !== "cancelled");
}

function bumpPrepLine(
  agg: Map<string, KotBreakfastSideLine>,
  line: RecipeNeedSource["lines"][number],
  qty: number,
  roomNumber: string,
) {
  if (!(qty > 0) || line.show_on_kot === false) return;
  const cur = agg.get(line.stock_item_id);
  if (cur) {
    cur.quantity += qty;
    if (!cur.rooms.includes(roomNumber)) cur.rooms.push(roomNumber);
  } else {
    agg.set(line.stock_item_id, {
      stock_item_id: line.stock_item_id,
      name: line.name ?? line.code ?? "Item",
      unit: line.unit ?? "",
      code: line.code,
      quantity: qty,
      rooms: [roomNumber],
    });
  }
}

/**
 * Kitchen prep from recipes only: base lines with Show on KOT + selected optional sides.
 * Egg styles come from the order; pancakes from room extras.
 */
export function computeKitchenPrep(
  orders: OrderLike[],
  extras: ExtrasLike[],
  /** Stock item ids that count as pancake pieces (from room_extras recipe). */
  pancakeStockItemIds: Set<string> = new Set(),
  recipes: RecipeNeedSource[] = [],
): KitchenPrep {
  const active = activeOrders(orders);
  const prepAgg = new Map<string, KotBreakfastSideLine>();

  const prep: KitchenPrep = {
    roshi: 0,
    mashuni_cups: 0,
    sausages: 0,
    eggs_omelette: 0,
    eggs_fried: 0,
    eggs_boiled: 0,
    eggs_scrambled: 0,
    potato_servings: 0,
    pancakes: 0,
    prep_lines: [],
  };

  for (const o of active) {
    const eggKey = `eggs_${o.eggStyle}` as
      | "eggs_omelette"
      | "eggs_fried"
      | "eggs_boiled"
      | "eggs_scrambled";
    prep[eggKey] += 1;

    const selected = new Set(o.selectedOptionIds ?? []);
    for (const line of baseLinesForType(recipes, o.breakfastType)) {
      bumpPrepLine(prepAgg, line, line.qty_per_serving, o.roomNumber);
    }
    for (const line of optionLinesForType(recipes, o.breakfastType)) {
      if (!selected.has(line.stock_item_id)) continue;
      bumpPrepLine(prepAgg, line, line.qty_per_serving, o.roomNumber);
    }
  }

  for (const e of extras) {
    let pieces = 0;
    for (const line of e.selectedLines) {
      if (line.quantity > 0 && pancakeStockItemIds.has(line.stockItemId)) {
        pieces += line.quantity;
      }
    }
    if (pieces > 0) prep.pancakes += pieces;
    else if (e.pancake) prep.pancakes += 1;
  }

  prep.prep_lines = [...prepAgg.values()].sort((a, b) => a.name.localeCompare(b.name));

  // Legacy summary counters from recipe codes (not hardcoded menu qty).
  for (const line of prep.prep_lines) {
    const code = (line.code ?? "").toLowerCase();
    if (code === "roshi") prep.roshi += line.quantity;
    else if (code === "mashuni") prep.mashuni_cups += line.quantity;
    else if (code === "sausages") prep.sausages += line.quantity;
    else if (code === "potatoes" || code === "potato" || code === "potato_portion") {
      prep.potato_servings += line.quantity;
    }
  }

  return prep;
}


/** Resolve selected configurable extras with quantities for a room. */
export function resolveSelectedExtras(
  e: ExtrasLike,
  roomExtraLines: RecipeNeedSource["lines"],
): ExtraSelectionLike[] {
  if (e.selectedLines.length) {
    const merged = new Map<string, number>();
    for (const line of e.selectedLines) {
      if (!line.stockItemId || !(line.quantity > 0)) continue;
      merged.set(line.stockItemId, (merged.get(line.stockItemId) ?? 0) + line.quantity);
    }
    return [...merged.entries()].map(([stockItemId, quantity]) => ({ stockItemId, quantity }));
  }
  // Legacy ids-only → quantity 1 each
  if (e.selectedItemIds.length) {
    return [...new Set(e.selectedItemIds)].map((stockItemId) => ({ stockItemId, quantity: 1 }));
  }
  const byCode = new Map(
    roomExtraLines.filter((l) => l.code).map((l) => [l.code!, l.stock_item_id]),
  );
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
    for (const code of PANCAKE_TRIGGER_CODES) {
      if (byCode.has(code)) {
        pushCode(code);
        break;
      }
    }
  }
  return out;
}

/** Aggregate configurable extras that should appear on KOT. */
export function computeKotExtras(
  extras: ExtrasLike[],
  recipes: RecipeNeedSource[],
): KotExtraLine[] {
  const roomExtraLines = recipes
    .filter((r) => r.apply_to === "room_extras")
    .flatMap((r) => r.lines);
  const byId = new Map(roomExtraLines.map((l) => [l.stock_item_id, l]));
  const agg = new Map<string, KotExtraLine>();

  for (const e of extras) {
    const selected = resolveSelectedExtras(e, roomExtraLines);
    for (const sel of selected) {
      const line = byId.get(sel.stockItemId);
      if (!line || line.show_on_kot === false) continue;
      const cur = agg.get(sel.stockItemId);
      const qty = sel.quantity;
      if (cur) {
        cur.quantity += qty;
        if (!cur.rooms.includes(e.roomNumber)) cur.rooms.push(e.roomNumber);
      } else {
        agg.set(sel.stockItemId, {
          stock_item_id: sel.stockItemId,
          name: line.name ?? line.code ?? "Extra",
          unit: line.unit ?? "",
          code: line.code,
          quantity: qty,
          rooms: [e.roomNumber],
        });
      }
    }
  }

  return [...agg.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function needKey(stockItemId: string | null, code: string | null) {
  if (stockItemId) return `id:${stockItemId}`;
  if (code) return `code:${code}`;
  return null;
}

function addNeed(
  map: Map<string, IngredientNeedLine>,
  stockItemId: string | null,
  code: string | null,
  qty: number,
) {
  if (!qty) return;
  const key = needKey(stockItemId, code);
  if (!key) return;
  const cur = map.get(key);
  if (cur) {
    cur.quantity += qty;
    return;
  }
  map.set(key, {
    stock_item_id: stockItemId,
    code,
    quantity: qty,
  });
}

function addByCode(map: Map<string, IngredientNeedLine>, code: string, qty: number) {
  addNeed(map, null, code, qty);
}

function applyRecipeLines(
  map: Map<string, IngredientNeedLine>,
  recipes: RecipeNeedSource[],
  applyTo: "maldivian" | "continental",
  servings: number,
) {
  if (servings <= 0) return false;
  const base = baseLinesForType(recipes, applyTo);
  if (!base.length) {
    // Recipe exists but only options — still counts as "has recipe" if any lines exist.
    const any = recipes.some((r) => r.apply_to === applyTo && r.lines.length > 0);
    return any;
  }
  for (const line of base) {
    addNeed(map, line.stock_item_id, line.code, line.qty_per_serving * servings);
  }
  return true;
}

/**
 * Ingredient requirements from orders + extras.
 * Breakfast stock usage comes only from Maldivian/Continental recipe base + selected options.
 * Room extras come only from selected room_extras recipe lines.
 */
export function computeIngredientNeeds(
  orders: OrderLike[],
  extras: ExtrasLike[],
  recipes: RecipeNeedSource[] = [],
): IngredientNeedLine[] {
  const active = activeOrders(orders);
  const map = new Map<string, IngredientNeedLine>();

  let maldivian = 0;
  let continental = 0;

  for (const o of active) {
    if (o.breakfastType === "maldivian") maldivian += 1;
    else continental += 1;

    const selected = new Set(o.selectedOptionIds ?? []);
    for (const line of optionLinesForType(recipes, o.breakfastType)) {
      if (!selected.has(line.stock_item_id)) continue;
      addNeed(map, line.stock_item_id, line.code, line.qty_per_serving);
    }
  }

  applyRecipeLines(map, recipes, "maldivian", maldivian);
  applyRecipeLines(map, recipes, "continental", continental);

  const roomExtraLines = recipes
    .filter((r) => r.apply_to === "room_extras")
    .flatMap((r) => r.lines);
  const roomExtraById = new Map(roomExtraLines.map((l) => [l.stock_item_id, l]));

  /** Pancake batter recipe is sized for 20 pieces; scale by selected piece count. */
  let pancakePieces = 0;
  for (const e of extras) {
    const selected = resolveSelectedExtras(e, roomExtraLines);
    for (const sel of selected) {
      const line = roomExtraById.get(sel.stockItemId);
      if (!line) continue;
      addNeed(map, line.stock_item_id, line.code, sel.quantity);
      if (isPancakeExtraLine(line)) {
        pancakePieces += sel.quantity;
      }
    }
    if (selected.length === 0 && e.pancake) pancakePieces += 1;
    for (const f of e.fruits) {
      if (f === "watermelon") addByCode(map, "watermelon", 1);
      else if (f === "papaya") addByCode(map, "papaya", 1);
      else if (f === "apple") addByCode(map, "apple", 4);
      else if (f === "orange") addByCode(map, "orange", 4);
    }
  }

  if (pancakePieces > 0) {
    const batches = pancakePieces / 20;
    addByCode(map, "flour", batches * 0.25);
    addByCode(map, "eggs", batches * 4);
    addByCode(map, "baking_powder", batches * 2 * TSP_G);
    addByCode(map, "sugar_g", batches * 200);
    addByCode(map, "banana_essence", batches * 15);
  }

  return [...map.values()].filter((l) => l.quantity > 0);
}


export type ServerSummaryOptionSide = {
  name: string;
  code: string | null;
  quantity: number;
};

export type ServerSummaryRow = {
  date: string;
  breakfast_time: string;
  room_number: string;
  maldivian: number;
  continental: number;
  /** Selected optional sides from Recipes (name + count). */
  option_sides: ServerSummaryOptionSide[];
  /** @deprecated Derived from option_sides codes for older CSV labels. */
  juice: number;
  /** @deprecated Derived from option_sides codes for older CSV labels. */
  tea_or_coffee: number;
  special_requests: string[];
  outside_normal_window: boolean;
};

/** Group active orders into server summary rows (by room + time). */
export function computeServerSummary(
  dateYmd: string,
  orders: OrderLike[],
  recipes: RecipeNeedSource[] = [],
): ServerSummaryRow[] {
  const active = activeOrders(orders);
  const key = (o: OrderLike) => `${o.roomNumber}|${o.servingTime}`;
  type Acc = ServerSummaryRow & { sideAgg: Map<string, ServerSummaryOptionSide> };
  const map = new Map<string, Acc>();

  for (const o of active) {
    const k = key(o);
    let row = map.get(k);
    if (!row) {
      row = {
        date: dateYmd,
        breakfast_time: o.servingTime,
        room_number: o.roomNumber,
        maldivian: 0,
        continental: 0,
        option_sides: [],
        juice: 0,
        tea_or_coffee: 0,
        special_requests: [],
        outside_normal_window: false,
        sideAgg: new Map(),
      };
      map.set(k, row);
    }
    if (o.breakfastType === "maldivian") row.maldivian += 1;
    else row.continental += 1;

    const selected = new Set(o.selectedOptionIds ?? []);
    const opts = optionLinesForType(recipes, o.breakfastType);
    if (opts.length) {
      for (const line of opts) {
        if (!selected.has(line.stock_item_id)) continue;
        const cur = row.sideAgg.get(line.stock_item_id);
        if (cur) cur.quantity += 1;
        else {
          row.sideAgg.set(line.stock_item_id, {
            name: line.name ?? line.code ?? "Side",
            code: line.code,
            quantity: 1,
          });
        }
        const code = (line.code ?? "").toLowerCase();
        if (code === "sunquick" || code === "juice") row.juice += 1;
        if (code === "tea" || code === "coffee") row.tea_or_coffee += 1;
      }
    } else {
      // Legacy orders before recipe options existed.
      if (o.juice) row.juice += 1;
      if (o.tea || o.coffee) row.tea_or_coffee += 1;
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
      const t = a.breakfast_time.localeCompare(b.breakfast_time);
      if (t !== 0) return t;
      return a.room_number.localeCompare(b.room_number);
    });
}

/** Normal window 07:00–09:30 inclusive, 15-min steps. */
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
