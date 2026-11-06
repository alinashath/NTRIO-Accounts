import { prisma } from "../lib/prisma.js";
import { dec } from "../lib/dates.js";
import { ensureMealMenus, loadMenusForUser, mapMenuDto } from "./mealMenus.js";
import type {
  AddonLineSource,
  MenuSource,
  PreparedRecipeSource,
} from "./mealRequirements.js";

export async function loadMealCatalog(userId: string) {
  await ensureMealMenus(userId);
  const [menusRaw, recipes] = await Promise.all([
    loadMenusForUser(userId),
    prisma.recipe.findMany({
      where: { userId, isActive: true },
      include: {
        lines: {
          include: {
            stockItem: { select: { id: true, code: true, name: true, unit: true, isActive: true } },
          },
        },
      },
    }),
  ]);

  const menus: MenuSource[] = menusRaw.map((m) => {
    const dto = mapMenuDto(m);
    return {
      id: dto.id,
      meal_period: dto.meal_period,
      name: dto.name,
      code: dto.code,
      lines: dto.lines.map((l) => ({
        id: l.id,
        role: l.role,
        choice_group_key: l.choice_group_key,
        choice_group_label: l.choice_group_label,
        display_name: l.display_name,
        stock_item_id: l.stock_item_id,
        stock_item_code: l.stock_item_code,
        stock_item_unit: l.stock_item_unit,
        component_recipe_id: l.component_recipe_id,
        component_recipe_name: l.component_recipe_name,
        qty_per_serving: l.qty_per_serving,
        show_on_kot: l.show_on_kot,
        notes: l.notes,
      })),
    };
  });

  const prepared: PreparedRecipeSource[] = recipes
    .filter((r) => r.kind === "prepared" || r.applyTo === "custom")
    .map((r) => ({
      id: r.id,
      name: r.name,
      lines: r.lines
        .filter((l) => l.stockItem.isActive)
        .map((l) => ({
          stock_item_id: l.stockItemId,
          code: l.stockItem.code,
          name: l.stockItem.name,
          unit: l.stockItem.unit,
          qty_per_serving: dec(l.qtyPerServing),
        })),
    }));

  const addons: AddonLineSource[] = [];
  const seen = new Set<string>();
  for (const r of recipes.filter((x) => x.kind === "addons" || x.applyTo === "room_extras")) {
    for (const l of r.lines) {
      if (!l.stockItem.isActive || seen.has(l.stockItemId)) continue;
      seen.add(l.stockItemId);
      addons.push({
        stock_item_id: l.stockItemId,
        code: l.stockItem.code,
        name: l.stockItem.name,
        unit: l.stockItem.unit,
        qty_per_serving: dec(l.qtyPerServing),
        show_on_kot: l.showOnKot,
        notes: l.notes,
      });
    }
  }
  addons.sort((a, b) => a.name.localeCompare(b.name));

  return { menus, prepared, addons, menusDto: menusRaw.map(mapMenuDto) };
}
