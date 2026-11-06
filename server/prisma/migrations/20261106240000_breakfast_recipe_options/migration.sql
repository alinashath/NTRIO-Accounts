-- Optional sides on breakfast menu recipes; selected sides on each order.
ALTER TABLE "recipe_lines"
  ADD COLUMN IF NOT EXISTS "is_option" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "breakfast_orders"
  ADD COLUMN IF NOT EXISTS "selected_option_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
