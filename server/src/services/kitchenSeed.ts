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
    useNotes: "200 g (0.2 kg) per Maldivian meal with potato.",
    sortOrder: 120,
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
      update: {
        name: item.name,
        unit: item.unit,
        useNotes: item.useNotes,
        packInfo: item.packInfo ?? null,
        sortOrder: item.sortOrder,
        isActive: true,
      },
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

  const rooms = await prisma.room.findMany({
    where: { userId },
    orderBy: { number: "asc" },
  });
  return rooms;
}

type SeedLine = { stockCode: string; qty: number; notes?: string };

async function upsertRecipe(
  userId: string,
  def: {
    code: string;
    name: string;
    applyTo: "maldivian" | "continental" | "room_extras" | "custom";
    notes?: string;
    lines: SeedLine[];
  },
) {
  const items = await prisma.stockItem.findMany({
    where: { userId, code: { in: def.lines.map((l) => l.stockCode) } },
  });
  const byCode = new Map(items.map((i) => [i.code!, i.id]));

  const existing = await prisma.recipe.findUnique({
    where: { userId_code: { userId, code: def.code } },
    include: { lines: true },
  });

  if (existing) {
    // Do not overwrite user-edited recipes; only ensure they exist.
    return existing;
  }

  return prisma.recipe.create({
    data: {
      userId,
      code: def.code,
      name: def.name,
      applyTo: def.applyTo,
      notes: def.notes ?? null,
      lines: {
        create: def.lines
          .filter((l) => byCode.has(l.stockCode))
          .map((l) => ({
            stockItemId: byCode.get(l.stockCode)!,
            qtyPerServing: l.qty,
            notes: l.notes ?? null,
          })),
      },
    },
  });
}

/** Seed editable PDF breakfast recipes once per user (never overwrite edits). */
async function ensureDefaultRecipes(userId: string) {
  await upsertRecipe(userId, {
    code: "maldivian",
    name: "Maldivian breakfast",
    applyTo: "maldivian",
    notes: "Per guest: 5 Roshi, 1 Mashuni, 1 egg. Potato optional (0.2 kg) when selected on order.",
    lines: [
      { stockCode: "roshi", qty: 5 },
      { stockCode: "mashuni", qty: 1 },
      { stockCode: "eggs", qty: 1 },
      { stockCode: "flour", qty: 5 / 40, notes: "Roshi: 40 per kg" },
      { stockCode: "cooking_oil", qty: (5 / 40) * 0.2, notes: "200 ml per 40 roshi" },
      { stockCode: "salt", qty: (5 / 40) * 6 * 5, notes: "6 tsp salt per 40 roshi" },
      { stockCode: "coconut", qty: 200, notes: "Mashuni batch" },
      { stockCode: "copy_faiy", qty: 50 },
      { stockCode: "canned_tuna", qty: 0.5 },
      { stockCode: "lime", qty: 0.5 },
    ],
  });

  await upsertRecipe(userId, {
    code: "continental",
    name: "Continental breakfast",
    applyTo: "continental",
    notes: "Per guest: 3 bread, 2 sausages, 2 butter, 1 jam, 1 egg.",
    lines: [
      { stockCode: "bread", qty: 3 },
      { stockCode: "sausages", qty: 2 },
      { stockCode: "butter", qty: 2 },
      { stockCode: "jam", qty: 1 },
      { stockCode: "eggs", qty: 1 },
    ],
  });

  await upsertRecipe(userId, {
    code: "room_extras",
    name: "Room extras & fruit (base)",
    applyTo: "room_extras",
    notes: "Edit lines for pancake/honey/etc. Order extras still drive shopping; this recipe documents Use rules.",
    lines: [
      { stockCode: "honey", qty: 1, notes: "When honey selected" },
      { stockCode: "nutella", qty: 1, notes: "When Nutella selected" },
      { stockCode: "cornflakes", qty: 1, notes: "When cereal selected" },
      { stockCode: "water_bottle", qty: 1, notes: "When water bottle selected" },
    ],
  });
}
