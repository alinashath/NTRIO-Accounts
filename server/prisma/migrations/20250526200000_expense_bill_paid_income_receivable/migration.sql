-- Expense: bill vs paid date (cash/ledger uses paid when set).
ALTER TABLE "expense_entries" ADD COLUMN "bill_date" DATE;
ALTER TABLE "expense_entries" ADD COLUMN "paid_date" DATE;

UPDATE "expense_entries"
SET
  "bill_date" = "date",
  "paid_date" = CASE WHEN COALESCE("pay_later", false) THEN NULL ELSE "date" END;

ALTER TABLE "expense_entries" ALTER COLUMN "bill_date" SET NOT NULL;

-- Income: optional account (receivable), received date, amount currency.
ALTER TABLE "income_entries" ADD COLUMN "received_date" DATE;
ALTER TABLE "income_entries" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';

UPDATE "income_entries" AS ie
SET
  "received_date" = ie."date",
  "currency" = a."currency"
FROM "accounts" AS a
WHERE ie."account_id" = a."id";

ALTER TABLE "income_entries" ALTER COLUMN "account_id" DROP NOT NULL;
