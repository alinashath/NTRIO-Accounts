-- Data-only wipe for app tables (no DROP). Does not touch auth.*.
-- Prefer `npm run db:clear-data` with --user-id for scoped deletes.
-- This file deletes ALL rows in listed tables (dev / disposable DB only).

BEGIN;

DELETE FROM expense_splits;
DELETE FROM debt_payments;
DELETE FROM income_entries;
DELETE FROM expense_entries;
DELETE FROM account_transfers;
DELETE FROM recurring_schedules;
DELETE FROM debts;
DELETE FROM contacts;
DELETE FROM accounts;
DELETE FROM categories;
DELETE FROM user_settings;
-- DELETE FROM users;  -- optional: uncomment only if recreating profiles

COMMIT;
