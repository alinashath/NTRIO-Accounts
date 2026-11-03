-- AlterTable
ALTER TABLE "room_day_extras" ADD COLUMN "selected_lines" JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Backfill quantities of 1 from selected_item_ids
UPDATE "room_day_extras"
SET "selected_lines" = COALESCE(
  (
    SELECT jsonb_agg(
      jsonb_build_object('stock_item_id', x, 'quantity', 1)
      ORDER BY x
    )
    FROM unnest("selected_item_ids") AS x
  ),
  '[]'::jsonb
)
WHERE cardinality("selected_item_ids") > 0;
