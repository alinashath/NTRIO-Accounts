-- =============================================================================
-- NTRIO ACCOUNTS — FULL DATABASE RESET (DESTRUCTIVE)
-- Run only on dev/staging. Drops all NTRIO + pgledger objects in public schema.
-- Does NOT delete auth.users — sign-up users remain.
-- =============================================================================

BEGIN;

-- App tables (dependency order)
DROP TABLE IF EXISTS transaction_attachments CASCADE;
DROP TABLE IF EXISTS transaction_details CASCADE;
DROP TABLE IF EXISTS transaction_categories CASCADE;
DROP TABLE IF EXISTS business_members CASCADE;
DROP TABLE IF EXISTS business_accounts CASCADE;
DROP TABLE IF EXISTS businesses CASCADE;
DROP TABLE IF EXISTS user_subscriptions CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS subscription_plans CASCADE;

-- Ledger
DROP TABLE IF EXISTS pgledger_entries CASCADE;
DROP TABLE IF EXISTS pgledger_transfers CASCADE;
DROP TABLE IF EXISTS pgledger_accounts CASCADE;

DROP TABLE IF EXISTS _ntrio_migrations CASCADE;

-- Views
DROP VIEW IF EXISTS transaction_categories_view CASCADE;
DROP VIEW IF EXISTS business_transactions_view CASCADE;
DROP VIEW IF EXISTS business_summary_view CASCADE;
DROP VIEW IF EXISTS business_accounts_view CASCADE;
DROP VIEW IF EXISTS pgledger_entries_view CASCADE;
DROP VIEW IF EXISTS pgledger_transfers_view CASCADE;
DROP VIEW IF EXISTS pgledger_accounts_view CASCADE;
DROP VIEW IF EXISTS my_subscription_view CASCADE;
DROP VIEW IF EXISTS my_businesses_view CASCADE;
DROP VIEW IF EXISTS balance_sheet_view CASCADE;
DROP VIEW IF EXISTS period_pl_summary_view CASCADE;

-- Types
DROP TYPE IF EXISTS transfer_request CASCADE;
DROP TYPE IF EXISTS member_role CASCADE;
DROP TYPE IF EXISTS subscription_status CASCADE;
DROP TYPE IF EXISTS account_category CASCADE;
DROP TYPE IF EXISTS transaction_kind CASCADE;

-- Functions (ntrio + pgledger + ulid)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS sig
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND (
        proname LIKE 'ntrio_%'
        OR proname LIKE 'pgledger_%'
        OR proname IN (
          'parse_ulid', 'ulid_to_uuid', 'format_ulid', 'uuid_to_ulid',
          'handle_new_user'
        )
      )
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

COMMIT;

-- Re-apply migrations in order (run each file in Supabase SQL editor):
--   20250516000001_ulid_helpers.sql
--   20250516000002_pgledger.sql
--   20250516000003_ntrio_business_layer.sql
--   20250516000004_auth_multibusiness_subscriptions.sql
--   20250516000005_guesthouse_editable_accounts.sql
--   20250516000006_multicurrency_balances_attachments.sql
