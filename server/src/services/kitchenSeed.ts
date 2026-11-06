import { prisma } from "../lib/prisma.js";

const ROOM_NUMBERS = ["101", "102", "103", "104", "105", "106"] as const;

/** PDF inventory catalog with Use notes and pack info. */
export const PDF_STOCK_CATALOG: Array<{
  code: string;
  name: string;
  unit: string;
  useNotes: string;
  packInfo?: string;
  sortOrder: number;
}> = [
  {
    code: "flour",
    name: "All-purpose flour",
    unit: "KG",
    useNotes: "Roshi: 40 per kg. Pancakes: 0.5 kg per 40 pieces.",
    sortOrder: 10,
  },
  {
    code: "cooking_oil",
    name: "Cooking oil",
    unit: "L",
    useNotes: "Roshi: 200 ml per 40 pieces.",
    sortOrder: 20,
  },
  {
    code: "salt",
    name: "Salt",
    unit: "G",
    useNotes: "Roshi: 2 tbsp = 6 tsp per 40 pieces. Mashuni: about 0.5 tsp per batch.",
    sortOrder: 30,
  },
  {
    code: "coconut",
    name: "Coconut",
    unit: "G",
    useNotes: "Mashuni: 200 g per batch. 1 medium coconut is 200 g.",
    packInfo: "1 medium coconut = 200 g",
    sortOrder: 40,
  },
  {
    code: "copy_faiy",
    name: "Copy Faiy",
    unit: "G",
    useNotes: "Mashuni: 50 g per batch. 1 medium leaf is 50 g.",
    packInfo: "1 medium leaf = 50 g",
    sortOrder: 50,
  },
  {
    code: "canned_tuna",
    name: "Canned tuna",
    unit: "Number",
    useNotes: "Mashuni: 0.5 can per batch. Can size not specified.",
    sortOrder: 60,
  },
  {
    code: "lime",
    name: "Lime",
    unit: "Number",
    useNotes: "Mashuni: 0.5 lime per batch.",
    sortOrder: 70,
  },
  {
    code: "eggs",
    name: "Eggs",
    unit: "Number",
    useNotes: "1 per meal, plus 4 per 20-piece pancake batch.",
    sortOrder: 80,
  },
  {
    code: "baking_powder",
    name: "Baking powder",
    unit: "G",
    useNotes: "Pancakes: 2 tsp per 20-piece batch.",
    sortOrder: 90,
  },
  {
    code: "sugar_g",
    name: "Sugar",
    unit: "G",
    useNotes: "200 g per 20-piece pancake batch.",
    sortOrder: 100,
  },
  {
    code: "banana_essence",
    name: "Banana essence",
    unit: "Ml",
    useNotes: "1 tbsp per 20-piece pancake batch.",
    sortOrder: 110,
  },
  {
    code: "potatoes",
    name: "Potatoes",
    unit: "Kg",
    useNotes: "200 g (0.2 kg) per Maldivian meal or potato-portion extra.",
    sortOrder: 120,
  },
  {
    code: "potato_portion",
    name: "Potato portion",
    unit: "Number",
    useNotes: "Room extra: 1 portion uses 0.2 kg potatoes.",
    sortOrder: 125,
  },
  {
    code: "sunquick",
    name: "Sunquick concentrate",
    unit: "L",
    useNotes: "4 tbsp per cup of juice.",
    sortOrder: 130,
  },
  {
    code: "coffee",
    name: "Coffee",
    unit: "Portion Pack",
    useNotes: "1 portion packet per coffee.",
    packInfo: "1 pack has 200 portions",
    sortOrder: 140,
  },
  {
    code: "tea",
    name: "Tea",
    unit: "Teabag",
    useNotes: "1 teabag per tea.",
    packInfo: "1 box has 20 bags",
    sortOrder: 150,
  },
  {
    code: "milk",
    name: "Milk",
    unit: "Portion",
    useNotes: "1 portion when milk is selected with breakfast.",
    sortOrder: 155,
  },
  {
    code: "sausages",
    name: "Sausages",
    unit: "Number",
    useNotes: "2 per Continental meal.",
    packInfo: "1 packet has 12 numbers",
    sortOrder: 160,
  },
  {
    code: "jam",
    name: "Jam",
    unit: "Portion",
    useNotes: "1 per Continental meal.",
    packInfo: "1 box has 100",
    sortOrder: 170,
  },
  {
    code: "butter",
    name: "Butter",
    unit: "Portion",
    useNotes: "2 per Continental meal.",
    packInfo: "1 box has 100",
    sortOrder: 180,
  },
  {
    code: "nutella",
    name: "Nutella",
    unit: "Portion",
    useNotes: "1 portion per room, as alternative to honey.",
    packInfo: "1 jar has 50 portions",
    sortOrder: 190,
  },
  {
    code: "honey",
    name: "Honey",
    unit: "Portion",
    useNotes: "1 portion per room, as alternative to Nutella.",
    packInfo: "1 jar has 50 portions",
    sortOrder: 200,
  },
  {
    code: "bread",
    name: "Bread",
    unit: "Slice",
    useNotes: "3 slices per Continental meal.",
    packInfo: "1 bread has 12 slices",
    sortOrder: 210,
  },
  {
    code: "cornflakes",
    name: "Cornflakes",
    unit: "Portion",
    useNotes: "1 portion on request.",
    packInfo: "1 box can give 10 servings",
    sortOrder: 220,
  },
  {
    code: "papaya",
    name: "Papaya",
    unit: "Slice",
    useNotes: "1 slice per room when selected.",
    packInfo: "1 papaya is 4 slices",
    sortOrder: 230,
  },
  {
    code: "watermelon",
    name: "Water Melon",
    unit: "Slice",
    useNotes: "1 slice per room when selected.",
    packInfo: "1 watermelon is 5 slices",
    sortOrder: 240,
  },
  {
    code: "apple",
    name: "Apple",
    unit: "Slice",
    useNotes: "4 slices per room when selected.",
    packInfo: "1 apple is 8 slices",
    sortOrder: 250,
  },
  {
    code: "orange",
    name: "Orange",
    unit: "Slice",
    useNotes: "4 slices per room when selected.",
    packInfo: "1 orange is 8 slices",
    sortOrder: 260,
  },
  {
    code: "portion_sugar",
    name: "Portion Sugar",
    unit: "Portion",
    useNotes: "1 with each coffee and tea.",
    packInfo: "One sugar bundle is 200 portions",
    sortOrder: 270,
  },
  {
    code: "water_bottle",
    name: "1.5 L water bottle",
    unit: "Number",
    useNotes: "1 bottle per room when selected (extras).",
    sortOrder: 280,
  },
  {
    code: "pancake_batch",
    name: "Pancakes",
    unit: "Number",
    useNotes:
      "Room extra counted in pieces (Qty when selected). Batter ingredients scale at 20 pieces = 1 batch (0.25 kg flour, 4 eggs, etc.).",
    sortOrder: 285,
  },
  {
    code: "roshi",
    name: "Roshi (prepared)",
    unit: "Number",
    useNotes: "5 per Maldivian meal. Tracked as prep quantity; flour/oil/salt drive ingredient use.",
    sortOrder: 5,
  },
  {
    code: "mashuni",
    name: "Mashuni (cups)",
    unit: "Number",
    useNotes: "1 cup per Maldivian meal. Batch ingredients: coconut, copy faiy, tuna, lime, salt.",
    sortOrder: 6,
  },
];

const OTHER_SEED = [
  {
    code: "toilet_tissue",
    name: "Toilet tissue",
    unit: "Roll",
    useNotes: "Housekeeping stock (non-breakfast).",
    sortOrder: 900,
  },
] as const;

/** Ensure rooms 101–106 and PDF stock catalog exist for the user. */
export async function ensureKitchenStockSeed(userId: string) {
  for (const number of ROOM_NUMBERS) {
    await prisma.room.upsert({
      where: { userId_number: { userId, number } },
      create: { userId, number },
      update: {},
    });
  }

  for (const item of PDF_STOCK_CATALOG) {
    await prisma.stockItem.upsert({
      where: { userId_code: { userId, code: item.code } },
      create: {
        userId,
        code: item.code,
        name: item.name,
        unit: item.unit,
        kind: "kitchen",
        minStock: 0,
        useNotes: item.useNotes,
        packInfo: item.packInfo ?? null,
        sortOrder: item.sortOrder,
      },
      // Never overwrite user edits (name, unit, notes, soft-delete).
      update: {},
    });
  }

  for (const item of OTHER_SEED) {
    await prisma.stockItem.upsert({
      where: { userId_code: { userId, code: item.code } },
      create: {
        userId,
        code: item.code,
        name: item.name,
        unit: item.unit,
        kind: "other",
        minStock: 0,
        useNotes: item.useNotes,
        sortOrder: item.sortOrder,
      },
      update: {},
    });
  }

  await ensureDefaultRecipes(userId);
  await ensurePreparedRecipes(userId);
  await ensureRoomExtrasPatches(userId);
  await ensureBreakfastOptionPatches(userId);
  const { ensureMealMenus } = await import("./mealMenus.js");
  await ensureMealMenus(userId);

  const rooms = await prisma.room.findMany({
    where: { userId },
    orderBy: { number: "asc" },
  });
  return rooms;
}

type SeedLine = {
  stockCode: string;
  qty: number;
  notes?: string;
  showOnKot?: boolean;
  isOption?: boolean;
};

async function upsertRecipe(
  userId: string,
  def: {
    code: string;
    name: string;
    applyTo: "maldivian" | "continental" | "room_extras" | "custom";
    kind?: "menu_legacy" | "prepared" | "addons";
    notes?: string;
    lines: SeedLine[];
  },
) {
  const items = await prisma.stockItem.findMany({
    where: { userId, code: { in: def.lines.map((l) => l.stockCode) } },
  });
  const byCode = new Map(items.map((i) => [i.code!, i.id]));
  const kind =
    def.kind ??
    (def.applyTo === "custom" ? "prepared" : def.applyTo === "room_extras" ? "addons" : "menu_legacy");

  const existing = await prisma.recipe.findUnique({
    where: { userId_code: { userId, code: def.code } },
    include: { lines: { include: { stockItem: true } } },
  });

  if (existing) {
    // Align kind only; never overwrite user-edited lines.
    if (existing.kind !== kind) {
      return prisma.recipe.update({
        where: { id: existing.id },
        data: { kind },
        include: { lines: { include: { stockItem: true } } },
      });
    }
    // If a prepared recipe was created empty, fill default BOM once.
    if (kind === "prepared" && existing.lines.length === 0) {
      await prisma.recipeLine.createMany({
        data: def.lines
          .filter((l) => byCode.has(l.stockCode))
          .map((l) => ({
            recipeId: existing.id,
            stockItemId: byCode.get(l.stockCode)!,
            qtyPerServing: l.qty,
            notes: l.notes ?? null,
            showOnKot: l.showOnKot ?? false,
            isOption: false,
          })),
      });
      return prisma.recipe.findUniqueOrThrow({
        where: { id: existing.id },
        include: { lines: { include: { stockItem: true } } },
      });
    }
    return existing;
  }

  return prisma.recipe.create({
    data: {
      userId,
      code: def.code,
      name: def.name,
      applyTo: def.applyTo,
      kind,
      notes: def.notes ?? null,
      lines: {
        create: def.lines
          .filter((l) => byCode.has(l.stockCode))
          .map((l) => ({
            stockItemId: byCode.get(l.stockCode)!,
            qtyPerServing: l.qty,
            notes: l.notes ?? null,
            showOnKot: l.showOnKot ?? true,
            isOption: Boolean(l.isOption),
          })),
      },
    },
    include: { lines: { include: { stockItem: true } } },
  });
}

/**
 * Prepared items: plated/served dishes with stock BOMs (Recipes → Prepared).
 * Menu lines should map to these (or to truly served single stock like eggs / tea).
 * Raw ingredients never sit alone on a meal menu.
 */
export async function ensurePreparedRecipes(userId: string) {
  await upsertRecipe(userId, {
    code: "mashuni_cups",
    name: "Mashuni cups",
    applyTo: "custom",
    kind: "prepared",
    notes: "1 cup per Maldivian breakfast. Stock BOM is per cup.",
    lines: [
      { stockCode: "coconut", qty: 200, notes: "200 g per cup", showOnKot: false },
      { stockCode: "copy_faiy", qty: 50, notes: "50 g per cup", showOnKot: false },
      { stockCode: "canned_tuna", qty: 0.5, notes: "0.5 can per cup", showOnKot: false },
      { stockCode: "lime", qty: 0.5, notes: "0.5 lime per cup", showOnKot: false },
      { stockCode: "salt", qty: 2.5, notes: "~0.5 tsp per cup", showOnKot: false },
    ],
  });

  await upsertRecipe(userId, {
    code: "roshi",
    name: "Roshi",
    applyTo: "custom",
    kind: "prepared",
    notes: "BOM per 1 roshi. Maldivian menu uses qty 5.",
    lines: [
      { stockCode: "flour", qty: 1 / 40, notes: "40 roshi per kg", showOnKot: false },
      { stockCode: "cooking_oil", qty: 0.2 / 40, notes: "200 ml per 40 roshi", showOnKot: false },
      { stockCode: "salt", qty: 30 / 40, notes: "30 g (6 tsp) per 40 roshi", showOnKot: false },
    ],
  });

  await upsertRecipe(userId, {
    code: "stir_fried_potato",
    name: "Stir-fried potato",
    applyTo: "custom",
    kind: "prepared",
    notes: "1 side portion. Maldivian optional side / room potato extra.",
    lines: [
      { stockCode: "potatoes", qty: 0.2, notes: "200 g per portion", showOnKot: false },
    ],
  });

  await upsertRecipe(userId, {
    code: "juice",
    name: "Juice",
    applyTo: "custom",
    kind: "prepared",
    notes: "1 cup. Concentrate is not served raw — diluted juice is.",
    lines: [
      { stockCode: "sunquick", qty: 0.06, notes: "~4 tbsp concentrate per cup", showOnKot: false },
    ],
  });

  await upsertRecipe(userId, {
    code: "continental_plate",
    name: "Continental plate",
    applyTo: "custom",
    kind: "prepared",
    notes: "Bread, sausages, butter & jam as one plated set. Egg is separate (style choice).",
    lines: [
      { stockCode: "bread", qty: 3, notes: "3 slices", showOnKot: false },
      { stockCode: "sausages", qty: 2, notes: "2 pieces", showOnKot: false },
      { stockCode: "butter", qty: 2, notes: "2 portions", showOnKot: false },
      { stockCode: "jam", qty: 1, notes: "1 portion", showOnKot: false },
    ],
  });

  await upsertRecipe(userId, {
    code: "pancakes",
    name: "Pancakes",
    applyTo: "custom",
    kind: "prepared",
    notes:
      "Batter BOM per 20-piece batch. Room extras count pieces; stock planning scales batches = pieces / 20.",
    lines: [
      { stockCode: "flour", qty: 0.25, notes: "0.25 kg per 20 pieces", showOnKot: false },
      { stockCode: "eggs", qty: 4, notes: "4 eggs per 20 pieces", showOnKot: false },
      { stockCode: "baking_powder", qty: 10, notes: "2 tsp (~10 g) per 20", showOnKot: false },
      { stockCode: "sugar_g", qty: 200, notes: "200 g per 20 pieces", showOnKot: false },
      { stockCode: "banana_essence", qty: 15, notes: "1 tbsp per 20 pieces", showOnKot: false },
    ],
  });
}

/** Seed editable PDF breakfast recipes once per user (never overwrite edits). */
async function ensureDefaultRecipes(userId: string) {
  await upsertRecipe(userId, {
    code: "maldivian",
    name: "Maldivian breakfast",
    applyTo: "maldivian",
    kind: "menu_legacy",
    notes:
      "Prepared: Roshi/Mashuni/potato/juice. Egg style choice includes 1 egg stock. Hot drinks are served options.",
    lines: [
      { stockCode: "tea", qty: 1, notes: "Tea", showOnKot: true, isOption: true },
      { stockCode: "coffee", qty: 1, notes: "Coffee", showOnKot: true, isOption: true },
      { stockCode: "milk", qty: 1, notes: "Milk", showOnKot: true, isOption: true },
      { stockCode: "portion_sugar", qty: 1, notes: "Sugar with hot drink", showOnKot: true, isOption: true },
    ],
  });

  await upsertRecipe(userId, {
    code: "continental",
    name: "Continental breakfast",
    applyTo: "continental",
    kind: "menu_legacy",
    notes:
      "Prepared: Continental plate + stir-fried potato + juice. Egg style choice includes 1 egg. Hot drinks are served options.",
    lines: [
      { stockCode: "tea", qty: 1, notes: "Tea", showOnKot: true, isOption: true },
      { stockCode: "coffee", qty: 1, notes: "Coffee", showOnKot: true, isOption: true },
      { stockCode: "milk", qty: 1, notes: "Milk", showOnKot: true, isOption: true },
      { stockCode: "portion_sugar", qty: 1, notes: "Sugar with hot drink", showOnKot: true, isOption: true },
    ],
  });

  await upsertRecipe(userId, {
    code: "room_extras",
    name: "Room extras (optional items)",
    applyTo: "room_extras",
    notes:
      "These lines are the choosable extras on Breakfast orders. Toggle Show on KOT per item. Add/remove items here to configure what staff can select.",
    lines: [
      {
        stockCode: "pancake_batch",
        qty: 1,
        notes:
          "Counted in pieces on KOT. Batter stock comes from Prepared recipe “Pancakes” (per 20 pieces).",
        showOnKot: true,
      },
      {
        stockCode: "potato_portion",
        qty: 1,
        notes: "Stir-fried potato portion (uses 0.2 kg potatoes)",
        showOnKot: true,
      },
      { stockCode: "honey", qty: 1, notes: "When honey selected", showOnKot: true },
      { stockCode: "nutella", qty: 1, notes: "When Nutella selected", showOnKot: true },
      { stockCode: "cornflakes", qty: 1, notes: "When cereal selected", showOnKot: true },
      { stockCode: "water_bottle", qty: 1, notes: "When water bottle selected", showOnKot: true },
    ],
  });
}

/**
 * Patch older pancake/potato extras without overwriting other user recipe edits.
 * Safe to call on every ensureKitchenStockSeed.
 *
 * Pancakes stay as an extra — we only drop the forced ×20 piece batch from KOT qty.
 * Soft-deleted pancake_batch is reactivated so inventory Delete cannot hide the extra.
 */
export async function ensureRoomExtrasPatches(userId: string) {
  let pancake = await prisma.stockItem.findUnique({
    where: { userId_code: { userId, code: "pancake_batch" } },
  });
  if (!pancake) {
    pancake = await prisma.stockItem.create({
      data: {
        userId,
        code: "pancake_batch",
        name: "Pancakes",
        unit: "Number",
        kind: "kitchen",
        minStock: 0,
        useNotes:
          "Room extra counted in pieces (Qty when selected). Batter ingredients scale at 20 pieces = 1 batch.",
        sortOrder: 285,
        isActive: true,
      },
    });
  } else {
    const patch: {
      isActive?: boolean;
      name?: string;
      unit?: string;
      useNotes?: string;
    } = {};
    if (!pancake.isActive) patch.isActive = true;
    if (pancake.name.includes("20-piece") || pancake.unit === "Batch") {
      patch.name = "Pancakes";
      patch.unit = "Number";
      patch.useNotes =
        "Room extra counted in pieces (Qty when selected). Batter ingredients scale at 20 pieces = 1 batch.";
    }
    if (Object.keys(patch).length) {
      pancake = await prisma.stockItem.update({
        where: { id: pancake.id },
        data: patch,
      });
    }
  }

  let potatoPortion = await prisma.stockItem.findUnique({
    where: { userId_code: { userId, code: "potato_portion" } },
  });
  if (!potatoPortion) {
    potatoPortion = await prisma.stockItem.create({
      data: {
        userId,
        code: "potato_portion",
        name: "Potato portion",
        unit: "Number",
        kind: "kitchen",
        minStock: 0,
        useNotes: "Room extra: 1 portion uses 0.2 kg potatoes.",
        sortOrder: 125,
      },
    });
  }

  const recipe = await prisma.recipe.findUnique({
    where: { userId_code: { userId, code: "room_extras" } },
    include: { lines: { include: { stockItem: true } } },
  });
  if (!recipe) return;

  const hasPancake = recipe.lines.some(
    (l) => l.stockItem?.code === "pancake_batch" || l.stockItemId === pancake!.id,
  );
  if (!hasPancake) {
    await prisma.recipeLine.create({
      data: {
        recipeId: recipe.id,
        stockItemId: pancake.id,
        qtyPerServing: 1,
        notes: "Counted in pieces on KOT; set Qty when selected for each Add",
        showOnKot: true,
      },
    });
  } else {
    for (const line of recipe.lines) {
      if (
        line.stockItemId === pancake.id &&
        (line.notes ?? "").toLowerCase().includes("20-piece")
      ) {
        await prisma.recipeLine.update({
          where: { id: line.id },
          data: {
            notes: "Counted in pieces on KOT; set Qty when selected for each Add",
            qtyPerServing: 1,
            showOnKot: true,
          },
        });
      }
    }
  }

  const hasPotatoPortion = recipe.lines.some(
    (l) => l.stockItem?.code === "potato_portion" || l.stockItemId === potatoPortion!.id,
  );
  if (!hasPotatoPortion) {
    await prisma.recipeLine.create({
      data: {
        recipeId: recipe.id,
        stockItemId: potatoPortion.id,
        qtyPerServing: 1,
        notes: "Stir-fried potato portion (uses 0.2 kg potatoes)",
        showOnKot: true,
      },
    });
  }
}

const BREAKFAST_OPTION_DEFAULTS: Array<{
  stockCode: string;
  qty: number;
  notes: string;
  /** When true, only seed onto Maldivian (e.g. potato). */
  maldivianOnly?: boolean;
}> = [
  { stockCode: "potatoes", qty: 0.2, notes: "Stir-fried potato side", maldivianOnly: true },
  { stockCode: "sunquick", qty: 0.06, notes: "Juice (~4 tbsp)" },
  { stockCode: "tea", qty: 1, notes: "Tea" },
  { stockCode: "coffee", qty: 1, notes: "Coffee" },
  { stockCode: "milk", qty: 1, notes: "Milk" },
  { stockCode: "portion_sugar", qty: 1, notes: "Sugar with hot drink" },
];

/**
 * One-time bootstrap: if a Maldivian/Continental recipe has no Optional side lines yet,
 * promote/create the starter sides (potato, drinks). After that, Recipes UI is the source of
 * truth — never re-add or force isOption on subsequent seeds.
 */
export async function ensureBreakfastOptionPatches(userId: string) {
  const codes = BREAKFAST_OPTION_DEFAULTS.map((d) => d.stockCode);
  const items = await prisma.stockItem.findMany({
    where: { userId, code: { in: codes }, isActive: true },
  });
  const byCode = new Map(items.map((i) => [i.code!, i]));

  for (const applyTo of ["maldivian", "continental"] as const) {
    const recipe =
      (await prisma.recipe.findUnique({
        where: { userId_code: { userId, code: applyTo } },
        include: { lines: { include: { stockItem: true } } },
      })) ??
      (await prisma.recipe.findFirst({
        where: { userId, applyTo, isActive: true },
        include: { lines: { include: { stockItem: true } } },
        orderBy: { createdAt: "asc" },
      }));
    if (!recipe) continue;
    if (recipe.lines.some((l) => l.isOption)) continue;

    for (const def of BREAKFAST_OPTION_DEFAULTS) {
      if (def.maldivianOnly && applyTo !== "maldivian") continue;
      const stock = byCode.get(def.stockCode);
      if (!stock) continue;
      const existing = recipe.lines.find(
        (l) => l.stockItemId === stock.id || l.stockItem?.code === def.stockCode,
      );
      if (existing) {
        await prisma.recipeLine.update({
          where: { id: existing.id },
          data: { isOption: true, showOnKot: true },
        });
        continue;
      }
      await prisma.recipeLine.create({
        data: {
          recipeId: recipe.id,
          stockItemId: stock.id,
          qtyPerServing: def.qty,
          notes: def.notes,
          showOnKot: true,
          isOption: true,
        },
      });
    }
  }
}
