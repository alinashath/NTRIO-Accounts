import { prisma } from "../lib/prisma.js";
import { stockUnitsOf } from "../lib/stockDto.js";
import { buildUnitsList, inferLegacyUnit, toBase, type BaseUnit } from "../lib/units.js";

const ROOM_NUMBERS = ["101", "102", "103", "104", "105", "106"] as const;

type SeedProduct = {
  name: string;
  description?: string;
  qty: number;
  unitCode: string;
};

type CatalogItem = {
  code: string;
  name: string;
  /** Legacy display unit string used by inferLegacyUnit */
  unit: string;
  useNotes: string;
  packInfo?: string;
  sortOrder: number;
  /** Optional pack units (to_base in base units). */
  packs?: Array<{ code: string; label: string; to_base: number }>;
  products?: SeedProduct[];
};

/** PDF inventory catalog with Use notes and pack info. Units stored as base (g/ml/pcs). */
export const PDF_STOCK_CATALOG: CatalogItem[] = [
  {
    code: "flour",
    name: "All-purpose flour",
    unit: "KG",
    useNotes: "Roshi: 40 per kg. Pancakes: 0.5 kg per 40 pieces.",
    sortOrder: 10,
    products: [
      { name: "Flour 1 kg bag", description: "1 kg bag of flour", qty: 1, unitCode: "kg" },
      { name: "Flour 10 kg sack", description: "10 kg sack of flour", qty: 10, unitCode: "kg" },
    ],
  },
  {
    code: "cooking_oil",
    name: "Cooking oil",
    unit: "L",
    useNotes: "Roshi: 200 ml per 40 pieces.",
    sortOrder: 20,
    products: [
      { name: "Cooking oil 1 L", description: "1 litre bottle", qty: 1, unitCode: "L" },
    ],
  },
  {
    code: "salt",
    name: "Salt",
    unit: "G",
    useNotes: "Roshi: 2 tbsp = 6 tsp per 40 pieces. Mashuni: about 0.5 tsp per batch.",
    sortOrder: 30,
    products: [{ name: "Salt 1 kg", qty: 1, unitCode: "kg" }],
  },
  {
    code: "coconut",
    name: "Coconut",
    unit: "G",
    useNotes: "Mashuni: 200 g per batch. 1 medium coconut is 200 g.",
    packInfo: "1 medium coconut = 200 g",
    sortOrder: 40,
    packs: [{ code: "coconut", label: "coconut", to_base: 200 }],
    products: [{ name: "Medium coconut", description: "1 medium coconut ≈ 200 g", qty: 1, unitCode: "coconut" }],
  },
  {
    code: "copy_faiy",
    name: "Copy Faiy",
    unit: "G",
    useNotes: "Mashuni: 50 g per batch. 1 medium leaf is 50 g.",
    packInfo: "1 medium leaf = 50 g",
    sortOrder: 50,
    packs: [{ code: "leaf", label: "leaf", to_base: 50 }],
    products: [{ name: "Copy Faiy leaf", description: "1 medium leaf ≈ 50 g", qty: 1, unitCode: "leaf" }],
  },
  {
    code: "canned_tuna",
    name: "Canned tuna",
    unit: "Number",
    useNotes: "Mashuni: 0.5 can per batch. Set can weight on the stock item to use grams in recipes.",
    sortOrder: 60,
    products: [
      { name: "Tuna can", description: "1 can of tuna", qty: 1, unitCode: "pcs" },
      {
        name: "Tuna case (48 cans)",
        description: "Case of 48 cans. Set can weight on the stock item when known.",
        qty: 48,
        unitCode: "pcs",
      },
    ],
  },
  {
    code: "lime",
    name: "Lime",
    unit: "Number",
    useNotes: "Mashuni: 0.5 lime per batch.",
    sortOrder: 70,
    products: [{ name: "Lime", qty: 1, unitCode: "pcs" }],
  },
  {
    code: "eggs",
    name: "Eggs",
    unit: "Number",
    useNotes: "1 per meal, plus 4 per 20-piece pancake batch.",
    sortOrder: 80,
    products: [
      { name: "Egg", qty: 1, unitCode: "pcs" },
      { name: "Eggs tray (30)", description: "Tray of 30 eggs", qty: 30, unitCode: "pcs" },
    ],
  },
  {
    code: "baking_powder",
    name: "Baking powder",
    unit: "G",
    useNotes: "Pancakes: 2 tsp per 20-piece batch.",
    sortOrder: 90,
    products: [{ name: "Baking powder 100 g", qty: 100, unitCode: "g" }],
  },
  {
    code: "sugar_g",
    name: "Sugar",
    unit: "G",
    useNotes: "200 g per 20-piece pancake batch.",
    sortOrder: 100,
    products: [{ name: "Sugar 1 kg", qty: 1, unitCode: "kg" }],
  },
  {
    code: "banana_essence",
    name: "Banana essence",
    unit: "Ml",
    useNotes: "1 tbsp per 20-piece pancake batch.",
    sortOrder: 110,
    products: [{ name: "Banana essence 50 ml", qty: 50, unitCode: "ml" }],
  },
  {
    code: "potatoes",
    name: "Potatoes",
    unit: "Kg",
    useNotes: "200 g (0.2 kg) per Maldivian meal or potato-portion extra.",
    sortOrder: 120,
    products: [{ name: "Potatoes 1 kg", qty: 1, unitCode: "kg" }],
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
    products: [{ name: "Sunquick 1 L", qty: 1, unitCode: "L" }],
  },
  {
    code: "coffee",
    name: "Coffee",
    unit: "Portion Pack",
    useNotes: "1 portion packet per coffee.",
    packInfo: "1 pack has 200 portions",
    sortOrder: 140,
    packs: [{ code: "pack", label: "pack", to_base: 200 }],
    products: [
      { name: "Coffee portion", qty: 1, unitCode: "portion_pack" },
      { name: "Coffee pack (200)", description: "1 pack has 200 portions", qty: 1, unitCode: "pack" },
    ],
  },
  {
    code: "tea",
    name: "Tea",
    unit: "Teabag",
    useNotes: "1 teabag per tea.",
    packInfo: "1 box has 20 bags",
    sortOrder: 150,
    packs: [{ code: "box", label: "box", to_base: 20 }],
    products: [
      { name: "Teabag", qty: 1, unitCode: "teabag" },
      { name: "Tea box (20)", description: "1 box has 20 bags", qty: 1, unitCode: "box" },
    ],
  },
  {
    code: "milk",
    name: "Milk",
    unit: "Portion",
    useNotes: "1 portion when milk is selected with breakfast.",
    sortOrder: 155,
    products: [{ name: "Milk portion", qty: 1, unitCode: "portion" }],
  },
  {
    code: "sausages",
    name: "Sausages",
    unit: "Number",
    useNotes: "2 per Continental meal.",
    packInfo: "1 packet has 12 numbers",
    sortOrder: 160,
    packs: [{ code: "packet", label: "packet", to_base: 12 }],
    products: [
      { name: "Sausage", qty: 1, unitCode: "pcs" },
      { name: "Sausage packet (12)", description: "1 packet has 12", qty: 1, unitCode: "packet" },
    ],
  },
  {
    code: "jam",
    name: "Jam",
    unit: "Portion",
    useNotes: "1 per Continental meal.",
    packInfo: "1 box has 100",
    sortOrder: 170,
    packs: [{ code: "box", label: "box", to_base: 100 }],
    products: [
      { name: "Jam portion", qty: 1, unitCode: "portion" },
      { name: "Jam box (100)", description: "1 box has 100 portions", qty: 1, unitCode: "box" },
    ],
  },
  {
    code: "butter",
    name: "Butter",
    unit: "Portion",
    useNotes: "2 per Continental meal.",
    packInfo: "1 box has 100",
    sortOrder: 180,
    packs: [{ code: "box", label: "box", to_base: 100 }],
    products: [
      { name: "Butter portion", qty: 1, unitCode: "portion" },
      { name: "Butter box (100)", description: "1 box has 100 portions", qty: 1, unitCode: "box" },
    ],
  },
  {
    code: "nutella",
    name: "Nutella",
    unit: "Portion",
    useNotes: "1 portion per room, as alternative to honey.",
    packInfo: "1 jar has 50 portions",
    sortOrder: 190,
    packs: [{ code: "jar", label: "jar", to_base: 50 }],
    products: [
      { name: "Nutella portion", qty: 1, unitCode: "portion" },
      { name: "Nutella jar (50)", description: "1 jar has 50 portions", qty: 1, unitCode: "jar" },
    ],
  },
  {
    code: "honey",
    name: "Honey",
    unit: "Portion",
    useNotes: "1 portion per room, as alternative to Nutella.",
    packInfo: "1 jar has 50 portions",
    sortOrder: 200,
    packs: [{ code: "jar", label: "jar", to_base: 50 }],
    products: [
      { name: "Honey portion", qty: 1, unitCode: "portion" },
      { name: "Honey jar (50)", description: "1 jar has 50 portions", qty: 1, unitCode: "jar" },
    ],
  },
  {
    code: "bread",
    name: "Bread",
    unit: "Slice",
    useNotes: "3 slices per Continental meal.",
    packInfo: "1 bread has 12 slices",
    sortOrder: 210,
    packs: [{ code: "loaf", label: "loaf", to_base: 12 }],
    products: [
      { name: "Bread slice", qty: 1, unitCode: "slice" },
      { name: "Bread loaf (12 slices)", description: "1 bread has 12 slices", qty: 1, unitCode: "loaf" },
    ],
  },
  {
    code: "cornflakes",
    name: "Cornflakes",
    unit: "Portion",
    useNotes: "1 portion on request.",
    packInfo: "1 box can give 10 servings",
    sortOrder: 220,
    packs: [{ code: "box", label: "box", to_base: 10 }],
    products: [
      { name: "Cornflakes portion", qty: 1, unitCode: "portion" },
      { name: "Cornflakes box (10)", description: "1 box ≈ 10 servings", qty: 1, unitCode: "box" },
    ],
  },
  {
    code: "papaya",
    name: "Papaya",
    unit: "Slice",
    useNotes: "1 slice per room when selected.",
    packInfo: "1 papaya is 4 slices",
    sortOrder: 230,
    packs: [{ code: "fruit", label: "papaya", to_base: 4 }],
    products: [
      { name: "Papaya slice", qty: 1, unitCode: "slice" },
      { name: "Whole papaya", description: "1 papaya is 4 slices", qty: 1, unitCode: "fruit" },
    ],
  },
  {
    code: "watermelon",
    name: "Water Melon",
    unit: "Slice",
    useNotes: "1 slice per room when selected.",
    packInfo: "1 watermelon is 5 slices",
    sortOrder: 240,
    packs: [{ code: "fruit", label: "watermelon", to_base: 5 }],
    products: [
      { name: "Watermelon slice", qty: 1, unitCode: "slice" },
      { name: "Whole watermelon", description: "1 watermelon is 5 slices", qty: 1, unitCode: "fruit" },
    ],
  },
  {
    code: "apple",
    name: "Apple",
    unit: "Slice",
    useNotes: "4 slices per room when selected.",
    packInfo: "1 apple is 8 slices",
    sortOrder: 250,
    packs: [{ code: "fruit", label: "apple", to_base: 8 }],
    products: [
      { name: "Apple slice", qty: 1, unitCode: "slice" },
      { name: "Whole apple", description: "1 apple is 8 slices", qty: 1, unitCode: "fruit" },
    ],
  },
  {
    code: "orange",
    name: "Orange",
    unit: "Slice",
    useNotes: "4 slices per room when selected.",
    packInfo: "1 orange is 8 slices",
    sortOrder: 260,
    packs: [{ code: "fruit", label: "orange", to_base: 8 }],
    products: [
      { name: "Orange slice", qty: 1, unitCode: "slice" },
      { name: "Whole orange", description: "1 orange is 8 slices", qty: 1, unitCode: "fruit" },
    ],
  },
  {
    code: "portion_sugar",
    name: "Portion Sugar",
    unit: "Portion",
    useNotes: "1 with each coffee and tea.",
    packInfo: "One sugar bundle is 200 portions",
    sortOrder: 270,
    packs: [{ code: "bundle", label: "bundle", to_base: 200 }],
    products: [
      { name: "Sugar portion", qty: 1, unitCode: "portion" },
      { name: "Sugar bundle (200)", description: "One sugar bundle is 200 portions", qty: 1, unitCode: "bundle" },
    ],
  },
  {
    code: "water_bottle",
    name: "1.5 L water bottle",
    unit: "Number",
    useNotes: "1 bottle per room when selected (extras).",
    sortOrder: 280,
    products: [
      { name: "Water bottle", qty: 1, unitCode: "pcs" },
      { name: "Water case (24)", description: "Case of 24 bottles", qty: 24, unitCode: "pcs" },
    ],
  },
  {
    code: "pancake_batch",
    name: "Pancakes",
    unit: "Number",
    useNotes:
      "Room extra counted in pieces. Link to the prepared Pancakes recipe so ingredients use that recipe’s batch size.",
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

const OTHER_SEED: CatalogItem[] = [
  {
    code: "toilet_tissue",
    name: "Toilet tissue",
    unit: "Roll",
    useNotes: "Housekeeping stock (non-breakfast).",
    sortOrder: 900,
    packs: [{ code: "case", label: "case", to_base: 48 }],
    products: [
      { name: "Toilet roll", qty: 1, unitCode: "roll" },
      { name: "Tissue case (48)", description: "Case of 48 rolls", qty: 1, unitCode: "case" },
    ],
  },
];

function catalogSeedFields(item: CatalogItem) {
  const inferred = inferLegacyUnit(item.unit);
  const packs = item.packs ?? [];
  const units = buildUnitsList(
    inferred.baseUnit,
    packs,
    inferred.pieceLabel ?? undefined,
  );
  // Merge inferred aliases (slice/teabag) with packs
  const byCode = new Map(units.map((u) => [u.code, u]));
  for (const u of inferred.units) {
    if (!byCode.has(u.code)) byCode.set(u.code, u);
  }
  const merged = [...byCode.values()];
  return {
    unit: inferred.pieceLabel || (inferred.displayUnit === "kg" ? "kg" : inferred.displayUnit === "L" ? "L" : inferred.displayUnit),
    baseUnit: inferred.baseUnit as BaseUnit,
    displayUnit: inferred.displayUnit,
    units: merged,
  };
}

type PendingProduct = {
  userId: string;
  stockItemId: string;
  name: string;
  description: string | null;
  qty: number;
  unitCode: string;
  sortOrder: number;
};

function queueMissingProducts(
  userId: string,
  stockItemId: string,
  products: SeedProduct[] | undefined,
  existingKeys: Set<string>,
  out: PendingProduct[],
) {
  if (!products?.length) return;
  for (let i = 0; i < products.length; i++) {
    const p = products[i]!;
    const key = `${stockItemId}\0${p.name.trim().toLowerCase()}`;
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    out.push({
      userId,
      stockItemId,
      name: p.name,
      description: p.description ?? null,
      qty: p.qty,
      unitCode: p.unitCode,
      sortOrder: i * 10,
    });
  }
}

/** Ensure rooms 101–106 and PDF stock catalog exist for the user. */
export async function ensureKitchenStockSeed(userId: string) {
  for (const number of ROOM_NUMBERS) {
    await prisma.room.upsert({
      where: { userId_number: { userId, number } },
      create: { userId, number },
      update: {},
    });
  }

  const existingProducts = await prisma.stockProduct.findMany({
    where: { userId, isActive: true },
    select: { stockItemId: true, name: true },
  });
  const productKeys = new Set(
    existingProducts.map((p) => `${p.stockItemId}\0${p.name.trim().toLowerCase()}`),
  );
  const pendingProducts: PendingProduct[] = [];

  for (const item of PDF_STOCK_CATALOG) {
    const fields = catalogSeedFields(item);
    const row = await prisma.stockItem.upsert({
      where: { userId_code: { userId, code: item.code } },
      create: {
        userId,
        code: item.code,
        name: item.name,
        unit: fields.unit,
        baseUnit: fields.baseUnit,
        displayUnit: fields.displayUnit,
        units: fields.units,
        kind: "kitchen",
        minStock: 0,
        useNotes: item.useNotes,
        packInfo: item.packInfo ?? null,
        sortOrder: item.sortOrder,
      },
      // Never overwrite user edits (name, unit, notes, soft-delete).
      update: {},
    });
    queueMissingProducts(userId, row.id, item.products, productKeys, pendingProducts);
  }

  for (const item of OTHER_SEED) {
    const fields = catalogSeedFields(item);
    const row = await prisma.stockItem.upsert({
      where: { userId_code: { userId, code: item.code } },
      create: {
        userId,
        code: item.code,
        name: item.name,
        unit: fields.unit,
        baseUnit: fields.baseUnit,
        displayUnit: fields.displayUnit,
        units: fields.units,
        kind: "other",
        minStock: 0,
        useNotes: item.useNotes,
        packInfo: item.packInfo ?? null,
        sortOrder: item.sortOrder,
      },
      update: {},
    });
    queueMissingProducts(userId, row.id, item.products, productKeys, pendingProducts);
  }

  if (pendingProducts.length > 0) {
    await prisma.stockProduct.createMany({ data: pendingProducts });
  }

  // Merge catalog pack units onto existing items + products from grocery / ledger history.
  const { ensureCatalogPackUnitsOnItems, ensureProductsFromHistory } = await import(
    "./stockProductBackfill.js"
  );
  await ensureCatalogPackUnitsOnItems(userId, [
    ...PDF_STOCK_CATALOG.map((i) => ({ code: i.code, packs: i.packs })),
    ...OTHER_SEED.map((i) => ({ code: i.code, packs: i.packs })),
  ]);
  await ensureProductsFromHistory(userId);

  await ensureDefaultRecipes(userId);
  await ensurePreparedRecipes(userId);
  await ensureRoomExtrasPatches(userId);
  await linkExtrasToPreparedRecipes(userId);
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
  /** Quantity in `unitCode` (defaults to the stock item’s base unit). */
  qty: number;
  unitCode?: string;
  notes?: string;
  showOnKot?: boolean;
  isOption?: boolean;
  /** For addons: expand this prepared recipe code instead of depleting marker stock. */
  componentRecipeCode?: string;
};

/** Seeded prepared recipes — BOM is always resynced to base-unit seed definitions. */
const PREPARED_SEED_CODES = new Set([
  "mashuni_cups",
  "roshi",
  "stir_fried_potato",
  "juice",
  "continental_plate",
  "pancakes",
]);

async function upsertRecipe(
  userId: string,
  def: {
    code: string;
    name: string;
    applyTo: "maldivian" | "continental" | "room_extras" | "custom";
    kind?: "menu_legacy" | "prepared" | "addons";
    notes?: string;
    batchSize?: number;
    lines: SeedLine[];
  },
) {
  const items = await prisma.stockItem.findMany({
    where: { userId, code: { in: def.lines.map((l) => l.stockCode) } },
  });
  const byCode = new Map(items.map((i) => [i.code!, i.id]));
  const byItem = new Map(items.map((i) => [i.code!, i]));
  const kind =
    def.kind ??
    (def.applyTo === "custom" ? "prepared" : def.applyTo === "room_extras" ? "addons" : "menu_legacy");
  const batchSize = def.batchSize && def.batchSize > 0 ? def.batchSize : 1;

  const lineCreate = (l: SeedLine) => {
    const item = byItem.get(l.stockCode)!;
    const { baseUnit, units } = stockUnitsOf(item);
    const unitCode = l.unitCode ?? baseUnit;
    const baseQty = toBase(l.qty, unitCode, units, baseUnit);
    return {
      stockItemId: item.id,
      qtyPerServing: baseQty,
      inputQty: l.qty,
      inputUnit: unitCode,
      notes: l.notes ?? null,
      showOnKot: l.showOnKot ?? true,
      isOption: Boolean(l.isOption),
    };
  };

  const existing = await prisma.recipe.findUnique({
    where: { userId_code: { userId, code: def.code } },
    include: { lines: { include: { stockItem: true } } },
  });

  if (existing) {
    const patch: { kind?: typeof kind; batchSize?: number; notes?: string | null } = {};
    if (existing.kind !== kind) patch.kind = kind;
    if (def.batchSize && existing.batchSize !== batchSize) patch.batchSize = batchSize;
    if (def.notes != null && existing.notes !== def.notes && PREPARED_SEED_CODES.has(def.code)) {
      patch.notes = def.notes;
    }
    if (Object.keys(patch).length) {
      await prisma.recipe.update({ where: { id: existing.id }, data: patch });
    }

    const shouldResyncBom =
      kind === "prepared" &&
      PREPARED_SEED_CODES.has(def.code) &&
      (existing.lines.length === 0 ||
        existing.lines.length !== def.lines.filter((l) => byCode.has(l.stockCode)).length ||
        existing.lines.some((el) => {
          const seed = def.lines.find((l) => l.stockCode === el.stockItem.code);
          if (!seed) return true;
          const item = byItem.get(seed.stockCode)!;
          const { baseUnit, units } = stockUnitsOf(item);
          const want = toBase(seed.qty, seed.unitCode ?? baseUnit, units, baseUnit);
          return Math.abs(Number(el.qtyPerServing) - want) > 1e-6;
        }));

    if (shouldResyncBom) {
      await prisma.recipeLine.deleteMany({ where: { recipeId: existing.id } });
      await prisma.recipeLine.createMany({
        data: def.lines
          .filter((l) => byCode.has(l.stockCode))
          .map((l) => ({
            recipeId: existing.id,
            ...lineCreate(l),
            showOnKot: l.showOnKot ?? false,
            isOption: false,
          })),
      });
      return prisma.recipe.findUniqueOrThrow({
        where: { id: existing.id },
        include: { lines: { include: { stockItem: true } } },
      });
    }

    // Empty prepared recipe — fill once
    if (kind === "prepared" && existing.lines.length === 0) {
      await prisma.recipeLine.createMany({
        data: def.lines.filter((l) => byCode.has(l.stockCode)).map((l) => ({
          recipeId: existing.id,
          ...lineCreate(l),
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
      batchSize,
      lines: {
        create: def.lines.filter((l) => byCode.has(l.stockCode)).map(lineCreate),
      },
    },
    include: { lines: { include: { stockItem: true } } },
  });
}

/** Wire room-extra marker stock → prepared recipes (UI-configurable via component_recipe_id). */
async function linkExtrasToPreparedRecipes(userId: string) {
  const links: Array<{ stockCode: string; preparedCode: string; notes: string }> = [
    {
      stockCode: "pancake_batch",
      preparedCode: "pancakes",
      notes:
        "Counted in pieces on KOT. Stock comes from the linked prepared recipe (batch size).",
    },
    {
      stockCode: "potato_portion",
      preparedCode: "stir_fried_potato",
      notes: "One portion expands the linked stir-fried potato prepared recipe.",
    },
  ];

  const extras = await prisma.recipe.findFirst({
    where: { userId, code: "room_extras", isActive: true },
    include: { lines: { include: { stockItem: true } } },
  });
  if (!extras) return;

  for (const link of links) {
    const prepared = await prisma.recipe.findFirst({
      where: { userId, code: link.preparedCode, isActive: true },
    });
    if (!prepared) continue;
    const line = extras.lines.find((l) => l.stockItem.code === link.stockCode);
    if (!line) continue;
    if (line.componentRecipeId === prepared.id && line.notes === link.notes) continue;
    await prisma.recipeLine.update({
      where: { id: line.id },
      data: { componentRecipeId: prepared.id, notes: link.notes },
    });
  }
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
    notes: "1 cup per Maldivian breakfast. Stock BOM is per cup (batch size 1).",
    lines: [
      { stockCode: "coconut", qty: 200, unitCode: "g", notes: "200 g per cup", showOnKot: false },
      { stockCode: "copy_faiy", qty: 50, unitCode: "g", notes: "50 g per cup", showOnKot: false },
      { stockCode: "canned_tuna", qty: 0.5, unitCode: "pcs", notes: "0.5 can per cup", showOnKot: false },
      { stockCode: "lime", qty: 0.5, unitCode: "pcs", notes: "0.5 lime per cup", showOnKot: false },
      { stockCode: "salt", qty: 2.5, unitCode: "g", notes: "~0.5 tsp per cup", showOnKot: false },
    ],
  });

  await upsertRecipe(userId, {
    code: "roshi",
    name: "Roshi",
    applyTo: "custom",
    kind: "prepared",
    notes: "BOM per 1 roshi (batch size 1). Maldivian menu uses qty 5.",
    lines: [
      { stockCode: "flour", qty: 25, unitCode: "g", notes: "25 g (40 roshi per kg)", showOnKot: false },
      { stockCode: "cooking_oil", qty: 5, unitCode: "ml", notes: "5 ml (200 ml per 40 roshi)", showOnKot: false },
      { stockCode: "salt", qty: 0.75, unitCode: "g", notes: "0.75 g (30 g per 40 roshi)", showOnKot: false },
    ],
  });

  await upsertRecipe(userId, {
    code: "stir_fried_potato",
    name: "Stir-fried potato",
    applyTo: "custom",
    kind: "prepared",
    notes: "1 side portion (batch size 1). Link room potato extras to this recipe.",
    lines: [
      { stockCode: "potatoes", qty: 200, unitCode: "g", notes: "200 g per portion", showOnKot: false },
    ],
  });

  await upsertRecipe(userId, {
    code: "juice",
    name: "Juice",
    applyTo: "custom",
    kind: "prepared",
    notes: "1 cup (batch size 1). Concentrate is not served raw — diluted juice is.",
    lines: [
      { stockCode: "sunquick", qty: 60, unitCode: "ml", notes: "~60 ml (4 tbsp) concentrate per cup", showOnKot: false },
    ],
  });

  await upsertRecipe(userId, {
    code: "continental_plate",
    name: "Continental plate",
    applyTo: "custom",
    kind: "prepared",
    notes: "Bread, sausages, butter & jam as one plated set. Egg is separate (style choice).",
    lines: [
      { stockCode: "bread", qty: 3, unitCode: "slice", notes: "3 slices", showOnKot: false },
      { stockCode: "sausages", qty: 2, unitCode: "pcs", notes: "2 pieces", showOnKot: false },
      { stockCode: "butter", qty: 2, unitCode: "portion", notes: "2 portions", showOnKot: false },
      { stockCode: "jam", qty: 1, unitCode: "portion", notes: "1 portion", showOnKot: false },
    ],
  });

  await upsertRecipe(userId, {
    code: "pancakes",
    name: "Pancakes",
    applyTo: "custom",
    kind: "prepared",
    batchSize: 20,
    notes:
      "Ingredient list is for one batch (batch size). Room extras link here; kitchen scales pieces ÷ batch size. Edit batch size in the recipe UI.",
    lines: [
      { stockCode: "flour", qty: 250, unitCode: "g", notes: "250 g per batch", showOnKot: false },
      { stockCode: "eggs", qty: 4, unitCode: "pcs", notes: "4 eggs per batch", showOnKot: false },
      { stockCode: "baking_powder", qty: 10, unitCode: "g", notes: "2 tsp (~10 g) per batch", showOnKot: false },
      { stockCode: "sugar_g", qty: 200, unitCode: "g", notes: "200 g per batch", showOnKot: false },
      { stockCode: "banana_essence", qty: 15, unitCode: "ml", notes: "1 tbsp per batch", showOnKot: false },
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
        unitCode: "pcs",
        notes:
          "Counted in pieces on KOT. Link to prepared “Pancakes” (component recipe) so stock uses batch size.",
        showOnKot: true,
        componentRecipeCode: "pancakes",
      },
      {
        stockCode: "potato_portion",
        qty: 1,
        unitCode: "pcs",
        notes: "Link to prepared “Stir-fried potato” so stock uses 200 g potatoes per portion.",
        showOnKot: true,
        componentRecipeCode: "stir_fried_potato",
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
    const fields = catalogSeedFields({
      code: "pancake_batch",
      name: "Pancakes",
      unit: "Number",
      useNotes: "",
      sortOrder: 285,
    });
    pancake = await prisma.stockItem.create({
      data: {
        userId,
        code: "pancake_batch",
        name: "Pancakes",
        unit: fields.unit,
        baseUnit: fields.baseUnit,
        displayUnit: fields.displayUnit,
        units: fields.units,
        kind: "kitchen",
        minStock: 0,
        useNotes:
          "Room extra counted in pieces. Link to prepared Pancakes recipe (batch size) for stock.",
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
        "Room extra counted in pieces. Link to prepared Pancakes recipe (batch size) for stock.";
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
    const fields = catalogSeedFields({
      code: "potato_portion",
      name: "Potato portion",
      unit: "Number",
      useNotes: "",
      sortOrder: 125,
    });
    potatoPortion = await prisma.stockItem.create({
      data: {
        userId,
        code: "potato_portion",
        name: "Potato portion",
        unit: fields.unit,
        baseUnit: fields.baseUnit,
        displayUnit: fields.displayUnit,
        units: fields.units,
        kind: "kitchen",
        minStock: 0,
        useNotes: "Room extra: 1 portion uses 200 g potatoes via linked prepared recipe.",
        sortOrder: 125,
      },
    });
  }

  const recipe = await prisma.recipe.findUnique({
    where: { userId_code: { userId, code: "room_extras" } },
    include: { lines: { include: { stockItem: true } } },
  });
  if (!recipe) return;

  const pancakesRecipe = await prisma.recipe.findFirst({
    where: { userId, code: "pancakes", isActive: true },
  });

  const hasPancake = recipe.lines.some(
    (l) => l.stockItem?.code === "pancake_batch" || l.stockItemId === pancake!.id,
  );
  if (!hasPancake) {
    await prisma.recipeLine.create({
      data: {
        recipeId: recipe.id,
        stockItemId: pancake.id,
        qtyPerServing: 1,
        inputQty: 1,
        inputUnit: "pcs",
        componentRecipeId: pancakesRecipe?.id ?? null,
        notes: "Counted in pieces on KOT; expands linked prepared recipe by batch size.",
        showOnKot: true,
      },
    });
  } else {
    for (const line of recipe.lines) {
      if (line.stockItemId !== pancake.id) continue;
      const needsLink = !line.componentRecipeId && pancakesRecipe;
      const needsNote =
        (line.notes ?? "").toLowerCase().includes("20-piece") ||
        (line.notes ?? "").toLowerCase().includes("per 20");
      if (!needsLink && !needsNote) continue;
      await prisma.recipeLine.update({
        where: { id: line.id },
        data: {
          notes: "Counted in pieces on KOT; expands linked prepared recipe by batch size.",
          qtyPerServing: 1,
          showOnKot: true,
          ...(needsLink ? { componentRecipeId: pancakesRecipe!.id } : {}),
        },
      });
    }
  }

  const hasPotatoPortion = recipe.lines.some(
    (l) => l.stockItem?.code === "potato_portion" || l.stockItemId === potatoPortion!.id,
  );
  if (!hasPotatoPortion) {
    const stirFry = await prisma.recipe.findFirst({
      where: { userId, code: "stir_fried_potato", isActive: true },
    });
    await prisma.recipeLine.create({
      data: {
        recipeId: recipe.id,
        stockItemId: potatoPortion.id,
        qtyPerServing: 1,
        inputQty: 1,
        inputUnit: "pcs",
        componentRecipeId: stirFry?.id ?? null,
        notes: "Link to prepared stir-fried potato (200 g potatoes per portion).",
        showOnKot: true,
      },
    });
  }
}

const BREAKFAST_OPTION_DEFAULTS: Array<{
  stockCode: string;
  /** Quantity in base units (g / ml / pcs). */
  qty: number;
  unitCode: string;
  notes: string;
  /** When true, only seed onto Maldivian (e.g. potato). */
  maldivianOnly?: boolean;
}> = [
  { stockCode: "potatoes", qty: 200, unitCode: "g", notes: "Stir-fried potato side", maldivianOnly: true },
  { stockCode: "sunquick", qty: 60, unitCode: "ml", notes: "Juice (~4 tbsp)" },
  { stockCode: "tea", qty: 1, unitCode: "teabag", notes: "Tea" },
  { stockCode: "coffee", qty: 1, unitCode: "portion_pack", notes: "Coffee" },
  { stockCode: "milk", qty: 1, unitCode: "portion", notes: "Milk" },
  { stockCode: "portion_sugar", qty: 1, unitCode: "portion", notes: "Sugar with hot drink" },
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
          inputQty: def.qty,
          inputUnit: def.unitCode,
          notes: def.notes,
          showOnKot: true,
          isOption: true,
        },
      });
    }
  }
}
