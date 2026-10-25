/**
 * Expand breakfast orders + room extras into kitchen prep counts and ingredient requirements
 * using PDF Use rules.
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

export type ExtrasLike = {
  roomNumber: string;
  fruits: string[];
  pancake: boolean;
  honey: boolean;
  nutella: boolean;
  cereal: boolean;
  waterBottle: boolean;
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

/** Kitchen Summary aggregates (PDF §6). Pancake counted as pieces requested (1 room extras = treat as batch request → track count of rooms requesting pancake). */
export function computeKitchenPrep(orders: OrderLike[], extras: ExtrasLike[]): KitchenPrep {
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

  // Pancake: PDF kitchen summary is "Number of pancake" — count rooms requesting pancake × 20 pieces (default batch), or count as 1 serving request?
  // Use pieces: each room requesting pancake contributes a 20-piece batch intent for prep planning display as batch rooms * 20.
  // For summary field "Number of pancake", show pieces from rooms that ordered pancake (20 per room request).
  for (const e of extras) {
    if (e.pancake) prep.pancakes += 20;
  }

  return prep;
}

/** Ingredient requirements keyed by stock item code (PDF Use rules). */
export function computeIngredientNeeds(
  orders: OrderLike[],
  extras: ExtrasLike[],
): Map<string, number> {
  const active = activeOrders(orders);
  const needs = new Map<string, number>();
  const add = (code: string, qty: number) => {
    if (qty === 0) return;
    needs.set(code, (needs.get(code) ?? 0) + qty);
  };

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
    add("eggs", 1);
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

  const roshiPieces = maldivian * 5;
  const roshiBatches = roshiPieces / 40;
  add("roshi", roshiPieces);
  add("flour", roshiBatches * 1); // 1 kg per 40
  add("cooking_oil", roshiBatches * 0.2); // 200 ml = 0.2 L per 40
  add("salt", roshiBatches * 6 * TSP_G); // 6 tsp salt per 40

  const mashuniBatches = maldivian; // 1 cup = 1 batch
  add("mashuni", mashuniBatches);
  add("coconut", mashuniBatches * 200);
  add("copy_faiy", mashuniBatches * 50);
  add("canned_tuna", mashuniBatches * 0.5);
  add("lime", mashuniBatches * 0.5);
  add("salt", mashuniBatches * 0.5 * TSP_G);

  add("potatoes", potatoMeals * 0.2);
  add("bread", continental * 3);
  add("sausages", continental * 2);
  add("butter", continental * 2);
  add("jam", continental * 1);

  add("sunquick", juiceCups * 4 * TBSP_L);
  add("tea", teaCount);
  add("coffee", coffeeCount);
  add("portion_sugar", sugarWithHotDrink);

  let pancakeBatches = 0;
  for (const e of extras) {
    if (e.pancake) pancakeBatches += 1;
    if (e.honey) add("honey", 1);
    if (e.nutella) add("nutella", 1);
    if (e.cereal) add("cornflakes", 1);
    if (e.waterBottle) add("water_bottle", 1);
    for (const f of e.fruits) {
      if (f === "watermelon") add("watermelon", 1);
      else if (f === "papaya") add("papaya", 1);
      else if (f === "apple") add("apple", 4);
      else if (f === "orange") add("orange", 4);
    }
  }

  // Each room requesting pancake → one 20-piece batch (PDF: per 20-piece batch rules; flour 0.5 kg per 40 → 0.25 kg per 20)
  if (pancakeBatches > 0) {
    add("flour", pancakeBatches * 0.25);
    add("eggs", pancakeBatches * 4);
    add("baking_powder", pancakeBatches * 2 * TSP_G);
    add("sugar_g", pancakeBatches * 200);
    add("banana_essence", pancakeBatches * 15);
  }

  return needs;
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
