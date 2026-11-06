import { Router } from "express";
import { z } from "zod";
import type { MealPeriod } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { dec, parseYmd, ymd } from "../lib/dates.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { scopeOrganizationData } from "../middleware/orgScope.js";
import { asyncHandler } from "../utils/http.js";
import { ensureKitchenStockSeed } from "../services/kitchenSeed.js";
import {
  computeIngredientNeeds,
  computeServerSummary,
  computeTableService,
  isOutsideNormalWindow,
  normalServingTimes,
  normalizeChoiceIds,
  type ExtrasLike,
  type MealOrderLike,
  type RecipeNeedSource,
} from "../services/breakfastRequirements.js";
import {
  applyKitchenUsageForDate,
  shoppingSummaryForDate,
} from "../services/stockPlanning.js";
import { loadMealCatalog } from "../services/mealCatalog.js";
import { ensureMealMenus } from "../services/mealMenus.js";
import { buildGroupedKitchenPlan } from "../services/kitchenPlan.js";
import { costIngredientNeeds } from "../services/stockCost.js";

export const kitchenRouter = Router();
kitchenRouter.use(requireAuth);
kitchenRouter.use(scopeOrganizationData);

const fruitEnum = z.enum(["watermelon", "apple", "papaya", "orange"]);
const mealPeriodEnum = z.enum(["breakfast", "lunch", "dinner"]);
const MEAL_PERIODS = ["breakfast", "lunch", "dinner"] as const satisfies readonly MealPeriod[];

function mealLabel(period: MealPeriod) {
  return period === "breakfast" ? "Breakfast" : period === "lunch" ? "Lunch" : "Dinner";
}

function mapOrder(o: {
  id: string;
  roomId: string;
  breakfastDate: Date;
  mealPeriod?: MealPeriod;
  menuId?: string | null;
  guestNumber: number;
  servingTime: string;
  outsideNormalWindow: boolean;
  breakfastType: string;
  eggStyle: string;
  potato: boolean;
  juice: boolean;
  tea: boolean;
  coffee: boolean;
  milk: boolean;
  sugar: boolean;
  selectedOptionIds?: string[];
  selectedChoiceIds?: unknown;
  specialRequests: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  room: { number: string };
  menu?: { name: string } | null;
}) {
  return {
    id: o.id,
    room_id: o.roomId,
    room_number: o.room.number,
    breakfast_date: ymd(o.breakfastDate),
    meal_period: o.mealPeriod ?? "breakfast",
    guest_number: o.guestNumber,
    serving_time: o.servingTime,
    outside_normal_window: o.outsideNormalWindow,
    menu_id: o.menuId ?? null,
    menu_name: o.menu?.name ?? null,
    breakfast_type: o.breakfastType,
    egg_style: o.eggStyle,
    potato: o.potato,
    juice: o.juice,
    tea: o.tea,
    coffee: o.coffee,
    milk: o.milk,
    sugar: o.sugar,
    selected_option_ids: o.selectedOptionIds ?? [],
    selected_choice_ids: normalizeChoiceIds(o.selectedChoiceIds),
    special_requests: o.specialRequests,
    status: o.status,
    created_at: o.createdAt.toISOString(),
    updated_at: o.updatedAt.toISOString(),
  };
}

async function loadOrdersForDate(userId: string, date: Date) {
  return prisma.breakfastOrder.findMany({
    where: { userId, breakfastDate: date },
    include: { room: true, menu: true },
    orderBy: [{ mealPeriod: "asc" }, { servingTime: "asc" }, { guestNumber: "asc" }],
  });
}

async function loadExtrasForDate(userId: string, date: Date) {
  return prisma.roomDayExtras.findMany({
    where: { userId, date },
    include: { room: true },
  });
}

function toOrderLikes(
  orders: Awaited<ReturnType<typeof loadOrdersForDate>>,
): MealOrderLike[] {
  return orders.map((o) => ({
    mealPeriod: o.mealPeriod ?? "breakfast",
    menuId: o.menuId,
    breakfastType: o.breakfastType,
    eggStyle: o.eggStyle,
    potato: o.potato,
    juice: o.juice,
    tea: o.tea,
    coffee: o.coffee,
    milk: o.milk,
    sugar: o.sugar,
    selectedOptionIds: o.selectedOptionIds ?? [],
    selectedChoiceIds: normalizeChoiceIds(o.selectedChoiceIds),
    status: o.status,
    servingTime: o.servingTime,
    outsideNormalWindow: o.outsideNormalWindow,
    specialRequests: o.specialRequests,
    roomNumber: o.room.number,
    guestNumber: o.guestNumber,
  }));
}

function parseSelectedLines(raw: unknown): Array<{ stockItemId: string; quantity: number }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ stockItemId: string; quantity: number }> = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const id =
      typeof rec.stock_item_id === "string"
        ? rec.stock_item_id
        : typeof rec.stockItemId === "string"
          ? rec.stockItemId
          : null;
    const qty = Number(rec.quantity);
    if (!id || !(qty > 0)) continue;
    out.push({ stockItemId: id, quantity: qty });
  }
  return out;
}

function toExtrasLikes(
  extras: Awaited<ReturnType<typeof loadExtrasForDate>>,
): ExtrasLike[] {
  return extras.map((e) => {
    const selectedLines = parseSelectedLines(e.selectedLines);
    const period = e.mealPeriod ?? "breakfast";
    return {
      roomNumber:
        period === "breakfast" ? e.room.number : `${e.room.number} (${mealLabel(period)})`,
      mealPeriod: period,
      fruits: e.fruits,
      selectedLines,
      selectedItemIds: e.selectedItemIds?.length
        ? e.selectedItemIds
        : selectedLines.map((l) => l.stockItemId),
      pancake: e.pancake,
      honey: e.honey,
      nutella: e.nutella,
      cereal: e.cereal,
      waterBottle: e.waterBottle,
    };
  });
}

type BreakfastOptionRow = {
  stock_item_id: string;
  name: string;
  unit: string;
  code: string | null;
  qty_per_serving: number;
  show_on_kot: boolean;
  notes: string | null;
};

async function loadRoomExtraOptions(userId: string): Promise<{
  options: Array<{
    stock_item_id: string;
    name: string;
    unit: string;
    code: string | null;
    qty_per_serving: number;
    notes: string | null;
    show_on_kot: boolean;
  }>;
  recipes: RecipeNeedSource[];
  breakfast_options: {
    maldivian: BreakfastOptionRow[];
    continental: BreakfastOptionRow[];
  };
}> {
  const recipes = await prisma.recipe.findMany({
    where: { userId, isActive: true },
    include: {
      lines: { include: { stockItem: true } },
    },
  });
  const sources: RecipeNeedSource[] = recipes.map((r) => ({
    apply_to: r.applyTo as RecipeNeedSource["apply_to"],
    lines: r.lines
      .filter((l) => l.stockItem.isActive)
      .map((l) => ({
        stock_item_id: l.stockItemId,
        code: l.stockItem.code,
        name: l.stockItem.name,
        unit: l.stockItem.unit,
        qty_per_serving: dec(l.qtyPerServing),
        show_on_kot: l.showOnKot,
        is_option: Boolean(l.isOption),
      })),
  }));
  const seen = new Set<string>();
  const options = [];
  for (const r of recipes.filter((x) => x.applyTo === "room_extras")) {
    for (const l of r.lines) {
      if (!l.stockItem.isActive || seen.has(l.stockItemId)) continue;
      seen.add(l.stockItemId);
      options.push({
        stock_item_id: l.stockItemId,
        name: l.stockItem.name,
        unit: l.stockItem.unit,
        code: l.stockItem.code,
        qty_per_serving: dec(l.qtyPerServing),
        notes: l.notes,
        show_on_kot: l.showOnKot,
      });
    }
  }
  options.sort((a, b) => a.name.localeCompare(b.name));

  const breakfastOptions: {
    maldivian: BreakfastOptionRow[];
    continental: BreakfastOptionRow[];
  } = {
    maldivian: [],
    continental: [],
  };
  for (const applyTo of ["maldivian", "continental"] as const) {
    const seenOpt = new Set<string>();
    for (const r of recipes.filter((x) => x.applyTo === applyTo)) {
      for (const l of r.lines) {
        if (!l.isOption || !l.stockItem.isActive || seenOpt.has(l.stockItemId)) continue;
        seenOpt.add(l.stockItemId);
        breakfastOptions[applyTo].push({
          stock_item_id: l.stockItemId,
          name: l.stockItem.name,
          unit: l.stockItem.unit,
          code: l.stockItem.code,
          qty_per_serving: dec(l.qtyPerServing),
          show_on_kot: l.showOnKot,
          notes: l.notes,
        });
      }
    }
    breakfastOptions[applyTo].sort((a, b) => a.name.localeCompare(b.name));
  }

  return { options, recipes: sources, breakfast_options: breakfastOptions };
}

/** Sync legacy potato/juice/tea/coffee/milk/sugar flags from selected option codes / names. */
function breakfastFlagsFromSelectedOptions(
  selectedIds: string[],
  options: Array<{ stock_item_id: string; code: string | null; name?: string | null }>,
) {
  const selected = selectedIds
    .map((id) => options.find((o) => o.stock_item_id === id))
    .filter((o): o is NonNullable<typeof o> => !!o);
  const codes = new Set(
    selected.map((o) => (o.code ?? "").toLowerCase()).filter(Boolean),
  );
  const names = selected.map((o) => (o.name ?? "").toLowerCase());
  return {
    potato:
      codes.has("potatoes") ||
      codes.has("potato") ||
      codes.has("potato_portion") ||
      codes.has("stir_fried_potato") ||
      names.some((n) => n.includes("potato")),
    juice:
      codes.has("sunquick") ||
      codes.has("juice") ||
      names.some((n) => n === "juice" || n.includes("sunquick")),
    tea: codes.has("tea"),
    coffee: codes.has("coffee"),
    milk: codes.has("milk"),
    sugar: codes.has("portion_sugar") || codes.has("sugar") || codes.has("sugar_g"),
  };
}

/** Map selected stock codes back onto legacy boolean columns for prep/compat. */
function legacyFlagsFromSelected(
  selectedIds: string[],
  options: Array<{ stock_item_id: string; code: string | null; name?: string }>,
) {
  const selected = selectedIds
    .map((id) => options.find((o) => o.stock_item_id === id))
    .filter((o): o is NonNullable<typeof o> => !!o);
  const codes = new Set(selected.map((o) => o.code).filter((c): c is string => !!c));
  return {
    pancake:
      codes.has("pancake") ||
      codes.has("pancake_batch") ||
      codes.has("pancakes") ||
      selected.some((o) => (o.name ?? "").toLowerCase().includes("pancake")),
    honey: codes.has("honey"),
    nutella: codes.has("nutella"),
    cereal: codes.has("cornflakes") || codes.has("cereal"),
    waterBottle: codes.has("water_bottle"),
  };
}

function emptyExtrasDto(mealPeriod: MealPeriod = "breakfast") {
  return {
    id: null as string | null,
    meal_period: mealPeriod,
    fruits: [] as string[],
    selected_item_ids: [] as string[],
    selected_lines: [] as Array<{
      stock_item_id: string;
      quantity: number;
      name?: string;
      unit?: string;
      code?: string | null;
      show_on_kot?: boolean;
    }>,
    pancake: false,
    honey: false,
    nutella: false,
    cereal: false,
    water_bottle: false,
  };
}

function mapExtrasDto(
  ex: {
    id: string;
    mealPeriod?: MealPeriod;
    fruits: string[];
    selectedItemIds?: string[];
    selectedLines?: unknown;
    pancake: boolean;
    honey: boolean;
    nutella: boolean;
    cereal: boolean;
    waterBottle: boolean;
  } | null,
  options: Array<{
    stock_item_id: string;
    name: string;
    unit: string;
    code: string | null;
    show_on_kot: boolean;
  }> = [],
  mealPeriod: MealPeriod = "breakfast",
) {
  if (!ex) return emptyExtrasDto(mealPeriod);
  const byId = new Map(options.map((o) => [o.stock_item_id, o]));
  let lines = parseSelectedLines(ex.selectedLines).map((l) => {
    const opt = byId.get(l.stockItemId);
    return {
      stock_item_id: l.stockItemId,
      quantity: l.quantity,
      name: opt?.name,
      unit: opt?.unit,
      code: opt?.code ?? null,
      show_on_kot: opt?.show_on_kot,
    };
  });
  if (!lines.length && (ex.selectedItemIds?.length ?? 0) > 0) {
    lines = (ex.selectedItemIds ?? []).map((id) => {
      const opt = byId.get(id);
      return {
        stock_item_id: id,
        quantity: 1,
        name: opt?.name,
        unit: opt?.unit,
        code: opt?.code ?? null,
        show_on_kot: opt?.show_on_kot,
      };
    });
  }
  return {
    id: ex.id,
    meal_period: ex.mealPeriod ?? mealPeriod,
    fruits: ex.fruits,
    selected_item_ids: lines.map((l) => l.stock_item_id),
    selected_lines: lines,
    pancake: ex.pancake,
    honey: ex.honey,
    nutella: ex.nutella,
    cereal: ex.cereal,
    water_bottle: ex.waterBottle,
  };
}

function extrasByMealDto(
  rows: Array<{
    id: string;
    roomId: string;
    mealPeriod: MealPeriod;
    fruits: string[];
    selectedItemIds?: string[];
    selectedLines?: unknown;
    pancake: boolean;
    honey: boolean;
    nutella: boolean;
    cereal: boolean;
    waterBottle: boolean;
  }>,
  roomId: string,
  options: Array<{
    stock_item_id: string;
    name: string;
    unit: string;
    code: string | null;
    show_on_kot: boolean;
  }>,
) {
  const forRoom = rows.filter((e) => e.roomId === roomId);
  const byPeriod = new Map(forRoom.map((e) => [e.mealPeriod, e]));
  return {
    breakfast: mapExtrasDto(byPeriod.get("breakfast") ?? null, options, "breakfast"),
    lunch: mapExtrasDto(byPeriod.get("lunch") ?? null, options, "lunch"),
    dinner: mapExtrasDto(byPeriod.get("dinner") ?? null, options, "dinner"),
  };
}

kitchenRouter.post(
  "/seed",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const rooms = await ensureKitchenStockSeed(userId);
    res.json({
      rooms: rooms.map((r) => ({ id: r.id, number: r.number })),
      serving_times: normalServingTimes(),
    });
  }),
);

kitchenRouter.get(
  "/rooms",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const rooms = await ensureKitchenStockSeed(userId);
    res.json({
      items: rooms.map((r) => ({ id: r.id, number: r.number })),
      serving_times: normalServingTimes(),
    });
  }),
);

const roomCreateSchema = z.object({
  number: z.string().min(1).max(20).trim(),
});

kitchenRouter.post(
  "/rooms",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    await ensureKitchenStockSeed(userId);
    const body = roomCreateSchema.parse(req.body);
    try {
      const room = await prisma.room.create({
        data: { userId, number: body.number },
      });
      res.status(201).json({ id: room.id, number: room.number });
    } catch {
      res.status(400).json({ error: "Room number already exists" });
    }
  }),
);

kitchenRouter.delete(
  "/rooms/:id",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const id = z.string().uuid().parse(req.params.id);
    const room = await prisma.room.findFirst({ where: { id, userId } });
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    const orderCount = await prisma.breakfastOrder.count({ where: { roomId: id } });
    if (orderCount > 0) {
      res.status(400).json({
        error: "Cannot delete room with breakfast order history. Remove orders first.",
      });
      return;
    }
    await prisma.$transaction([
      prisma.roomStay.deleteMany({ where: { roomId: id } }),
      prisma.roomDayExtras.deleteMany({ where: { roomId: id } }),
      prisma.roomDay.deleteMany({ where: { roomId: id } }),
      prisma.room.delete({ where: { id } }),
    ]);
    res.status(204).send();
  }),
);

const dayQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

kitchenRouter.get(
  "/day",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const { date: dateStr } = dayQuery.parse(req.query);
    const date = parseYmd(dateStr);
    const rooms = await ensureKitchenStockSeed(userId);

    const [roomDays, orders, extras, extraCatalog, mealCatalog] = await Promise.all([
      prisma.roomDay.findMany({ where: { userId, date } }),
      loadOrdersForDate(userId, date),
      loadExtrasForDate(userId, date),
      loadRoomExtraOptions(userId),
      loadMealCatalog(userId),
    ]);

    const dayByRoom = new Map(roomDays.map((d) => [d.roomId, d]));

    res.json({
      date: dateStr,
      serving_times: normalServingTimes(),
      meal_periods: MEAL_PERIODS,
      menus: mealCatalog.menusDto,
      extra_options: extraCatalog.options,
      breakfast_options: extraCatalog.breakfast_options,
      rooms: rooms.map((r) => {
        const day = dayByRoom.get(r.id);
        const roomOrders = orders.filter((o) => o.roomId === r.id);
        const mapped = roomOrders.map(mapOrder);
        const ordersByMeal = {
          breakfast: mapped.filter((o) => o.meal_period === "breakfast"),
          lunch: mapped.filter((o) => o.meal_period === "lunch"),
          dinner: mapped.filter((o) => o.meal_period === "dinner"),
        };
        const byMeal = extrasByMealDto(extras, r.id, extraCatalog.options);
        return {
          id: r.id,
          number: r.number,
          occupant_count: day?.occupantCount ?? 0,
          notes: day?.notes ?? null,
          breakfast_participants: ordersByMeal.breakfast.filter((o) => o.status !== "cancelled")
            .length,
          orders: ordersByMeal.breakfast,
          orders_by_meal: ordersByMeal,
          extras: byMeal.breakfast,
          extras_by_meal: byMeal,
        };
      }),
    });
  }),
);

const occupancySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  room_id: z.string().uuid(),
  occupant_count: z.number().int().min(0).max(10),
  notes: z.string().max(2000).optional().nullable(),
});

kitchenRouter.put(
  "/occupancy",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const body = occupancySchema.parse(req.body);
    await ensureKitchenStockSeed(userId);
    const room = await prisma.room.findFirst({
      where: { id: body.room_id, userId },
    });
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    const date = parseYmd(body.date);
    const row = await prisma.roomDay.upsert({
      where: { userId_roomId_date: { userId, roomId: body.room_id, date } },
      create: {
        userId,
        roomId: body.room_id,
        date,
        occupantCount: body.occupant_count,
        notes: body.notes ?? null,
      },
      update: {
        occupantCount: body.occupant_count,
        notes: body.notes ?? null,
      },
    });
    res.json({
      id: row.id,
      room_id: row.roomId,
      date: ymd(row.date),
      occupant_count: row.occupantCount,
      notes: row.notes,
    });
  }),
);

function eachYmdInclusive(fromYmd: string, toYmd: string): string[] {
  const out: string[] = [];
  const cur = parseYmd(fromYmd);
  const end = parseYmd(toYmd);
  if (cur.getTime() > end.getTime()) return out;
  while (cur.getTime() <= end.getTime()) {
    out.push(ymd(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

async function fillOccupancyRange(
  userId: string,
  roomId: string,
  fromYmd: string,
  toYmd: string,
  occupantCount: number,
  notes: string | null,
) {
  const dates = eachYmdInclusive(fromYmd, toYmd);
  for (const d of dates) {
    const date = parseYmd(d);
    await prisma.roomDay.upsert({
      where: { userId_roomId_date: { userId, roomId, date } },
      create: {
        userId,
        roomId,
        date,
        occupantCount,
        notes,
      },
      update: {
        occupantCount,
        notes,
      },
    });
  }
  return dates.length;
}

const staySchema = z.object({
  room_id: z.string().uuid(),
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  occupant_count: z.number().int().min(1).max(10).default(1),
  notes: z.string().max(2000).optional().nullable(),
});

function mapStay(s: {
  id: string;
  roomId: string;
  fromDate: Date;
  toDate: Date;
  occupantCount: number;
  notes: string | null;
  createdAt: Date;
  room: { number: string };
}) {
  return {
    id: s.id,
    room_id: s.roomId,
    room_number: s.room.number,
    from_date: ymd(s.fromDate),
    to_date: ymd(s.toDate),
    occupant_count: s.occupantCount,
    notes: s.notes,
    created_at: s.createdAt.toISOString(),
  };
}

kitchenRouter.get(
  "/stays",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    await ensureKitchenStockSeed(userId);
    const q = z
      .object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .parse(req.query);

    const stays = await prisma.roomStay.findMany({
      where: {
        userId,
        ...(q.from || q.to
          ? {
              AND: [
                q.to ? { fromDate: { lte: parseYmd(q.to) } } : {},
                q.from ? { toDate: { gte: parseYmd(q.from) } } : {},
              ],
            }
          : {}),
      },
      include: { room: true },
      orderBy: [{ fromDate: "desc" }, { room: { number: "asc" } }],
    });
    res.json({ items: stays.map(mapStay) });
  }),
);

kitchenRouter.post(
  "/stays",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    await ensureKitchenStockSeed(userId);
    const body = staySchema.parse(req.body);
    if (body.from_date > body.to_date) {
      res.status(400).json({ error: "from_date must be on or before to_date" });
      return;
    }
    const room = await prisma.room.findFirst({
      where: { id: body.room_id, userId },
    });
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }

    const stay = await prisma.roomStay.create({
      data: {
        userId,
        roomId: body.room_id,
        fromDate: parseYmd(body.from_date),
        toDate: parseYmd(body.to_date),
        occupantCount: body.occupant_count,
        notes: body.notes ?? null,
      },
      include: { room: true },
    });

    const days_filled = await fillOccupancyRange(
      userId,
      body.room_id,
      body.from_date,
      body.to_date,
      body.occupant_count,
      body.notes ?? null,
    );

    res.status(201).json({ ...mapStay(stay), days_filled });
  }),
);

kitchenRouter.delete(
  "/stays/:id",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const id = z.string().uuid().parse(req.params.id);
    const stay = await prisma.roomStay.findFirst({ where: { id, userId } });
    if (!stay) {
      res.status(404).json({ error: "Stay not found" });
      return;
    }

    // Clear occupancy on dates covered only by this stay (set to 0 when no overlapping stay remains)
    const dates = eachYmdInclusive(ymd(stay.fromDate), ymd(stay.toDate));
    for (const d of dates) {
      const date = parseYmd(d);
      const other = await prisma.roomStay.count({
        where: {
          userId,
          roomId: stay.roomId,
          id: { not: stay.id },
          fromDate: { lte: date },
          toDate: { gte: date },
        },
      });
      if (other === 0) {
        await prisma.roomDay.upsert({
          where: {
            userId_roomId_date: { userId, roomId: stay.roomId, date },
          },
          create: {
            userId,
            roomId: stay.roomId,
            date,
            occupantCount: 0,
          },
          update: { occupantCount: 0 },
        });
      }
    }

    await prisma.roomStay.delete({ where: { id } });
    res.status(204).send();
  }),
);

const extrasLineSchema = z.object({
  stock_item_id: z.string().uuid(),
  quantity: z.number().positive(),
});

const extrasSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  room_id: z.string().uuid(),
  /** Defaults to breakfast for older clients. */
  meal_period: mealPeriodEnum.default("breakfast"),
  fruits: z.array(fruitEnum).min(0).max(3),
  selected_lines: z.array(extrasLineSchema).default([]),
  /** Legacy — converted to qty 1 lines when selected_lines empty. */
  selected_item_ids: z.array(z.string().uuid()).optional(),
  pancake: z.boolean().optional(),
  honey: z.boolean().optional(),
  nutella: z.boolean().optional(),
  cereal: z.boolean().optional(),
  water_bottle: z.boolean().optional(),
});

kitchenRouter.put(
  "/extras",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const body = extrasSchema.parse(req.body);
    if (body.fruits.length > 0 && (body.fruits.length < 2 || body.fruits.length > 3)) {
      res.status(400).json({ error: "Select 2–3 fruit types, or none" });
      return;
    }
    const room = await prisma.room.findFirst({
      where: { id: body.room_id, userId },
    });
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    const { options } = await loadRoomExtraOptions(userId);
    const optionIds = new Set(options.map((o) => o.stock_item_id));
    const merged = new Map<string, number>();
    const incoming =
      body.selected_lines.length > 0
        ? body.selected_lines
        : (body.selected_item_ids ?? []).map((id) => ({ stock_item_id: id, quantity: 1 }));
    for (const line of incoming) {
      if (!optionIds.has(line.stock_item_id) || !(line.quantity > 0)) continue;
      merged.set(line.stock_item_id, (merged.get(line.stock_item_id) ?? 0) + line.quantity);
    }
    const selectedLines = [...merged.entries()].map(([stock_item_id, quantity]) => ({
      stock_item_id,
      quantity,
    }));
    const selectedIds = selectedLines.map((l) => l.stock_item_id);
    const fromSelection = legacyFlagsFromSelected(selectedIds, options);
    const flags = {
      pancake: fromSelection.pancake,
      honey: fromSelection.honey,
      nutella: fromSelection.nutella,
      cereal: fromSelection.cereal,
      waterBottle: fromSelection.waterBottle,
    };

    const date = parseYmd(body.date);
    const mealPeriod = body.meal_period;
    const row = await prisma.roomDayExtras.upsert({
      where: {
        userId_roomId_date_mealPeriod: {
          userId,
          roomId: body.room_id,
          date,
          mealPeriod,
        },
      },
      create: {
        userId,
        roomId: body.room_id,
        date,
        mealPeriod,
        fruits: body.fruits,
        selectedItemIds: selectedIds,
        selectedLines,
        pancake: flags.pancake,
        honey: flags.honey,
        nutella: flags.nutella,
        cereal: flags.cereal,
        waterBottle: flags.waterBottle,
      },
      update: {
        fruits: body.fruits,
        selectedItemIds: selectedIds,
        selectedLines,
        pancake: flags.pancake,
        honey: flags.honey,
        nutella: flags.nutella,
        cereal: flags.cereal,
        waterBottle: flags.waterBottle,
      },
    });
    const dateStr = ymd(row.date);
    await applyKitchenUsageForDate(userId, dateStr);
    const shopping = await shoppingSummaryForDate(userId, dateStr);
    res.json({
      ...mapExtrasDto(row, options, mealPeriod),
      room_id: row.roomId,
      date: dateStr,
      shopping,
    });
  }),
);

const orderCreateSchema = z.object({
  breakfast_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  room_id: z.string().uuid(),
  meal_period: z.enum(["breakfast", "lunch", "dinner"]).default("breakfast"),
  guest_number: z.number().int().min(1).max(3),
  serving_time: z.string().regex(/^\d{1,2}:\d{2}$/),
  menu_id: z.string().uuid().optional(),
  breakfast_type: z.enum(["maldivian", "continental"]).optional(),
  egg_style: z.enum(["omelette", "fried", "boiled", "scrambled"]).optional(),
  potato: z.boolean().optional(),
  juice: z.boolean().optional(),
  tea: z.boolean().optional(),
  coffee: z.boolean().optional(),
  milk: z.boolean().optional(),
  sugar: z.boolean().optional(),
  selected_option_ids: z.array(z.string().uuid()).optional(),
  selected_choice_ids: z.record(z.string(), z.string().uuid()).optional(),
  special_requests: z.string().max(2000).optional().nullable(),
  status: z.enum(["pending", "served", "cancelled"]).optional(),
});

kitchenRouter.post(
  "/orders",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const body = orderCreateSchema.parse(req.body);
    await ensureKitchenStockSeed(userId);
    await ensureMealMenus(userId);
    const room = await prisma.room.findFirst({
      where: { id: body.room_id, userId },
    });
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }

    const mealCatalog = await loadMealCatalog(userId);
    const mealPeriod = body.meal_period;
    let menu = body.menu_id
      ? mealCatalog.menus.find((m) => m.id === body.menu_id)
      : undefined;
    if (!menu && body.breakfast_type) {
      menu = mealCatalog.menus.find(
        (m) => m.code === body.breakfast_type && m.meal_period === "breakfast",
      );
    }
    if (!menu) {
      menu = mealCatalog.menus.find((m) => m.meal_period === mealPeriod);
    }
    if (!menu) {
      res.status(400).json({ error: "No meal menu configured for this period" });
      return;
    }

    const optionLineIds = new Set(
      menu.lines.filter((l) => l.role === "option").map((l) => l.id),
    );
    const optionStockIds = new Set(
      menu.lines
        .filter((l) => l.role === "option" && l.stock_item_id)
        .map((l) => l.stock_item_id!),
    );
    const addonIds = new Set(mealCatalog.addons.map((a) => a.stock_item_id));
    const allowedOptions = new Set([...optionLineIds, ...optionStockIds, ...addonIds]);
    let selectedOptionIds = (body.selected_option_ids ?? []).filter((id) =>
      allowedOptions.has(id),
    );

    const choiceLines = menu.lines.filter((l) => l.role === "choice");
    const selectedChoiceIds = normalizeChoiceIds(body.selected_choice_ids);
    for (const line of choiceLines) {
      if (!line.choice_group_key) continue;
      const pick = selectedChoiceIds[line.choice_group_key];
      if (pick && !choiceLines.some((c) => c.id === pick && c.choice_group_key === line.choice_group_key)) {
        delete selectedChoiceIds[line.choice_group_key];
      }
    }
    // Default missing required choice groups to first option
    const groups = new Map<string, typeof choiceLines>();
    for (const line of choiceLines) {
      if (!line.choice_group_key) continue;
      const list = groups.get(line.choice_group_key) ?? [];
      list.push(line);
      groups.set(line.choice_group_key, list);
    }
    for (const [key, lines] of groups) {
      if (!selectedChoiceIds[key] && lines[0]) selectedChoiceIds[key] = lines[0].id;
    }

    const eggChoice = choiceLines.find((l) => l.id === selectedChoiceIds.egg_style);
    const eggStyle =
      body.egg_style ??
      ((eggChoice?.notes as "omelette" | "fried" | "boiled" | "scrambled" | undefined) ??
        (menu.code === "continental" ? "fried" : "omelette"));

    const breakfastType =
      body.breakfast_type ??
      (menu.code === "continental" || menu.code === "maldivian"
        ? menu.code
        : "maldivian");

    const flagSources = [
      ...menu.lines
        .filter((l) => selectedOptionIds.includes(l.id) || (l.stock_item_id && selectedOptionIds.includes(l.stock_item_id)))
        .map((l) => ({
          stock_item_id: l.stock_item_id ?? l.id,
          code: l.stock_item_code ?? l.component_recipe_name,
          name: l.display_name,
        })),
      ...mealCatalog.addons
        .filter((a) => selectedOptionIds.includes(a.stock_item_id))
        .map((a) => ({ stock_item_id: a.stock_item_id, code: a.code, name: a.name })),
    ];
    const flags = breakfastFlagsFromSelectedOptions(
      flagSources.map((f) => f.stock_item_id),
      flagSources,
    );

    const outside = isOutsideNormalWindow(body.serving_time);
    const date = parseYmd(body.breakfast_date);

    try {
      const created = await prisma.breakfastOrder.create({
        data: {
          userId,
          roomId: body.room_id,
          breakfastDate: date,
          mealPeriod,
          menuId: menu.id,
          guestNumber: body.guest_number,
          servingTime: body.serving_time.padStart(5, "0"),
          outsideNormalWindow: outside,
          breakfastType,
          eggStyle,
          potato: flags.potato,
          juice: flags.juice,
          tea: flags.tea,
          coffee: flags.coffee,
          milk: flags.milk,
          sugar: flags.sugar,
          selectedOptionIds,
          selectedChoiceIds,
          specialRequests: body.special_requests ?? null,
          status: body.status ?? "pending",
        },
        include: { room: true, menu: true },
      });
      await applyKitchenUsageForDate(userId, body.breakfast_date);
      const shopping = await shoppingSummaryForDate(userId, body.breakfast_date);
      res.status(201).json({ ...mapOrder(created), shopping });
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002"
        ? "An order already exists for this room, date, meal, and guest number"
        : "Failed to create order";
      res.status(400).json({ error: msg });
    }
  }),
);

const orderUpdateSchema = orderCreateSchema
  .omit({ breakfast_date: true, room_id: true, guest_number: true })
  .partial()
  .extend({
    guest_number: z.number().int().min(1).max(3).optional(),
  });

kitchenRouter.patch(
  "/orders/:id",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const id = z.string().uuid().parse(req.params.id);
    const body = orderUpdateSchema.parse(req.body);
    const existing = await prisma.breakfastOrder.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    await ensureMealMenus(userId);
    const mealCatalog = await loadMealCatalog(userId);
    const mealPeriod = body.meal_period ?? existing.mealPeriod;
    let menu = (body.menu_id ?? existing.menuId)
      ? mealCatalog.menus.find((m) => m.id === (body.menu_id ?? existing.menuId))
      : undefined;
    if (!menu && (body.breakfast_type ?? existing.breakfastType)) {
      menu = mealCatalog.menus.find(
        (m) => m.code === (body.breakfast_type ?? existing.breakfastType),
      );
    }
    if (!menu) {
      res.status(400).json({ error: "Meal menu not found" });
      return;
    }

    const servingTime = body.serving_time
      ? body.serving_time.padStart(5, "0")
      : existing.servingTime;
    const outside =
      body.serving_time != null
        ? isOutsideNormalWindow(servingTime)
        : existing.outsideNormalWindow;

    const optionLineIds = new Set(
      menu.lines.filter((l) => l.role === "option").map((l) => l.id),
    );
    const optionStockIds = new Set(
      menu.lines
        .filter((l) => l.role === "option" && l.stock_item_id)
        .map((l) => l.stock_item_id!),
    );
    const addonIds = new Set(mealCatalog.addons.map((a) => a.stock_item_id));
    const allowedOptions = new Set([...optionLineIds, ...optionStockIds, ...addonIds]);
    const selectedOptionIds =
      body.selected_option_ids !== undefined
        ? body.selected_option_ids.filter((id) => allowedOptions.has(id))
        : (existing.selectedOptionIds ?? []).filter((id) => allowedOptions.has(id));

    const selectedChoiceIds = normalizeChoiceIds(
      body.selected_choice_ids ?? existing.selectedChoiceIds,
    );
    const choiceLines = menu.lines.filter((l) => l.role === "choice");
    const eggChoice = choiceLines.find((l) => l.id === selectedChoiceIds.egg_style);
    const eggStyle =
      body.egg_style ??
      existing.eggStyle ??
      ((eggChoice?.notes as "omelette" | "fried" | "boiled" | "scrambled" | undefined) ??
        "omelette");

    const breakfastType =
      body.breakfast_type ??
      existing.breakfastType ??
      (menu.code === "continental" || menu.code === "maldivian" ? menu.code : "maldivian");

    const flagSources = [
      ...menu.lines
        .filter(
          (l) =>
            selectedOptionIds.includes(l.id) ||
            (l.stock_item_id && selectedOptionIds.includes(l.stock_item_id)),
        )
        .map((l) => ({
          stock_item_id: l.stock_item_id ?? l.id,
          code: l.stock_item_code ?? l.component_recipe_name,
          name: l.display_name,
        })),
      ...mealCatalog.addons
        .filter((a) => selectedOptionIds.includes(a.stock_item_id))
        .map((a) => ({ stock_item_id: a.stock_item_id, code: a.code, name: a.name })),
    ];
    const flags = breakfastFlagsFromSelectedOptions(
      flagSources.map((f) => f.stock_item_id),
      flagSources,
    );

    const updated = await prisma.breakfastOrder.update({
      where: { id },
      data: {
        guestNumber: body.guest_number,
        mealPeriod,
        menuId: menu.id,
        servingTime,
        outsideNormalWindow: outside,
        breakfastType,
        eggStyle,
        potato: flags.potato,
        juice: flags.juice,
        tea: flags.tea,
        coffee: flags.coffee,
        milk: flags.milk,
        sugar: flags.sugar,
        selectedOptionIds,
        selectedChoiceIds,
        specialRequests: body.special_requests,
        status: body.status,
      },
      include: { room: true, menu: true },
    });
    const dateStr = ymd(existing.breakfastDate);
    await applyKitchenUsageForDate(userId, dateStr);
    const shopping = await shoppingSummaryForDate(userId, dateStr);
    res.json({ ...mapOrder(updated), shopping });
  }),
);

kitchenRouter.delete(
  "/orders/:id",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const id = z.string().uuid().parse(req.params.id);
    const existing = await prisma.breakfastOrder.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    const dateStr = ymd(existing.breakfastDate);
    await prisma.breakfastOrder.delete({ where: { id } });
    await applyKitchenUsageForDate(userId, dateStr);
    res.status(204).send();
  }),
);

kitchenRouter.get(
  "/summaries",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const { date: dateStr } = dayQuery.parse(req.query);
    const mealPeriod = z
      .enum(["breakfast", "lunch", "dinner"])
      .optional()
      .parse(typeof req.query.meal_period === "string" ? req.query.meal_period : undefined);
    const date = parseYmd(dateStr);
    await ensureKitchenStockSeed(userId);

    const [orders, extras, mealCatalog] = await Promise.all([
      loadOrdersForDate(userId, date),
      loadExtrasForDate(userId, date),
      loadMealCatalog(userId),
    ]);
    const orderLikes = toOrderLikes(orders);
    const extrasLikes = toExtrasLikes(extras);
    const server = computeServerSummary(dateStr, orderLikes, mealCatalog.menus, mealPeriod);
    const tableServiceRaw = computeTableService(orderLikes, mealCatalog.menus, mealPeriod);

    const stockForCost = await prisma.stockItem.findMany({
      where: { userId, isActive: true },
      select: { id: true, code: true, lastUnitCost: true },
    });
    const priceById = new Map<string, number>();
    const priceByCode = new Map<string, number>();
    for (const s of stockForCost) {
      if (s.lastUnitCost == null) continue;
      const p = dec(s.lastUnitCost);
      if (!(p >= 0)) continue;
      priceById.set(s.id, p);
      if (s.code) priceByCode.set(s.code, p);
    }
    const tableService = tableServiceRaw.map((row) => {
      const needs = computeIngredientNeeds(
        row._orders ?? [],
        [],
        mealCatalog.menus,
        mealCatalog.prepared,
        mealCatalog.addons,
      );
      const priced = costIngredientNeeds(needs, priceById, priceByCode);
      const { _orders, ...rest } = row;
      void _orders;
      return {
        ...rest,
        estimated_cost: priced.estimated_cost,
        cost_incomplete: priced.cost_incomplete,
      };
    });

    const { kitchen, kotExtras, schedule, groups } = await buildGroupedKitchenPlan(
      userId,
      dateStr,
      orderLikes,
      extrasLikes,
      mealPeriod,
    );

    res.json({
      date: dateStr,
      meal_period: mealPeriod ?? null,
      server_summary: server,
      table_service: tableService,
      kitchen_plan: {
        ...kitchen,
        prep_lines: kitchen.prep_lines.map((e) => ({
          name: e.name,
          unit: e.unit,
          code: e.code,
          quantity: e.quantity,
          rooms: e.rooms,
        })),
        extras: kotExtras.map((e) => ({
          name: e.name,
          unit: e.unit,
          code: e.code,
          quantity: e.quantity,
          rooms: e.rooms,
        })),
        schedule,
        main_meals: groups.main_meals,
        by_room: groups.by_room,
        prepared_needed: groups.prepared_needed,
        stock_needed: groups.stock_needed,
        stock_alerts: groups.stock_alerts,
        estimated_meals_cost: groups.estimated_meals_cost,
        meals_cost_incomplete: groups.meals_cost_incomplete,
      },
    });
  }),
);

kitchenRouter.get(
  "/requirements",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const { date: dateStr } = dayQuery.parse(req.query);
    const date = parseYmd(dateStr);
    await ensureKitchenStockSeed(userId);

    const [orders, extras, items, mealCatalog] = await Promise.all([
      loadOrdersForDate(userId, date),
      loadExtrasForDate(userId, date),
      prisma.stockItem.findMany({ where: { userId, isActive: true } }),
      loadMealCatalog(userId),
    ]);

    const byId = new Map(items.map((i) => [i.id, i]));
    const byCode = new Map(items.filter((i) => i.code).map((i) => [i.code!, i]));

    const needs = computeIngredientNeeds(
      toOrderLikes(orders),
      toExtrasLikes(extras),
      mealCatalog.menus,
      mealCatalog.prepared,
      mealCatalog.addons,
    );

    const lines = needs
      .map((need) => {
        const item =
          (need.stock_item_id ? byId.get(need.stock_item_id) : undefined) ??
          (need.code ? byCode.get(need.code) : undefined);
        const code = item?.code ?? need.code ?? "custom";
        return {
          code,
          stock_item_id: item?.id ?? need.stock_item_id,
          name: item?.name ?? code.replace(/_/g, " "),
          unit: item?.unit ?? "",
          required: need.quantity,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({ date: dateStr, items: lines });
  }),
);

/** Post computed kitchen usage into stock ledger Used for the date (idempotent). Also runs automatically when orders/extras change. */
kitchenRouter.post(
  "/apply-usage",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const body = z
      .object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
      .parse(req.body);
    await ensureKitchenStockSeed(userId);
    const result = await applyKitchenUsageForDate(userId, body.date);
    const shopping = await shoppingSummaryForDate(userId, body.date);
    res.json({ ...result, shopping });
  }),
);
