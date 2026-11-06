-- Persist latest refill unit price on stock items for meal cost estimates.
ALTER TABLE "stock_items" ADD COLUMN "last_unit_cost" DECIMAL(15,4);

-- Backfill from the most recent ledger day that recorded a unit_cost.
UPDATE "stock_items" si
SET "last_unit_cost" = src.unit_cost
FROM (
  SELECT DISTINCT ON (sld.stock_item_id)
    sld.stock_item_id,
    sld.unit_cost
  FROM "stock_ledger_days" sld
  WHERE sld.unit_cost IS NOT NULL
  ORDER BY sld.stock_item_id, sld.date DESC, sld.updated_at DESC
) src
WHERE si.id = src.stock_item_id
  AND si.last_unit_cost IS NULL;
