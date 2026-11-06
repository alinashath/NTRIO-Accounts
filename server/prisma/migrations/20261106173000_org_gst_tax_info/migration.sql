-- Organization-level Maldives GST / MIRA tax filing details.
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "gst_tin" VARCHAR(64);
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "gst_registered_name" VARCHAR(160);
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "gst_return_currency" VARCHAR(8) NOT NULL DEFAULT 'MVR';
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "taxable_activities" JSONB NOT NULL DEFAULT '[]'::jsonb;
