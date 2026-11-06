/**
 * Expand breakfast orders + room extras into kitchen prep counts and ingredient requirements.
 * Maldivian / Continental base ingredients come from editable Recipes when present;
 * drinks, potato option, and room extras keep PDF option rules.
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
  }>;
};

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

const TBSP_L = 0.015; // approx 15 ml
const TSP_G = 5; // approx salt tsp → grams

export type KitchenPrep = {
  roshi: number;
  mashuni_cups: number;
  sausages: number;
  eggs_omelette: number;
  eggs_fried: number;
  eggs_boiled: number;
  eggs_scrambled: number;
  potato_servings: number;
  pancakes: number;
};

export type IngredientNeed = {
  code: string;
  quantity: number;
};

function activeOrders(orders: OrderLike[]) {
  return orders.filter((o) => o.status !== "cancelled");
}

/** Kitchen Summary aggregates (PDF §6). */
export function computeKitchenPrep(
  orders: OrderLike[],
  extras: ExtrasLike[],
  /** Stock item ids that count as pancake batches (from room_extras recipe). */
  pancakeStockItemIds: Set<string> = new Set(),
): KitchenPrep {
  const active = activeOrders(orders);
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
  };

  for (const o of active) {
    if (o.breakfastType === "maldivian") {
      prep.roshi += 5;
      prep.mashuni_cups += 1;
      if (o.potato) prep.potato_servings += 1;
    } else {
      prep.sausages += 2;
    }
    prep[`eggs_${o.eggStyle}` as keyof KitchenPrep] =
      (prep[`eggs_${o.eggStyle}` as keyof KitchenPrep] as number) + 1;
  }

  for (const e of extras) {
    let pieces = 0;
    for (const line of e.selectedLines) {
      if (line.quantity > 0 && pancakeStockItemIds.has(line.stockItemId)) {
        pieces += line.quantity;
      }
    }
    // Quantity is the user-set amount (recipe “Qty when selected”), not a forced ×20 batch.
    if (pieces > 0) prep.pancakes += pieces;
    else if (e.pancake) prep.pancakes += 1;
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
  const matched = recipes.filter((r) => r.apply_to === applyTo && r.lines.length > 0);
  if (!matched.length) return false;
  for (const r of matched) {
    for (const line of r.lines) {
      addNeed(map, line.stock_item_id, line.code, line.qty_per_serving * servings);
    }
  }
  return true;
}

/** PDF hardcoded base for Maldivian / Continental when no recipe lines exist. */
function applyHardcodedBreakfastBase(
  map: Map<string, IngredientNeedLine>,
  maldivian: number,
  continental: number,
) {
  if (maldivian > 0) {
    const roshiPieces = maldivian * 5;
    const roshiBatches = roshiPieces / 40;
    addByCode(map, "roshi", roshiPieces);
    addByCode(map, "flour", roshiBatches * 1);
    addByCode(map, "cooking_oil", roshiBatches * 0.2);
    addByCode(map, "salt", roshiBatches * 6 * TSP_G);
    addByCode(map, "mashuni", maldivian);
    addByCode(map, "coconut", maldivian * 200);
    addByCode(map, "copy_faiy", maldivian * 50);
    addByCode(map, "canned_tuna", maldivian * 0.5);
    addByCode(map, "lime", maldivian * 0.5);
    addByCode(map, "salt", maldivian * 0.5 * TSP_G);
    addByCode(map, "eggs", maldivian);
  }
  if (continental > 0) {
    addByCode(map, "bread", continental * 3);
    addByCode(map, "sausages", continental * 2);
    addByCode(map, "butter", continental * 2);
    addByCode(map, "jam", continental * 1);
    addByCode(map, "eggs", continental);
  }
}

/**
 * Ingredient requirements from orders + extras.
 * When Recipes exist for maldivian/continental, those lines drive base stock usage
 * (so Kitchen → Recipes edit/delete/add items actually configure breakfasts).
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
  let potatoMeals = 0;
  let juiceCups = 0;
  let teaCount = 0;
  let coffeeCount = 0;
  let sugarWithHotDrink = 0;

  for (const o of active) {
    if (o.breakfastType === "maldivian") {
      maldivian += 1;
      if (o.potato) potatoMeals += 1;
    } else {
      continental += 1;
    }
    if (o.juice) juiceCups += 1;
    if (o.tea) {
      teaCount += 1;
      if (o.sugar) sugarWithHotDrink += 1;
    }
    if (o.coffee) {
      coffeeCount += 1;
      if (o.sugar) sugarWithHotDrink += 1;
    }
  }

  const usedMalRecipe = applyRecipeLines(map, recipes, "maldivian", maldivian);
  const usedConRecipe = applyRecipeLines(map, recipes, "continental", continental);
  if (!usedMalRecipe || !usedConRecipe) {
    applyHardcodedBreakfastBase(
      map,
      usedMalRecipe ? 0 : maldivian,
      usedConRecipe ? 0 : continental,
    );
  }

  addByCode(map, "potatoes", potatoMeals * 0.2);
  addByCode(map, "sunquick", juiceCups * 4 * TBSP_L);
  addByCode(map, "tea", teaCount);
  addByCode(map, "coffee", coffeeCount);
  addByCode(map, "portion_sugar", sugarWithHotDrink);

  const roomExtraLines = recipes
    .filter((r) => r.apply_to === "room_extras")
    .flatMap((r) => r.lines);
  const roomExtraById = new Map(roomExtraLines.map((l) => [l.stock_item_id, l]));
  const hasRoomExtraRecipe = roomExtraLines.length > 0;

  /** Pancake batter recipe is sized for 20 pieces; scale by selected piece count. */
  let pancakePieces = 0;
  for (const e of extras) {
    if (hasRoomExtraRecipe) {
      const selected = resolveSelectedExtras(e, roomExtraLines);
      let pancakeFromSelection = 0;
      for (const sel of selected) {
        const line = roomExtraById.get(sel.stockItemId);
        if (!line) continue;
        // User-entered quantity is in stock units (defaults from recipe qty when added).
        addNeed(map, line.stock_item_id, line.code, sel.quantity);
        if (isPancakeExtraLine(line)) {
          pancakeFromSelection += sel.quantity;
        }
        // Potato portion extra → 0.2 kg potatoes each (same as Maldivian potato serving).
        if ((line.code ?? "").toLowerCase() === "potato_portion") {
          addByCode(map, "potatoes", sel.quantity * 0.2);
        }
      }
      if (pancakeFromSelection > 0) pancakePieces += pancakeFromSelection;
      else if (e.pancake) pancakePieces += 1;
    } else {
      if (e.pancake) pancakePieces += 1;
      if (e.honey) addByCode(map, "honey", 1);
      if (e.nutella) addByCode(map, "nutella", 1);
      if (e.cereal) addByCode(map, "cornflakes", 1);
      if (e.waterBottle) addByCode(map, "water_bottle", 1);
    }
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


export type ServerSummaryRow = {
  date: string;
  breakfast_time: string;
  room_number: string;
  maldivian: number;
  continental: number;
  juice: number;
  tea_or_coffee: number;
  special_requests: string[];
  outside_normal_window: boolean;
};

/** Group active orders into server summary rows (by room + time). */
export function computeServerSummary(
  dateYmd: string,
  orders: OrderLike[],
): ServerSummaryRow[] {
  const active = activeOrders(orders);
  const key = (o: OrderLike) => `${o.roomNumber}|${o.servingTime}`;
  const map = new Map<string, ServerSummaryRow>();

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
        juice: 0,
        tea_or_coffee: 0,
        special_requests: [],
        outside_normal_window: false,
      };
      map.set(k, row);
    }
    if (o.breakfastType === "maldivian") row.maldivian += 1;
    else row.continental += 1;
    if (o.juice) row.juice += 1;
    if (o.tea || o.coffee) row.tea_or_coffee += 1;
    if (o.specialRequests?.trim()) row.special_requests.push(o.specialRequests.trim());
    if (o.outsideNormalWindow) row.outside_normal_window = true;
  }

  return [...map.values()].sort((a, b) => {
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
