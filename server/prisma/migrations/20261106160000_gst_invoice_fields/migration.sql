-- Optional MIRA-style GST / tax invoice fields on income and expense.
ALTER TABLE "income_entries" ADD COLUMN IF NOT EXISTS "invoice_number" VARCHAR(64);
ALTER TABLE "income_entries" ADD COLUMN IF NOT EXISTS "gst_rate" DECIMAL(5, 2);
ALTER TABLE "income_entries" ADD COLUMN IF NOT EXISTS "gst_subtotal" DECIMAL(15, 2);
ALTER TABLE "income_entries" ADD COLUMN IF NOT EXISTS "gst_amount" DECIMAL(15, 2);
ALTER TABLE "income_entries" ADD COLUMN IF NOT EXISTS "zero_rated_amount" DECIMAL(15, 2);

ALTER TABLE "expense_entries" ADD COLUMN IF NOT EXISTS "invoice_number" VARCHAR(64);
ALTER TABLE "expense_entries" ADD COLUMN IF NOT EXISTS "gst_rate" DECIMAL(5, 2);
ALTER TABLE "expense_entries" ADD COLUMN IF NOT EXISTS "gst_subtotal" DECIMAL(15, 2);
ALTER TABLE "expense_entries" ADD COLUMN IF NOT EXISTS "gst_amount" DECIMAL(15, 2);
ALTER TABLE "expense_entries" ADD COLUMN IF NOT EXISTS "zero_rated_amount" DECIMAL(15, 2);
