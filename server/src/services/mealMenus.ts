/**
 * Ensure MealMenu rows exist for each user from legacy maldivian/continental recipes,
 * and backfill BreakfastOrder.menuId / selectedChoiceIds.
 */
import { prisma } from "../lib/prisma.js";
import { dec } from "../lib/dates.js";

const EGG_STYLES = [
  { key: "omelette", label: "Omelette" },
  { key: "fried", label: "Fried" },
  { key: "boiled", label: "Boiled" },
  { key: "scrambled", label: "Scrambled" },
] as const;

async function ensureEggStyleStock(userId: string) {
  const existing = await prisma.stockItem.findUnique({
    where: { userId_code: { userId, code: "egg_style_marker" } },
  });
  if (existing) return existing;
  return prisma.stockItem.create({
    data: {
      userId,
      code: "egg_style_marker",
      name: "Egg style (prep)",
      unit: "each",
      kind: "kitchen",
      minStock: 0,
      useNotes: "Display-only choice for egg cooking style; eggs stocked via menu base lines.",
      sortOrder: 900,
      isActive: true,
    },
  });
}

async function upsertMenuFromLegacyRecipe(
  userId: string,
  applyTo: "maldivian" | "continental",
  eggStockId: string,
) {
  const code = applyTo;
  let menu = await prisma.mealMenu.findUnique({
    where: { userId_code: { userId, code } },
    include: { lines: true },
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
        notes: recipe?.notes ?? null,
        sortOrder: applyTo === "maldivian" ? 0 : 1,
        isActive: true,
      },
      include: { lines: true },
    });
  }

  if (menu.lines.length > 0) return menu;

  if (recipe) {
    await prisma.recipe.update({
      where: { id: recipe.id },
      data: { kind: "menu_legacy" },
    });
    let sort = 0;
    for (const line of recipe.lines) {
      if (!line.stockItem.isActive) continue;
      await prisma.mealMenuLine.create({
        data: {
          menuId: menu.id,
          role: line.isOption ? "option" : "base",
          displayName: line.stockItem.name,
          stockItemId: line.stockItemId,
          qtyPerServing: line.qtyPerServing,
          notes: line.notes,
          showOnKot: line.showOnKot,
          sortOrder: sort++,
        },
      });
    }
  }

  // Egg style choice group (zero stock impact)
  let eggSort = 100;
  for (const style of EGG_STYLES) {
    await prisma.mealMenuLine.create({
      data: {
        menuId: menu.id,
        role: "choice",
        choiceGroupKey: "egg_style",
        choiceGroupLabel: "Egg style",
        displayName: style.label,
        stockItemId: eggStockId,
        qtyPerServing: 0,
        showOnKot: true,
        notes: style.key,
        sortOrder: eggSort++,
      },
    });
  }

  return prisma.mealMenu.findUniqueOrThrow({
    where: { id: menu.id },
    include: { lines: true },
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

async function backfillOrders(userId: string) {
  const menus = await prisma.mealMenu.findMany({
    where: { userId, mealPeriod: "breakfast", isActive: true },
    include: { lines: true },
  });
  const byCode = new Map(menus.filter((m) => m.code).map((m) => [m.code!, m]));

  const orders = await prisma.breakfastOrder.findMany({
    where: { userId, menuId: null },
  });

  for (const o of orders) {
    const menu = byCode.get(o.breakfastType);
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
    const selectedChoiceIds: Record<string, string> = {};
    if (eggLine) selectedChoiceIds.egg_style = eggLine.id;

    // Map legacy selectedOptionIds (stock ids) → menu line ids where possible
    const optionLines = menu.lines.filter((l) => l.role === "option");
    const mappedOptions = (o.selectedOptionIds ?? [])
      .map((id) => {
        const byLine = optionLines.find((l) => l.id === id);
        if (byLine) return byLine.id;
        const byStock = optionLines.find((l) => l.stockItemId === id);
        return byStock?.id ?? id;
      })
      .filter(Boolean);

    await prisma.breakfastOrder.update({
      where: { id: o.id },
      data: {
        menuId: menu.id,
        mealPeriod: o.mealPeriod ?? "breakfast",
        selectedChoiceIds,
        selectedOptionIds: mappedOptions,
      },
    });
  }
}

/** Idempotent: create menus from legacy recipes and link existing orders. */
export async function ensureMealMenus(userId: string) {
  await ensureAddonsKind(userId);
  const eggStock = await ensureEggStyleStock(userId);
  await upsertMenuFromLegacyRecipe(userId, "maldivian", eggStock.id);
  await upsertMenuFromLegacyRecipe(userId, "continental", eggStock.id);
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
    lines: m.lines.map((l) => ({
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
    })),
  };
}
