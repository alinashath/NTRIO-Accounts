-- Optional Maldives Green Tax on org + GST invoice entries.
ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "green_tax_enabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "income_entries"
  ADD COLUMN IF NOT EXISTS "green_tax_amount" DECIMAL(15, 2),
  ADD COLUMN IF NOT EXISTS "green_tax_check_in" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "green_tax_check_out" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "green_tax_form_url" VARCHAR(2048);

ALTER TABLE "expense_entries"
  ADD COLUMN IF NOT EXISTS "green_tax_amount" DECIMAL(15, 2),
  ADD COLUMN IF NOT EXISTS "green_tax_check_in" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "green_tax_check_out" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "green_tax_form_url" VARCHAR(2048);
