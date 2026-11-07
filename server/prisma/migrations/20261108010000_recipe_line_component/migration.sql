-- Addon / extras lines can expand a prepared recipe (batch_size) instead of
-- depleting a marker stock item. Removes need for pancake-specific code paths.

ALTER TABLE "recipe_lines" ADD COLUMN IF NOT EXISTS "component_recipe_id" UUID;

DO $$ BEGIN
  ALTER TABLE "recipe_lines"
    ADD CONSTRAINT "recipe_lines_component_recipe_id_fkey"
    FOREIGN KEY ("component_recipe_id") REFERENCES "recipes"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "recipe_lines_component_recipe_id_idx"
  ON "recipe_lines"("component_recipe_id");
