-- Stock base units, products, recipe input units / batch size, wider unit costs.

-- Stock items: base/display/units
ALTER TABLE "stock_items" ADD COLUMN IF NOT EXISTS "base_unit" TEXT NOT NULL DEFAULT 'pcs';
ALTER TABLE "stock_items" ADD COLUMN IF NOT EXISTS "display_unit" TEXT NOT NULL DEFAULT 'pcs';
ALTER TABLE "stock_items" ADD COLUMN IF NOT EXISTS "units" JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Widen unit cost precision (per-base prices)
ALTER TABLE "stock_items" ALTER COLUMN "last_unit_cost" TYPE DECIMAL(18, 8);
ALTER TABLE "stock_ledger_days" ALTER COLUMN "unit_cost" TYPE DECIMAL(18, 8);

-- Recipes: batch size + recipe line input unit
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "batch_size" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "recipe_lines" ADD COLUMN IF NOT EXISTS "input_qty" DECIMAL(15, 4);
ALTER TABLE "recipe_lines" ADD COLUMN IF NOT EXISTS "input_unit" TEXT;

-- Products that refill stock
CREATE TABLE IF NOT EXISTS "stock_products" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "stock_item_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "qty" DECIMAL(15, 4) NOT NULL,
  "unit_code" TEXT NOT NULL,
  "default_price" DECIMAL(15, 2),
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "stock_products_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "stock_products_user_id_idx" ON "stock_products"("user_id");
CREATE INDEX IF NOT EXISTS "stock_products_stock_item_id_idx" ON "stock_products"("stock_item_id");

DO $$ BEGIN
  ALTER TABLE "stock_products"
    ADD CONSTRAINT "stock_products_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "stock_products"
    ADD CONSTRAINT "stock_products_stock_item_id_fkey"
    FOREIGN KEY ("stock_item_id") REFERENCES "stock_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Convert legacy free-text units into base units + scale quantities/costs.
DO $$
DECLARE
  r RECORD;
  v_base TEXT;
  v_display TEXT;
  v_factor NUMERIC;
  v_units JSONB;
  v_piece_label TEXT;
  u_lower TEXT;
BEGIN
  FOR r IN SELECT id, unit, min_stock, last_unit_cost FROM stock_items LOOP
    u_lower := lower(trim(r.unit));
    v_factor := 1;
    v_piece_label := NULL;

    IF u_lower IN ('kg', 'kgs', 'kilogram', 'kilograms') THEN
      v_base := 'g';
      v_display := 'kg';
      v_factor := 1000;
      v_units := '[{"code":"g","label":"g","to_base":1,"kind":"standard"},{"code":"kg","label":"kg","to_base":1000,"kind":"standard"}]'::jsonb;
    ELSIF u_lower IN ('g', 'gram', 'grams') THEN
      v_base := 'g';
      v_display := 'g';
      v_factor := 1;
      v_units := '[{"code":"g","label":"g","to_base":1,"kind":"standard"},{"code":"kg","label":"kg","to_base":1000,"kind":"standard"}]'::jsonb;
    ELSIF u_lower IN ('l', 'lt', 'liter', 'litre', 'liters', 'litres') THEN
      v_base := 'ml';
      v_display := 'L';
      v_factor := 1000;
      v_units := '[{"code":"ml","label":"ml","to_base":1,"kind":"standard"},{"code":"L","label":"L","to_base":1000,"kind":"standard"}]'::jsonb;
    ELSIF u_lower IN ('ml', 'millilitre', 'milliliter', 'millilitres', 'milliliters') THEN
      v_base := 'ml';
      v_display := 'ml';
      v_factor := 1;
      v_units := '[{"code":"ml","label":"ml","to_base":1,"kind":"standard"},{"code":"L","label":"L","to_base":1000,"kind":"standard"}]'::jsonb;
    ELSE
      v_base := 'pcs';
      v_factor := 1;
      v_piece_label := NULLIF(trim(r.unit), '');
      IF u_lower IN ('number', 'pcs', 'pc', 'piece', 'pieces', '') THEN
        v_display := 'pcs';
        v_units := '[{"code":"pcs","label":"pcs","to_base":1,"kind":"standard"}]'::jsonb;
      ELSE
        v_display := replace(u_lower, ' ', '_');
        v_units := jsonb_build_array(
          jsonb_build_object('code', 'pcs', 'label', coalesce(v_piece_label, 'pcs'), 'to_base', 1, 'kind', 'standard'),
          jsonb_build_object('code', v_display, 'label', coalesce(v_piece_label, v_display), 'to_base', 1, 'kind', 'standard')
        );
      END IF;
    END IF;

    UPDATE stock_items
    SET
      base_unit = v_base,
      display_unit = v_display,
      units = v_units,
      unit = CASE
        WHEN v_base = 'g' AND v_display = 'kg' THEN 'kg'
        WHEN v_base = 'g' THEN 'g'
        WHEN v_base = 'ml' AND v_display = 'L' THEN 'L'
        WHEN v_base = 'ml' THEN 'ml'
        ELSE coalesce(v_piece_label, 'pcs')
      END,
      min_stock = min_stock * v_factor,
      last_unit_cost = CASE
        WHEN last_unit_cost IS NULL THEN NULL
        WHEN v_factor = 1 THEN last_unit_cost
        ELSE last_unit_cost / v_factor
      END
    WHERE id = r.id;

    IF v_factor <> 1 THEN
      UPDATE stock_ledger_days
      SET
        opening = opening * v_factor,
        received = received * v_factor,
        used = used * v_factor,
        waste = waste * v_factor,
        unit_cost = CASE
          WHEN unit_cost IS NULL THEN NULL
          ELSE unit_cost / v_factor
        END
      WHERE stock_item_id = r.id;

      UPDATE recipe_lines
      SET qty_per_serving = qty_per_serving * v_factor
      WHERE stock_item_id = r.id;

      UPDATE meal_menu_lines
      SET qty_per_serving = qty_per_serving * v_factor
      WHERE stock_item_id = r.id;
    END IF;

    -- Backfill recipe line input fields from base qty + display unit
    UPDATE recipe_lines rl
    SET
      input_qty = CASE
        WHEN v_factor = 1 THEN rl.qty_per_serving
        ELSE rl.qty_per_serving / v_factor
      END,
      input_unit = v_display
    WHERE rl.stock_item_id = r.id
      AND rl.input_unit IS NULL;
  END LOOP;

  -- Pancake batter recipes: BOM is per 20 pieces
  UPDATE recipes
  SET batch_size = 20
  WHERE code = 'pancakes'
    AND batch_size = 1;
END $$;
