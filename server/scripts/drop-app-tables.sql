-- Dev / disposable DB only: drop app tables + enums, then run `prisma db push` or `prisma migrate deploy`.
-- Safe for this app schema; does not touch auth.* or other Supabase system schemas.

DROP TABLE IF EXISTS "expense_splits" CASCADE;
DROP TABLE IF EXISTS "debt_payments" CASCADE;
DROP TABLE IF EXISTS "account_transfers" CASCADE;
DROP TABLE IF EXISTS "income_entries" CASCADE;
DROP TABLE IF EXISTS "expense_entries" CASCADE;
DROP TABLE IF EXISTS "contacts" CASCADE;
DROP TABLE IF EXISTS "debts" CASCADE;
DROP TABLE IF EXISTS "recurring_schedules" CASCADE;
DROP TABLE IF EXISTS "accounts" CASCADE;
DROP TABLE IF EXISTS "categories" CASCADE;
DROP TABLE IF EXISTS "user_settings" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;
DROP TABLE IF EXISTS "_prisma_migrations" CASCADE;

DROP TYPE IF EXISTS "ContactKind" CASCADE;
DROP TYPE IF EXISTS "AccountType" CASCADE;
DROP TYPE IF EXISTS "CategoryKind" CASCADE;
DROP TYPE IF EXISTS "RecurringType" CASCADE;
DROP TYPE IF EXISTS "RecurringFrequency" CASCADE;
DROP TYPE IF EXISTS "DebtDirection" CASCADE;
DROP TYPE IF EXISTS "DebtStatus" CASCADE;
