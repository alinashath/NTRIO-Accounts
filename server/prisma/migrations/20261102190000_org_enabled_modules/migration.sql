-- Per-tenant workspace module flags (system admin controlled).
ALTER TABLE "organizations"
ADD COLUMN IF NOT EXISTS "enabled_modules" TEXT[] NOT NULL
DEFAULT ARRAY['accounts', 'occupancy', 'kitchen', 'stock']::TEXT[];
