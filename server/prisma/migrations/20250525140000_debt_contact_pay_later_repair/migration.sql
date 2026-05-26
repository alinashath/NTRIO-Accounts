-- Idempotent repair + features: align DB with current Prisma when older steps were skipped,
-- plus debt ↔ contact link and pay-later expenses (no account/debt until settled).

-- debts: currency (from prior feature migration) + optional CRM contact
ALTER TABLE "debts" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "debts" ADD COLUMN IF NOT EXISTS "contact_id" UUID;

DO $$
BEGIN
  ALTER TABLE "debts"
    ADD CONSTRAINT "debts_contact_id_fkey"
    FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "debts_contact_id_idx" ON "debts"("contact_id");

-- expense_entries: charge-to-debt + optional account + pay later
ALTER TABLE "expense_entries" ADD COLUMN IF NOT EXISTS "debt_id" UUID;
ALTER TABLE "expense_entries" ADD COLUMN IF NOT EXISTS "pay_later" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "expense_entries" ADD COLUMN IF NOT EXISTS "bill_currency" TEXT NOT NULL DEFAULT 'USD';

ALTER TABLE "expense_entries" ALTER COLUMN "account_id" DROP NOT NULL;

DO $$
BEGIN
  ALTER TABLE "expense_entries"
    ADD CONSTRAINT "expense_entries_debt_id_fkey"
    FOREIGN KEY ("debt_id") REFERENCES "debts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "expense_entries_debt_id_idx" ON "expense_entries"("debt_id");
CREATE INDEX IF NOT EXISTS "expense_entries_user_pay_later_idx" ON "expense_entries"("user_id", "pay_later");

-- debt_payments: cross-currency columns (if missing)
ALTER TABLE "debt_payments" ADD COLUMN IF NOT EXISTS "account_amount" DECIMAL(15,2);
ALTER TABLE "debt_payments" ADD COLUMN IF NOT EXISTS "exchange_rate" DECIMAL(18,8);

-- user_settings (if never created)
CREATE TABLE IF NOT EXISTS "user_settings" (
    "user_id" UUID NOT NULL,
    "global_usd_mvr_rate" DECIMAL(18,8) NOT NULL DEFAULT 15.42,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("user_id")
);

DO $$
BEGIN
  ALTER TABLE "user_settings"
    ADD CONSTRAINT "user_settings_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
