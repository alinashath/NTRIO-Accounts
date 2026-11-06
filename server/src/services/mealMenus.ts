/**
 * Ensure MealMenu rows exist from legacy maldivian/continental recipes,
 * keep plated items active, and backfill BreakfastOrder selections from legacy flags.
 */
import { prisma } from "../lib/prisma.js";
import { dec } from "../lib/dates.js";
import { costMenuLine, costMenuServing } from "./stockCost.js";

const EGG_STYLES = [
  { key: "omelette", label: "Omelette" },
  { key: "fried", label: "Fried" },
  { key: "boiled", label: "Boiled" },
  { key: "scrambled", label: "Scrambled" },
] as const;

/** Stock codes that feed inventory but usually stay off the KOT board. */
const KOT_OFF_CODES = new Set([
  "flour",
  "cooking_oil",
  "salt",
  "coconut",
  "copy_faiy",
  "canned_tuna",
  "lime",
  "butter",
  "jam",
]);

/** Plated prep items that must stay active for Maldivian menus. */
const MALDIVIAN_PLATED_CODES = ["roshi", "mashuni", "flour"] as const;

/**
 * Stock codes that belong on Prepared recipe BOMs — never as flat meal-menu lines.
 * Menus only keep truly served singles (eggs, tea, coffee, milk, sugar).
 */
const PREPARED_BOM_STOCK_CODES = new Set([
  // Maldivian prepared BOMs / old plated markers
  "roshi",
  "mashuni",
  "flour",
  "cooking_oil",
  "salt",
  "coconut",
  "copy_faiy",
  "canned_tuna",
  "lime",
  "potatoes",
  "potato",
  "potato_portion",
  "sunquick",
  // Continental plate BOM
  "bread",
  "sausages",
  "butter",
  "jam",
]);

/**
 * Served portion stock allowed as direct menu lines.
 * Eggs are not listed as base — they live on egg_style choice lines (qty 1 each).
 */
const SERVED_STOCK_CODES = new Set([
  "tea",
  "coffee",
  "milk",
  "portion_sugar",
]);

const LEGACY_OPTION_MATCH: Array<{
  flag: keyof LegacyFlags;
  codes: string[];
  names?: RegExp;
}> = [
  { flag: "potato", codes: ["potatoes", "potato", "potato_portion", "stir_fried_potato"], names: /potato/i },
  { flag: "juice", codes: ["sunquick", "juice"], names: /^juice$/i },
  { flag: "tea", codes: ["tea"] },
  { flag: "coffee", codes: ["coffee"] },
  { flag: "milk", codes: ["milk"] },
  { flag: "sugar", codes: ["portion_sugar", "sugar", "sugar_g"] },
];

type LegacyFlags = {
  potato: boolean;
  juice: boolean;
  tea: boolean;
  coffee: boolean;
  milk: boolean;
  sugar: boolean;
};

/** Real eggs stock — mapped onto each egg_style choice (not a separate base line). */
async function ensureEggsStock(userId: string) {
  const existing = await prisma.stockItem.findUnique({
    where: { userId_code: { userId, code: "eggs" } },
  });
  if (existing) {
    if (!existing.isActive) {
      return prisma.stockItem.update({
        where: { id: existing.id },
        data: { isActive: true },
      });
    }
    return existing;
  }
  return prisma.stockItem.create({
    data: {
      userId,
      code: "eggs",
      name: "Eggs",
      unit: "Number",
      kind: "kitchen",
      minStock: 0,
      useNotes: "1 per meal (egg style choice). Also used in pancake batter.",
      sortOrder: 80,
      isActive: true,
    },
  });
}

/** Egg style choices carry the egg stock (qty 1). Remove leftover base Eggs lines. */
async function ensureEggStyleChoices(menuId: string, eggsStockId: string) {
  const lines = await prisma.mealMenuLine.findMany({
    where: { menuId },
    include: { stockItem: true },
  });

  // Drop base "Eggs" — style choice is the served egg.
  const baseEggs = lines.filter(
    (l) =>
      l.role === "base" &&
      (l.stockItem?.code === "eggs" || /^eggs?$/i.test(l.displayName ?? "")),
  );
  if (baseEggs.length) {
    await prisma.mealMenuLine.deleteMany({
      where: { id: { in: baseEggs.map((l) => l.id) } },
    });
  }

  const choices = lines.filter((l) => l.role === "choice" && l.choiceGroupKey === "egg_style");
  if (!choices.length) {
    let eggSort = 100;
    for (const style of EGG_STYLES) {
      await prisma.mealMenuLine.create({
        data: {
          menuId,
          role: "choice",
          choiceGroupKey: "egg_style",
          choiceGroupLabel: "Egg style",
          displayName: style.label,
          stockItemId: eggsStockId,
          qtyPerServing: 1,
          showOnKot: true,
          notes: style.key,
          sortOrder: eggSort++,
        },
      });
    }
    return;
  }

  for (const style of EGG_STYLES) {
    const line = choices.find(
      (l) =>
        l.notes === style.key ||
        l.displayName?.toLowerCase() === style.key ||
        l.displayName === style.label,
    );
    if (!line) {
      await prisma.mealMenuLine.create({
        data: {
          menuId,
          role: "choice",
          choiceGroupKey: "egg_style",
          choiceGroupLabel: "Egg style",
          displayName: style.label,
          stockItemId: eggsStockId,
          qtyPerServing: 1,
          showOnKot: true,
          notes: style.key,
          sortOrder: 100 + EGG_STYLES.findIndex((s) => s.key === style.key),
        },
      });
      continue;
    }
    if (
      line.stockItemId !== eggsStockId ||
      Number(line.qtyPerServing) !== 1 ||
      line.displayName !== style.label ||
      line.notes !== style.key ||
      !line.showOnKot
    ) {
      await prisma.mealMenuLine.update({
        where: { id: line.id },
        data: {
          displayName: style.label,
          stockItemId: eggsStockId,
          qtyPerServing: 1,
          showOnKot: true,
          notes: style.key,
          choiceGroupLabel: "Egg style",
        },
      });
    }
  }
}

/** Soft-deleted plated items break menus — reactivate known breakfast codes. */
async function reactivatePlatedStock(userId: string) {
  await prisma.stockItem.updateMany({
    where: {
      userId,
      code: { in: [...MALDIVIAN_PLATED_CODES] },
      isActive: false,
    },
    data: { isActive: true },
  });
}

function showOnKotForCode(code: string | null | undefined, recipeShowOnKot: boolean) {
  if (code && KOT_OFF_CODES.has(code)) return false;
  return recipeShowOnKot;
}

async function syncMenuFromLegacyRecipe(
  userId: string,
  applyTo: "maldivian" | "continental",
  eggsStockId: string,
) {
  const code = applyTo;
  let menu = await prisma.mealMenu.findUnique({
    where: { userId_code: { userId, code } },
    include: { lines: { include: { stockItem: true } } },
  });

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

  if (!menu) {
    menu = await prisma.mealMenu.create({
      data: {
        userId,
        mealPeriod: "breakfast",
        name: applyTo === "maldivian" ? "Maldivian breakfast" : "Continental breakfast",
        code,
        notes:
          recipe?.notes ??
          (applyTo === "maldivian"
            ? "Prepared: Roshi, Mashuni. Egg style choice includes 1 egg. Options: potato, juice + hot drinks."
            : "Prepared: Continental plate. Egg style choice includes 1 egg. Options: potato, juice + hot drinks."),
        sortOrder: applyTo === "maldivian" ? 0 : 1,
        isActive: true,
      },
      include: { lines: { include: { stockItem: true } } },
    });
  } else {
    await prisma.mealMenu.update({
      where: { id: menu.id },
      data: {
        name: applyTo === "maldivian" ? "Maldivian breakfast" : "Continental breakfast",
        notes:
          menu.notes ??
          recipe?.notes ??
          (applyTo === "maldivian"
            ? "Prepared: Roshi, Mashuni. Egg style choice includes 1 egg. Options: potato, juice + hot drinks."
            : "Prepared: Continental plate. Egg style choice includes 1 egg. Options: potato, juice + hot drinks."),
        isActive: true,
      },
    });
  }

  if (recipe) {
    if (recipe.kind !== "menu_legacy") {
      await prisma.recipe.update({
        where: { id: recipe.id },
        data: { kind: "menu_legacy" },
      });
    }

    let sort = 0;
    for (const line of recipe.lines) {
      const stockCode = line.stockItem?.code ?? null;
      // Ingredients / multi-item plates live on Prepared recipes — not flat menu stock.
      if (stockCode && PREPARED_BOM_STOCK_CODES.has(stockCode)) {
        continue;
      }
      // Eggs are served via egg_style choices, never as a separate base line.
      if (stockCode === "eggs") {
        continue;
      }
      if (stockCode && !SERVED_STOCK_CODES.has(stockCode) && !line.isOption) {
        // Unknown non-served base stock → skip (should be prepared).
        continue;
      }
      const showOnKot = showOnKotForCode(stockCode, line.showOnKot);
      // Keep recipe Show on KOT aligned for components.
      if (line.showOnKot !== showOnKot) {
        await prisma.recipeLine.update({
          where: { id: line.id },
          data: { showOnKot },
        });
      }

      const role = line.isOption ? "option" : "base";
      const existing = menu.lines.find(
        (l) =>
          l.stockItemId === line.stockItemId ||
          (stockCode && l.stockItem?.code === stockCode),
      );
      if (existing) {
        const qtySame = Number(existing.qtyPerServing) === Number(line.qtyPerServing);
        const alreadyOk =
          existing.role === role &&
          existing.stockItemId === line.stockItemId &&
          qtySame &&
          existing.showOnKot === showOnKot &&
          (existing.notes ?? null) === (line.notes ?? null) &&
          existing.displayName === line.stockItem.name;
        if (!alreadyOk) {
          await prisma.mealMenuLine.update({
            where: { id: existing.id },
            data: {
              role,
              displayName: line.stockItem.name,
              stockItemId: line.stockItemId,
              qtyPerServing: line.qtyPerServing,
              notes: line.notes,
              showOnKot,
              sortOrder: sort,
              choiceGroupKey: null,
              choiceGroupLabel: null,
            },
          });
        }
        sort += 1;
      } else {
        await prisma.mealMenuLine.create({
          data: {
            menuId: menu.id,
            role,
            displayName: line.stockItem.name,
            stockItemId: line.stockItemId,
            qtyPerServing: line.qtyPerServing,
            notes: line.notes,
            showOnKot,
            sortOrder: sort++,
          },
        });
      }
    }
  }

  await ensureEggStyleChoices(menu.id, eggsStockId);

  return prisma.mealMenu.findUniqueOrThrow({
    where: { id: menu.id },
    include: { lines: { include: { stockItem: true } } },
  });
}

async function ensureAddonsKind(userId: string) {
  await prisma.recipe.updateMany({
    where: { userId, applyTo: "room_extras" },
    data: { kind: "addons" },
  });
  await prisma.recipe.updateMany({
    where: { userId, applyTo: "custom", kind: "menu_legacy" },
    data: { kind: "prepared" },
  });
}

function optionIdsFromLegacyFlags(
  flags: LegacyFlags,
  optionLines: Array<{
    id: string;
    stockItemId: string | null;
    displayName?: string | null;
    stockItem?: { code: string | null } | null;
    componentRecipe?: { code: string | null; name: string | null } | null;
  }>,
): string[] {
  const ids: string[] = [];
  for (const row of LEGACY_OPTION_MATCH) {
    if (!flags[row.flag]) continue;
    const want = new Set(row.codes);
    for (const line of optionLines) {
      const code = line.stockItem?.code ?? line.componentRecipe?.code ?? null;
      const label = `${line.displayName ?? ""} ${line.componentRecipe?.name ?? ""}`;
      if ((code && want.has(code)) || (row.names && row.names.test(label))) {
        ids.push(line.id);
      }
    }
  }
  return [...new Set(ids)];
}

function sameStringArray(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

function sameChoiceMap(a: Record<string, string>, b: unknown) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return false;
  const bb = b as Record<string, string>;
  const keys = new Set([...Object.keys(a), ...Object.keys(bb)]);
  for (const k of keys) {
    if (a[k] !== bb[k]) return false;
  }
  return true;
}

/**
 * Link breakfast orders to menus and copy legacy boolean sides into selectedOptionIds.
 * Only writes rows that still need linking or flag→option mapping.
 */
async function backfillOrders(userId: string) {
  const menus = await prisma.mealMenu.findMany({
    where: { userId, mealPeriod: "breakfast", isActive: true },
    include: {
      lines: { include: { stockItem: true, componentRecipe: true } },
    },
  });
  const byCode = new Map(menus.filter((m) => m.code).map((m) => [m.code!, m]));

  // Unlinked orders, or any order whose legacy side flags are not yet reflected in option line ids
  // (e.g. potato added to Continental after orders existed).
  const orders = await prisma.breakfastOrder.findMany({
    where: {
      userId,
      mealPeriod: "breakfast",
      OR: [
        { menuId: null },
        { potato: true },
        { juice: true },
        { tea: true },
        { coffee: true },
        { milk: true },
        { sugar: true },
      ],
    },
  });

  const updates: Array<ReturnType<typeof prisma.breakfastOrder.update>> = [];

  for (const o of orders) {
    const menu = byCode.get(o.breakfastType) ?? (o.menuId ? menus.find((m) => m.id === o.menuId) : undefined);
    if (!menu) continue;

    const eggLine = menu.lines.find(
      (l) =>
        l.role === "choice" &&
        l.choiceGroupKey === "egg_style" &&
        (l.notes === o.eggStyle ||
          l.displayName?.toLowerCase() === o.eggStyle ||
          (o.eggStyle === "omelette" && l.displayName === "Omelette") ||
          (o.eggStyle === "fried" && l.displayName === "Fried") ||
          (o.eggStyle === "boiled" && l.displayName === "Boiled") ||
          (o.eggStyle === "scrambled" && l.displayName === "Scrambled")),
    );

    const existingChoices =
      o.selectedChoiceIds && typeof o.selectedChoiceIds === "object" && !Array.isArray(o.selectedChoiceIds)
        ? { ...(o.selectedChoiceIds as Record<string, string>) }
        : {};
    if (eggLine) existingChoices.egg_style = eggLine.id;

    const optionLines = menu.lines.filter((l) => l.role === "option");
    const validIds = new Set(optionLines.map((l) => l.id));

    const fromExisting = (o.selectedOptionIds ?? [])
      .map((id) => {
        if (validIds.has(id)) return id;
        const byStock = optionLines.find((l) => l.stockItemId === id);
        return byStock?.id ?? null;
      })
      .filter((id): id is string => !!id);

    // Merge any legacy flags that are still missing from selected options (additive only).
    const fromFlags = optionIdsFromLegacyFlags(
      {
        potato: o.potato,
        juice: o.juice,
        tea: o.tea,
        coffee: o.coffee,
        milk: o.milk,
        sugar: o.sugar,
      },
      optionLines,
    );

    const selectedOptionIds = [...new Set([...fromExisting, ...fromFlags])];

    const needsWrite =
      o.menuId !== menu.id ||
      !sameStringArray(o.selectedOptionIds ?? [], selectedOptionIds) ||
      !sameChoiceMap(existingChoices, o.selectedChoiceIds);

    if (!needsWrite) continue;

    updates.push(
      prisma.breakfastOrder.update({
        where: { id: o.id },
        data: {
          menuId: menu.id,
          mealPeriod: "breakfast",
          selectedChoiceIds: existingChoices,
          selectedOptionIds,
        },
      }),
    );
  }

  const chunk = 40;
  for (let i = 0; i < updates.length; i += chunk) {
    await Promise.all(updates.slice(i, i + chunk));
  }
}

function hasPreparedLine(
  lines: Array<{
    role: string;
    componentRecipeId: string | null;
    componentRecipe?: { code: string | null; name: string | null } | null;
  }>,
  role: string,
  code: string,
  nameRe: RegExp,
) {
  return lines.some(
    (l) =>
      l.role === role &&
      l.componentRecipeId &&
      (l.componentRecipe?.code === code || nameRe.test(l.componentRecipe?.name ?? "")),
  );
}

async function menusNeedSync(userId: string) {
  const menus = await prisma.mealMenu.findMany({
    where: { userId, code: { in: ["maldivian", "continental"] }, isActive: true },
    include: {
      lines: {
        include: {
          stockItem: { select: { code: true } },
          componentRecipe: { select: { code: true, name: true } },
        },
      },
    },
  });
  const byCode = new Map(menus.map((m) => [m.code!, m]));
  const mal = byCode.get("maldivian");
  const con = byCode.get("continental");
  if (!mal || !con) return true;

  const eggChoiceOk = (lines: typeof mal.lines) => {
    const choices = lines.filter((l) => l.role === "choice" && l.choiceGroupKey === "egg_style");
    if (choices.length < 4) return false;
    // Must map to real eggs stock (not marker), qty 1 — egg lives on the choice.
    return choices.every(
      (l) => l.stockItem?.code === "eggs" && !lines.some((b) => b.role === "base" && b.stockItem?.code === "eggs"),
    );
  };
  if (!eggChoiceOk(mal.lines) || !eggChoiceOk(con.lines)) return true;

  if (!hasPreparedLine(mal.lines, "base", "roshi", /roshi/i)) return true;
  if (!hasPreparedLine(mal.lines, "base", "mashuni_cups", /mashuni/i)) return true;
  if (!hasPreparedLine(mal.lines, "option", "stir_fried_potato", /potato/i)) return true;
  if (!hasPreparedLine(mal.lines, "option", "juice", /^juice$/i)) return true;
  if (!hasPreparedLine(con.lines, "base", "continental_plate", /continental/i)) return true;
  if (!hasPreparedLine(con.lines, "option", "stir_fried_potato", /potato/i)) return true;
  if (!hasPreparedLine(con.lines, "option", "juice", /^juice$/i)) return true;

  // Any flat BOM stock still on either menu → cleanup
  for (const m of [mal, con]) {
    const flatBom = m.lines.some(
      (l) =>
        l.stockItem?.code &&
        PREPARED_BOM_STOCK_CODES.has(l.stockItem.code) &&
        !l.componentRecipeId,
    );
    if (flatBom) return true;
  }

  return false;
}

type MenuLineRow = {
  id: string;
  role: string;
  displayName: string | null;
  stockItemId: string | null;
  componentRecipeId: string | null;
  qtyPerServing: unknown;
  showOnKot: boolean;
  stockItem: { code: string | null } | null;
  componentRecipe: { code: string | null; name: string | null } | null;
};

async function upsertMenuPreparedLine(
  menuId: string,
  lines: MenuLineRow[],
  opts: {
    recipeId: string;
    role: "base" | "option";
    displayName: string;
    qty: number;
    sortOrder: number;
    match: (l: MenuLineRow) => boolean;
  },
) {
  const existing = lines.find(opts.match);
  if (existing) {
    if (
      existing.componentRecipeId === opts.recipeId &&
      !existing.stockItemId &&
      existing.displayName === opts.displayName &&
      Number(existing.qtyPerServing) === opts.qty &&
      existing.showOnKot &&
      existing.role === opts.role
    ) {
      return;
    }
    await prisma.mealMenuLine.update({
      where: { id: existing.id },
      data: {
        role: opts.role,
        displayName: opts.displayName,
        stockItemId: null,
        componentRecipeId: opts.recipeId,
        qtyPerServing: opts.qty,
        showOnKot: true,
        notes: null,
        choiceGroupKey: null,
        choiceGroupLabel: null,
        sortOrder: opts.sortOrder,
      },
    });
    return;
  }
  await prisma.mealMenuLine.create({
    data: {
      menuId,
      role: opts.role,
      displayName: opts.displayName,
      componentRecipeId: opts.recipeId,
      qtyPerServing: opts.qty,
      showOnKot: true,
      sortOrder: opts.sortOrder,
    },
  });
}

/**
 * Map plated dishes onto prepared recipes for Maldivian + Continental.
 * Menu keeps only served singles (eggs, tea/coffee/milk/sugar) as stock.
 */
async function linkPreparedOntoMenus(userId: string) {
  const recipes = await prisma.recipe.findMany({
    where: {
      userId,
      code: {
        in: [
          "mashuni_cups",
          "roshi",
          "stir_fried_potato",
          "juice",
          "continental_plate",
          "pancakes",
        ],
      },
    },
  });
  const byRecipe = new Map(recipes.map((r) => [r.code!, r]));
  for (const r of recipes) {
    if (r.kind !== "prepared") {
      await prisma.recipe.update({ where: { id: r.id }, data: { kind: "prepared" } });
    }
  }

  const menus = await prisma.mealMenu.findMany({
    where: { userId, code: { in: ["maldivian", "continental"] } },
    include: { lines: { include: { stockItem: true, componentRecipe: true } } },
  });

  for (const menu of menus) {
    const lines = menu.lines as MenuLineRow[];
    if (menu.code === "maldivian") {
      const roshi = byRecipe.get("roshi");
      const mashuni = byRecipe.get("mashuni_cups");
      const potato = byRecipe.get("stir_fried_potato");
      const juice = byRecipe.get("juice");
      if (roshi) {
        await upsertMenuPreparedLine(menu.id, lines, {
          recipeId: roshi.id,
          role: "base",
          displayName: "Roshi",
          qty: 5,
          sortOrder: 0,
          match: (l) =>
            l.componentRecipe?.code === "roshi" ||
            l.stockItem?.code === "roshi" ||
            /^roshi$/i.test(l.displayName ?? ""),
        });
      }
      if (mashuni) {
        await upsertMenuPreparedLine(menu.id, lines, {
          recipeId: mashuni.id,
          role: "base",
          displayName: "Mashuni cups",
          qty: 1,
          sortOrder: 1,
          match: (l) =>
            l.componentRecipe?.code === "mashuni_cups" ||
            l.stockItem?.code === "mashuni" ||
            /mashuni/i.test(l.displayName ?? ""),
        });
      }
      if (potato) {
        await upsertMenuPreparedLine(menu.id, lines, {
          recipeId: potato.id,
          role: "option",
          displayName: "Stir-fried potato",
          qty: 1,
          sortOrder: 20,
          match: (l) =>
            l.componentRecipe?.code === "stir_fried_potato" ||
            l.stockItem?.code === "potatoes" ||
            l.stockItem?.code === "potato_portion" ||
            /potato/i.test(l.displayName ?? ""),
        });
      }
      if (juice) {
        await upsertMenuPreparedLine(menu.id, lines, {
          recipeId: juice.id,
          role: "option",
          displayName: "Juice",
          qty: 1,
          sortOrder: 21,
          match: (l) =>
            l.componentRecipe?.code === "juice" ||
            l.stockItem?.code === "sunquick" ||
            /^juice$/i.test(l.displayName ?? "") ||
            /sunquick/i.test(l.displayName ?? ""),
        });
      }
    }

    if (menu.code === "continental") {
      const plate = byRecipe.get("continental_plate");
      const potato = byRecipe.get("stir_fried_potato");
      const juice = byRecipe.get("juice");
      if (plate) {
        await upsertMenuPreparedLine(menu.id, lines, {
          recipeId: plate.id,
          role: "base",
          displayName: "Continental plate",
          qty: 1,
          sortOrder: 0,
          match: (l) =>
            l.componentRecipe?.code === "continental_plate" ||
            l.stockItem?.code === "bread" ||
            /continental plate/i.test(l.displayName ?? ""),
        });
      }
      if (potato) {
        await upsertMenuPreparedLine(menu.id, lines, {
          recipeId: potato.id,
          role: "option",
          displayName: "Stir-fried potato",
          qty: 1,
          sortOrder: 20,
          match: (l) =>
            l.componentRecipe?.code === "stir_fried_potato" ||
            l.stockItem?.code === "potatoes" ||
            l.stockItem?.code === "potato_portion" ||
            /potato/i.test(l.displayName ?? ""),
        });
      }
      if (juice) {
        await upsertMenuPreparedLine(menu.id, lines, {
          recipeId: juice.id,
          role: "option",
          displayName: "Juice",
          qty: 1,
          sortOrder: 21,
          match: (l) =>
            l.componentRecipe?.code === "juice" ||
            l.stockItem?.code === "sunquick" ||
            /^juice$/i.test(l.displayName ?? "") ||
            /sunquick/i.test(l.displayName ?? ""),
        });
      }
    }

    const stale = await prisma.mealMenuLine.findMany({
      where: {
        menuId: menu.id,
        componentRecipeId: null,
        stockItem: { code: { in: [...PREPARED_BOM_STOCK_CODES] } },
      },
      select: { id: true },
    });
    if (stale.length) {
      await prisma.mealMenuLine.deleteMany({ where: { id: { in: stale.map((l) => l.id) } } });
    }
  }
}

/** Idempotent: sync Maldivian/Continental menus from recipes and re-link orders. */
export async function ensureMealMenus(userId: string) {
  await reactivatePlatedStock(userId);
  const { ensurePreparedRecipes } = await import("./kitchenSeed.js");
  await ensurePreparedRecipes(userId);

  const eggsStock = await ensureEggsStock(userId);
  const needsSync = await menusNeedSync(userId);
  if (needsSync) {
    await ensureAddonsKind(userId);
    await syncMenuFromLegacyRecipe(userId, "maldivian", eggsStock.id);
    await syncMenuFromLegacyRecipe(userId, "continental", eggsStock.id);
    await linkPreparedOntoMenus(userId);
  } else {
    // Keep egg choices aligned even on the fast path (cheap updates).
    const menus = await prisma.mealMenu.findMany({
      where: { userId, code: { in: ["maldivian", "continental"] } },
      select: { id: true },
    });
    for (const m of menus) {
      await ensureEggStyleChoices(m.id, eggsStock.id);
    }
  }
  await backfillOrders(userId);
}

export type MealMenuWithLines = Awaited<ReturnType<typeof loadMenusForUser>>[number];

export async function loadMenusForUser(userId: string, mealPeriod?: "breakfast" | "lunch" | "dinner") {
  await ensureMealMenus(userId);
  return prisma.mealMenu.findMany({
    where: {
      userId,
      isActive: true,
      ...(mealPeriod ? { mealPeriod } : {}),
    },
    include: {
      lines: {
        include: {
          stockItem: true,
          componentRecipe: {
            include: { lines: { include: { stockItem: true } } },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: [{ mealPeriod: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
}

export function mapMenuDto(
  m: Awaited<ReturnType<typeof loadMenusForUser>>[number],
) {
  const serving = costMenuServing(m.lines);
  return {
    id: m.id,
    meal_period: m.mealPeriod,
    name: m.name,
    code: m.code,
    notes: m.notes,
    sort_order: m.sortOrder,
    is_active: m.isActive,
    created_at: m.createdAt.toISOString(),
    updated_at: m.updatedAt.toISOString(),
    estimated_cost: serving.estimated_cost,
    cost_incomplete: serving.cost_incomplete,
    lines: m.lines.map((l) => {
      const lineCost = costMenuLine(l);
      return {
        id: l.id,
        role: l.role,
        choice_group_key: l.choiceGroupKey,
        choice_group_label: l.choiceGroupLabel,
        display_name:
          l.displayName ??
          l.stockItem?.name ??
          l.componentRecipe?.name ??
          "Item",
        stock_item_id: l.stockItemId,
        stock_item_name: l.stockItem?.name ?? null,
        stock_item_unit: l.stockItem?.unit ?? null,
        stock_item_code: l.stockItem?.code ?? null,
        component_recipe_id: l.componentRecipeId,
        component_recipe_name: l.componentRecipe?.name ?? null,
        qty_per_serving: dec(l.qtyPerServing),
        notes: l.notes,
        show_on_kot: l.showOnKot,
        sort_order: l.sortOrder,
        mapping: l.componentRecipeId
          ? (`Prepared: ${l.componentRecipe?.name ?? "recipe"}` as const)
          : (`Stock: ${l.stockItem?.name ?? "item"}` as const),
        estimated_cost: lineCost.estimated_cost,
        cost_incomplete: lineCost.cost_incomplete,
      };
    }),
  };
}
