-- Org option to collect MIRA Information Sheet guest rows; store guests on income.
ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "green_tax_collect_guests" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "income_entries"
  ADD COLUMN IF NOT EXISTS "green_tax_guests" JSONB NOT NULL DEFAULT '[]'::jsonb;
