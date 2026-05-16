-- =============================================================================
-- NTRIO Accounts — FULL DATA RESET (dev/staging only)
-- Wipes all businesses, ledger data, and transaction categories.
-- Does NOT drop schema/functions. Re-run migrations 001–006 if schema is missing.
-- =============================================================================

BEGIN;

TRUNCATE TABLE transaction_attachments CASCADE;
TRUNCATE TABLE transaction_details CASCADE;
TRUNCATE TABLE transaction_categories CASCADE;
TRUNCATE TABLE business_accounts CASCADE;
TRUNCATE TABLE business_members CASCADE;
TRUNCATE TABLE businesses CASCADE;

TRUNCATE TABLE pgledger_entries CASCADE;
TRUNCATE TABLE pgledger_transfers CASCADE;
TRUNCATE TABLE pgledger_accounts CASCADE;

-- Auth users / subscriptions are kept. To wipe those too, uncomment:
-- TRUNCATE TABLE user_subscriptions CASCADE;
-- TRUNCATE TABLE profiles CASCADE;
-- DELETE FROM auth.users;  -- requires service_role; do from Dashboard if needed

COMMIT;

-- Optional: re-seed subscription plans if empty
INSERT INTO subscription_plans (id, name, description, price_monthly_cents, max_businesses, sort_order)
VALUES
  ('starter', 'Starter', 'One business, full bookkeeping', 1900, 1, 1),
  ('pro', 'Pro', 'Up to 5 businesses', 4900, 5, 2),
  ('firm', 'Firm', 'Unlimited businesses for accountants', 9900, 999, 3)
ON CONFLICT (id) DO NOTHING;
