/**
 * Grouped kitchen plan for summaries UI + export:
 * main meals · by room · prepared needs · stock needed · stock alerts.
 */
import { prisma } from "../lib/prisma.js";
import { dec, parseYmd } from "../lib/dates.js";
import { toMoney } from "../lib/money.js";
import { loadMealCatalog } from "./mealCatalog.js";
import {
  computeIngredientNeeds,
  computeKitchenPrep,
  computeKotExtras,
  type ExtrasLike,
  type MealOrderLike,
  type MealPeriod,
} from "./mealRequirements.js";
import { buildShoppingListForDate } from "./stockPlanning.js";

export type KitchenPlanGuestRow = {
  room_number: string;
  guest_number: number;
  serving_time: string;
  meal_period: MealPeriod;
  menu_name: string;
  breakfast_type: string;
  egg_style: string;
  options: string[];
  special_requests: string | null;
  outside_normal_window: boolean;
};

export type KitchenPlanGroups = {
  main_meals: Array<{
    meal_period: MealPeriod;
    menu_name: string;
    menu_code: string | null;
    count: number;
    egg_styles: Array<{ style: string; count: number }>;
    estimated_cost: number | null;
    cost_per_serving: number | null;
    cost_incomplete: boolean;
  }>;
  by_room: Array<{
    room_number: string;
    guest_count: number;
    guests: Array<{
      guest_number: number;
      serving_time: string;
      meal_period: MealPeriod;
      menu_name: string;
      egg_style: string;
      options: string[];
      special_requests: string | null;
      outside_normal_window: boolean;
    }>;
  }>;
  prepared_needed: Array<{
    name: string;
    unit: string;
    code: string | null;
    quantity: number;
    rooms: string[];
  }>;
  stock_needed: Array<{
    stock_item_id: string | null;
    code: string | null;
    name: string;
    unit: string;
    required: number;
    on_hand: number;
    to_buy: number;
    min_stock: number;
    below_min: boolean;
  }>;
  /** @deprecated Prefer stock_needed.to_buy — kept for older clients. */
  stock_alerts: Array<{
    stock_item_id: string | null;
    code: string | null;
    name: string;
    unit: string;
    required: number;
    on_hand: number;
    to_buy: number;
    reasons: string[];
  }>;
  estimated_meals_cost: number | null;
  meals_cost_incomplete: boolean;
};

function costFromNeeds(
  needs: Array<{ stock_item_id: string | null; code: string | null; quantity: number }>,
  priceById: Map<string, number>,
  priceByCode: Map<string, number>,
): { cost: number; incomplete: boolean; hasAnyPrice: boolean } {
  let cost = 0;
  let incomplete = false;
  let hasAnyPrice = false;
  for (const need of needs) {
    if (!(need.quantity > 0)) continue;
    const price =
      (need.stock_item_id ? priceById.get(need.stock_item_id) : undefined) ??
      (need.code ? priceByCode.get(need.code) : undefined);
    if (price == null) {
      incomplete = true;
      continue;
    }
    hasAnyPrice = true;
    cost += need.quantity * price;
  }
  return { cost: toMoney(cost), incomplete, hasAnyPrice };
}

function optionNamesForOrder(
  order: MealOrderLike,
  menus: Awaited<ReturnType<typeof loadMealCatalog>>["menus"],
  addons: Awaited<ReturnType<typeof loadMealCatalog>>["addons"],
): string[] {
  const menu =
    (order.menuId ? menus.find((m) => m.id === order.menuId) : undefined) ??
    menus.find((m) => m.code === order.breakfastType);
  const names: string[] = [];
  const selected = new Set(order.selectedOptionIds ?? []);
  if (menu) {
    for (const line of menu.lines) {
      if (line.role !== "option") continue;
      if (selected.has(line.id) || (line.stock_item_id && selected.has(line.stock_item_id))) {
        names.push(line.display_name);
      }
    }
  }
  for (const a of addons) {
    if (selected.has(a.stock_item_id)) names.push(a.name);
  }
  return names;
}

export async function buildGroupedKitchenPlan(
  userId: string,
  dateStr: string,
  orders: MealOrderLike[],
  extras: ExtrasLike[],
  mealPeriod?: MealPeriod,
): Promise<{
  kitchen: ReturnType<typeof computeKitchenPrep>;
  kotExtras: ReturnType<typeof computeKotExtras>;
  schedule: KitchenPlanGuestRow[];
  groups: KitchenPlanGroups;
}> {
  const catalog = await loadMealCatalog(userId);
  const filteredOrders = orders
    .filter((o) => o.status !== "cancelled")
    .filter((o) => (mealPeriod ? o.mealPeriod === mealPeriod : true));
  const filteredExtras = mealPeriod
    ? extras.filter((e) => e.mealPeriod === mealPeriod)
    : extras;

  const kitchen = computeKitchenPrep(
    filteredOrders,
    filteredExtras,
    catalog.menus,
    catalog.addons,
    catalog.prepared,
  );
  const kotExtras = computeKotExtras(filteredExtras, catalog.addons);

  // —— Main meals ——
  const mealMap = new Map<
    string,
    {
      key: string;
      meal_period: MealPeriod;
      menu_name: string;
      menu_code: string | null;
      count: number;
      egg_styles: Map<string, number>;
      orders: MealOrderLike[];
    }
  >();
  for (const o of filteredOrders) {
    const menu =
      (o.menuId ? catalog.menus.find((m) => m.id === o.menuId) : undefined) ??
      catalog.menus.find((m) => m.code === o.breakfastType);
    const menuName = menu?.name ?? o.breakfastType ?? "Meal";
    const menuCode = menu?.code ?? o.breakfastType ?? null;
    const key = `${o.mealPeriod}|${menu?.id ?? menuCode ?? menuName}`;
    let row = mealMap.get(key);
    if (!row) {
      row = {
        key,
        meal_period: o.mealPeriod,
        menu_name: menuName,
        menu_code: menuCode,
        count: 0,
        egg_styles: new Map(),
        orders: [],
      };
      mealMap.set(key, row);
    }
    row.count += 1;
    row.orders.push(o);
    const style = o.eggStyle || "omelette";
    row.egg_styles.set(style, (row.egg_styles.get(style) ?? 0) + 1);
  }

  // —— Unit prices for meal cost estimates ——
  const stockItems = await prisma.stockItem.findMany({
    where: { userId, isActive: true },
    select: { id: true, code: true, lastUnitCost: true },
  });
  const priceById = new Map<string, number>();
  const priceByCode = new Map<string, number>();
  for (const s of stockItems) {
    if (s.lastUnitCost == null) continue;
    const p = dec(s.lastUnitCost);
    if (!(p >= 0)) continue;
    priceById.set(s.id, p);
    if (s.code) priceByCode.set(s.code, p);
  }

  const main_meals = [...mealMap.values()]
    .map((r) => {
      const needs = computeIngredientNeeds(
        r.orders,
        [],
        catalog.menus,
        catalog.prepared,
        catalog.addons,
      );
      const priced = costFromNeeds(needs, priceById, priceByCode);
      const estimated =
        priced.hasAnyPrice || needs.every((n) => !(n.quantity > 0))
          ? priced.cost
          : null;
      return {
        meal_period: r.meal_period,
        menu_name: r.menu_name,
        menu_code: r.menu_code,
        count: r.count,
        egg_styles: [...r.egg_styles.entries()]
          .map(([style, count]) => ({ style, count }))
          .sort((a, b) => a.style.localeCompare(b.style)),
        estimated_cost: estimated,
        cost_per_serving:
          estimated != null && r.count > 0 ? toMoney(estimated / r.count) : null,
        cost_incomplete: priced.incomplete && (priced.hasAnyPrice || estimated === 0),
      };
    })
    .sort((a, b) =>
      a.meal_period === b.meal_period
        ? a.menu_name.localeCompare(b.menu_name)
        : a.meal_period.localeCompare(b.meal_period),
    );

  const extrasNeeds = computeIngredientNeeds(
    [],
    filteredExtras,
    catalog.menus,
    catalog.prepared,
    catalog.addons,
  );
  const extrasPriced = costFromNeeds(extrasNeeds, priceById, priceByCode);
  const mealsCostSum = main_meals.reduce(
    (sum, m) => sum + (m.estimated_cost ?? 0),
    0,
  );
  const extrasCost = extrasPriced.hasAnyPrice ? extrasPriced.cost : 0;
  const anyMealCost = main_meals.some((m) => m.estimated_cost != null) || extrasPriced.hasAnyPrice;
  const estimated_meals_cost = anyMealCost
    ? toMoney(mealsCostSum + extrasCost)
    : null;
  const meals_cost_incomplete =
    main_meals.some((m) => m.cost_incomplete || m.estimated_cost == null) ||
    (extrasNeeds.some((n) => n.quantity > 0) && extrasPriced.incomplete);

  // —— By room ——
  const roomMap = new Map<string, KitchenPlanGroups["by_room"][number]>();
  for (const o of filteredOrders) {
    const menu =
      (o.menuId ? catalog.menus.find((m) => m.id === o.menuId) : undefined) ??
      catalog.menus.find((m) => m.code === o.breakfastType);
    let room = roomMap.get(o.roomNumber);
    if (!room) {
      room = { room_number: o.roomNumber, guest_count: 0, guests: [] };
      roomMap.set(o.roomNumber, room);
    }
    room.guest_count += 1;
    room.guests.push({
      guest_number: o.guestNumber,
      serving_time: o.servingTime,
      meal_period: o.mealPeriod,
      menu_name: menu?.name ?? o.breakfastType ?? "Meal",
      egg_style: o.eggStyle || "omelette",
      options: optionNamesForOrder(o, catalog.menus, catalog.addons),
      special_requests: o.specialRequests,
      outside_normal_window: o.outsideNormalWindow,
    });
  }
  for (const room of roomMap.values()) {
    room.guests.sort(
      (a, b) =>
        a.serving_time.localeCompare(b.serving_time) || a.guest_number - b.guest_number,
    );
  }
  const by_room = [...roomMap.values()].sort((a, b) =>
    a.room_number.localeCompare(b.room_number, undefined, { numeric: true }),
  );

  // —— Prepared needs: one row per item (sum qty across rooms / menus / extras) ——
  const preparedAgg = new Map<
    string,
    { name: string; unit: string; code: string | null; quantity: number; rooms: string[] }
  >();
  const mergePrepared = (l: {
    name: string;
    unit: string;
    code: string | null;
    quantity: number;
    rooms: string[];
  }) => {
    if (!(l.quantity > 0)) return;
    const key = (l.code || l.name).toLowerCase();
    const cur = preparedAgg.get(key);
    if (cur) {
      cur.quantity += l.quantity;
      for (const r of l.rooms) {
        if (!cur.rooms.includes(r)) cur.rooms.push(r);
      }
    } else {
      preparedAgg.set(key, {
        name: l.name,
        unit: l.unit,
        code: l.code,
        quantity: l.quantity,
        rooms: [...l.rooms],
      });
    }
  };
  for (const l of kitchen.prep_lines) mergePrepared(l);
  for (const l of kotExtras) mergePrepared(l);
  const prepared_needed = [...preparedAgg.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  // —— Stock shortfalls only (on hand not enough for these orders) ——
  // Never list every ingredient; only items where available < required (or missing).
  const shopping = await buildShoppingListForDate(userId, dateStr);
  let stock_needed: KitchenPlanGroups["stock_needed"];
  let stock_alerts: KitchenPlanGroups["stock_alerts"];

  if (mealPeriod) {
    const needs = computeIngredientNeeds(
      filteredOrders,
      filteredExtras,
      catalog.menus,
      catalog.prepared,
      catalog.addons,
    );
    const items = await prisma.stockItem.findMany({
      where: { userId, isActive: true },
    });
    const byId = new Map(items.map((i) => [i.id, i]));
    const byCode = new Map(items.filter((i) => i.code).map((i) => [i.code!, i]));
    const date = parseYmd(dateStr);

    stock_needed = [];
    stock_alerts = [];
    for (const need of needs) {
      if (!(need.quantity > 0)) continue;
      const item =
        (need.stock_item_id ? byId.get(need.stock_item_id) : undefined) ??
        (need.code ? byCode.get(need.code) : undefined);
      let onHand = 0;
      let minStock = 0;
      if (item) {
        const ledger = await prisma.stockLedgerDay.findUnique({
          where: {
            userId_stockItemId_date: { userId, stockItemId: item.id, date },
          },
        });
        if (ledger) {
          onHand = dec(ledger.opening) + dec(ledger.received);
        } else {
          const prev = await prisma.stockLedgerDay.findFirst({
            where: { userId, stockItemId: item.id, date: { lt: date } },
            orderBy: { date: "desc" },
          });
          if (prev) onHand = dec(prev.opening) + dec(prev.received) - dec(prev.used);
        }
        minStock = dec(item.minStock);
      }
      const required = need.quantity;
      const shortForOrders = !item || onHand < required;
      if (!shortForOrders) continue;

      const toBuy = Math.max(0, required - onHand) || (!item ? required : 0);
      const row = {
        stock_item_id: item?.id ?? need.stock_item_id,
        code: item?.code ?? need.code,
        name: item?.name ?? (need.code ?? "item").replace(/_/g, " "),
        unit: item?.unit ?? "",
        required,
        on_hand: onHand,
        to_buy: toBuy,
        min_stock: minStock,
        below_min: true,
      };
      stock_needed.push(row);
      stock_alerts.push({
        stock_item_id: row.stock_item_id,
        code: row.code,
        name: row.name,
        unit: row.unit,
        required,
        on_hand: onHand,
        to_buy: toBuy,
        reasons: !item ? ["missing_item"] : ["order_shortfall"],
      });
    }
    stock_needed.sort((a, b) => a.name.localeCompare(b.name));
    stock_alerts.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    // Only order shortfalls / missing — skip covered items and pure min-stock top-ups.
    const short = shopping.items.filter(
      (l) =>
        l.required > 0 &&
        (l.on_hand < l.required || l.reasons.includes("missing_item") || !l.stock_item_id),
    );
    stock_needed = short.map((l) => {
      const toBuy = Math.max(l.required - l.on_hand, 0) || (!l.stock_item_id ? l.required : 0);
      return {
        stock_item_id: l.stock_item_id,
        code: l.code,
        name: l.name,
        unit: l.unit,
        required: l.required,
        on_hand: l.on_hand,
        to_buy: toBuy,
        min_stock: l.min_stock,
        below_min: true,
      };
    });
    stock_alerts = stock_needed.map((l) => ({
      stock_item_id: l.stock_item_id,
      code: l.code,
      name: l.name,
      unit: l.unit,
      required: l.required,
      on_hand: l.on_hand,
      to_buy: l.to_buy,
      reasons: !l.stock_item_id ? ["missing_item"] : ["order_shortfall"],
    }));
  }

  const schedule: KitchenPlanGuestRow[] = filteredOrders
    .map((o) => {
      const menu =
        (o.menuId ? catalog.menus.find((m) => m.id === o.menuId) : undefined) ??
        catalog.menus.find((m) => m.code === o.breakfastType);
      return {
        room_number: o.roomNumber,
        guest_number: o.guestNumber,
        serving_time: o.servingTime,
        meal_period: o.mealPeriod,
        menu_name: menu?.name ?? o.breakfastType ?? "Meal",
        breakfast_type: o.breakfastType ?? "maldivian",
        egg_style: o.eggStyle ?? "omelette",
        options: optionNamesForOrder(o, catalog.menus, catalog.addons),
        special_requests: o.specialRequests,
        outside_normal_window: o.outsideNormalWindow,
      };
    })
    .sort((a, b) => a.serving_time.localeCompare(b.serving_time));

  return {
    kitchen,
    kotExtras,
    schedule,
    groups: {
      main_meals,
      by_room,
      prepared_needed,
      stock_needed,
      stock_alerts,
      estimated_meals_cost,
      meals_cost_incomplete,
    },
  };
}
