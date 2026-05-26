-- User FX settings (display / default USD↔MVR)
CREATE TABLE "user_settings" (
    "user_id" UUID NOT NULL,
    "global_usd_mvr_rate" DECIMAL(18,8) NOT NULL DEFAULT 15.42,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Debt currency (principal / outstanding in this currency)
ALTER TABLE "debts" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';

-- Cross-currency debt payments
ALTER TABLE "debt_payments" ADD COLUMN "account_amount" DECIMAL(15,2),
ADD COLUMN "exchange_rate" DECIMAL(18,8);

-- Expense: pay from account OR charge to debt (I owe)
ALTER TABLE "expense_entries" ADD COLUMN "debt_id" UUID;
ALTER TABLE "expense_entries" ALTER COLUMN "account_id" DROP NOT NULL;

ALTER TABLE "expense_entries" ADD CONSTRAINT "expense_entries_debt_id_fkey" FOREIGN KEY ("debt_id") REFERENCES "debts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "expense_entries_debt_id_idx" ON "expense_entries"("debt_id");
