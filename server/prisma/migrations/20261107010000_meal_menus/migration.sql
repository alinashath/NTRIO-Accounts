-- Configurable meal menus + prepared recipe kinds; extend guest orders for all meal periods.

CREATE TYPE "RecipeKind" AS ENUM ('menu_legacy', 'prepared', 'addons');
CREATE TYPE "MealMenuLineRole" AS ENUM ('base', 'option', 'choice');

ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "kind" "RecipeKind" NOT NULL DEFAULT 'menu_legacy';
CREATE INDEX IF NOT EXISTS "recipes_user_id_kind_idx" ON "recipes"("user_id", "kind");

-- Classify existing recipes
UPDATE "recipes" SET "kind" = 'addons' WHERE "apply_to" = 'room_extras';
UPDATE "recipes" SET "kind" = 'prepared' WHERE "apply_to" = 'custom';
UPDATE "recipes" SET "kind" = 'menu_legacy' WHERE "apply_to" IN ('maldivian', 'continental');

CREATE TABLE IF NOT EXISTS "meal_menus" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "meal_period" "MealPeriod" NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "notes" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "meal_menus_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "meal_menus_user_id_code_key" ON "meal_menus"("user_id", "code");
CREATE INDEX IF NOT EXISTS "meal_menus_user_id_meal_period_idx" ON "meal_menus"("user_id", "meal_period");

ALTER TABLE "meal_menus"
  DROP CONSTRAINT IF EXISTS "meal_menus_user_id_fkey";
ALTER TABLE "meal_menus"
  ADD CONSTRAINT "meal_menus_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "meal_menu_lines" (
  "id" UUID NOT NULL,
  "menu_id" UUID NOT NULL,
  "role" "MealMenuLineRole" NOT NULL DEFAULT 'base',
  "choice_group_key" TEXT,
  "choice_group_label" TEXT,
  "display_name" TEXT,
  "stock_item_id" UUID,
  "component_recipe_id" UUID,
  "qty_per_serving" DECIMAL(15,4) NOT NULL DEFAULT 1,
  "notes" TEXT,
  "show_on_kot" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "meal_menu_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "meal_menu_lines_menu_id_idx" ON "meal_menu_lines"("menu_id");

ALTER TABLE "meal_menu_lines"
  DROP CONSTRAINT IF EXISTS "meal_menu_lines_menu_id_fkey";
ALTER TABLE "meal_menu_lines"
  ADD CONSTRAINT "meal_menu_lines_menu_id_fkey"
  FOREIGN KEY ("menu_id") REFERENCES "meal_menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "meal_menu_lines"
  DROP CONSTRAINT IF EXISTS "meal_menu_lines_stock_item_id_fkey";
ALTER TABLE "meal_menu_lines"
  ADD CONSTRAINT "meal_menu_lines_stock_item_id_fkey"
  FOREIGN KEY ("stock_item_id") REFERENCES "stock_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "meal_menu_lines"
  DROP CONSTRAINT IF EXISTS "meal_menu_lines_component_recipe_id_fkey";
ALTER TABLE "meal_menu_lines"
  ADD CONSTRAINT "meal_menu_lines_component_recipe_id_fkey"
  FOREIGN KEY ("component_recipe_id") REFERENCES "recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Extend breakfast_orders for all meal periods + menu selections
ALTER TABLE "breakfast_orders" ADD COLUMN IF NOT EXISTS "meal_period" "MealPeriod" NOT NULL DEFAULT 'breakfast';
ALTER TABLE "breakfast_orders" ADD COLUMN IF NOT EXISTS "menu_id" UUID;
ALTER TABLE "breakfast_orders" ADD COLUMN IF NOT EXISTS "selected_choice_ids" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "breakfast_orders"
  DROP CONSTRAINT IF EXISTS "breakfast_orders_menu_id_fkey";
ALTER TABLE "breakfast_orders"
  ADD CONSTRAINT "breakfast_orders_menu_id_fkey"
  FOREIGN KEY ("menu_id") REFERENCES "meal_menus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Replace unique key to include meal_period
ALTER TABLE "breakfast_orders" DROP CONSTRAINT IF EXISTS "breakfast_orders_user_id_room_id_breakfast_date_guest_number_key";
DROP INDEX IF EXISTS "breakfast_orders_user_id_room_id_breakfast_date_guest_number_key";
CREATE UNIQUE INDEX IF NOT EXISTS "breakfast_orders_user_room_date_period_guest_key"
  ON "breakfast_orders"("user_id", "room_id", "breakfast_date", "meal_period", "guest_number");
CREATE INDEX IF NOT EXISTS "breakfast_orders_user_id_breakfast_date_meal_period_idx"
  ON "breakfast_orders"("user_id", "breakfast_date", "meal_period");
