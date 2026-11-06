/**
 * @deprecated Prefer mealRequirements — re-exports kept for gradual migration.
 */
export {
  type OrderLike,
  type MealOrderLike,
  type ExtrasLike,
  type ExtraSelectionLike,
  type RecipeNeedSource,
  type IngredientNeedLine,
  type KitchenPrep,
  type KotPrepLine as KotBreakfastSideLine,
  type KotPrepLine as KotExtraLine,
  type ServerSummaryRow,
  type MenuSource,
  type MenuLineSource,
  type PreparedRecipeSource,
  type AddonLineSource,
  toMealOrderLike,
  resolveOrderMenuLines,
  computeKitchenPrep,
  computeIngredientNeeds,
  computeKotExtras,
  computeServerSummary,
  computeTableService,
  resolveSelectedExtras,
  isOutsideNormalWindow,
  normalServingTimes,
  isPancakeCode as isPancakeExtraCode,
  isPancakeName,
  normalizeChoiceIds,
} from "./mealRequirements.js";

import { isPancakeCode, isPancakeName } from "./mealRequirements.js";

export function isPancakeExtraLine(line: { code?: string | null; name?: string }) {
  return isPancakeCode(line.code ?? null) || isPancakeName(line.name);
}

/** @deprecated Use resolveOrderMenuLines */
export function resolveOrderOptionLines(
  _recipes: unknown,
  _breakfastType: "maldivian" | "continental",
  _selectedOptionIds: string[] | undefined,
) {
  return [] as Array<{
    stock_item_id: string;
    code: string | null;
    name?: string;
    unit?: string;
    qty_per_serving: number;
    show_on_kot?: boolean;
    is_option?: boolean;
  }>;
}
