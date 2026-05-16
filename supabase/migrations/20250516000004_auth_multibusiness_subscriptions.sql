-- Auth, multi-business membership, and subscriptions

CREATE TYPE member_role AS ENUM ('owner', 'admin', 'member');

CREATE TYPE subscription_status AS ENUM (
  'trialing',
  'active',
  'canceled',
  'past_due',
  'expired'
);

-- Profiles
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Subscription plans
CREATE TABLE subscription_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price_monthly_cents INTEGER NOT NULL DEFAULT 0,
  max_businesses INTEGER NOT NULL DEFAULT 1,
  stripe_price_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO subscription_plans (id, name, description, price_monthly_cents, max_businesses, sort_order)
VALUES
  ('starter', 'Starter', 'One business, full bookkeeping', 1900, 1, 1),
  ('pro', 'Pro', 'Up to 5 businesses', 4900, 5, 2),
  ('firm', 'Firm', 'Unlimited businesses for accountants', 9900, 999, 3);

-- User subscriptions (one per user)
CREATE TABLE user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES subscription_plans (id),
  status subscription_status NOT NULL DEFAULT 'trialing',
  trial_ends_at TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX user_subscriptions_user_id_idx ON user_subscriptions (user_id);
CREATE INDEX user_subscriptions_status_idx ON user_subscriptions (status);

-- Business membership (multi-business)
CREATE TABLE business_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role member_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, user_id)
);

CREATE INDEX business_members_user_id_idx ON business_members (user_id);
CREATE INDEX business_members_business_id_idx ON business_members (business_id);

-- Businesses the current user belongs to
CREATE VIEW my_businesses_view AS
SELECT
  b.id,
  b.name,
  b.currency,
  b.created_at,
  b.updated_at,
  bm.role,
  bm.user_id
FROM businesses b
INNER JOIN business_members bm ON b.id = bm.business_id
WHERE bm.user_id = auth.uid();

-- Subscription status for current user
CREATE VIEW my_subscription_view AS
SELECT
  us.id,
  us.user_id,
  us.plan_id,
  sp.name AS plan_name,
  sp.max_businesses,
  sp.price_monthly_cents,
  us.status,
  us.trial_ends_at,
  us.current_period_end,
  us.stripe_customer_id,
  (
    us.status IN ('trialing', 'active')
    AND COALESCE(us.current_period_end, us.trial_ends_at, now()) >= now()
  ) AS is_active
FROM user_subscriptions us
INNER JOIN subscription_plans sp ON us.plan_id = sp.id
WHERE us.user_id = auth.uid();

-- Helpers
CREATE OR REPLACE FUNCTION ntrio_user_business_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT business_id FROM business_members WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION ntrio_is_business_member(p_business_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM business_members
    WHERE business_id = p_business_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION ntrio_has_active_subscription(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_subscriptions us
    WHERE us.user_id = p_user_id
      AND us.status IN ('trialing', 'active')
      AND COALESCE(us.current_period_end, us.trial_ends_at, now()) >= now()
  );
$$;

CREATE OR REPLACE FUNCTION ntrio_business_count(p_user_id UUID DEFAULT auth.uid())
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER FROM business_members WHERE user_id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION ntrio_max_businesses(p_user_id UUID DEFAULT auth.uid())
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sp.max_businesses
  FROM user_subscriptions us
  INNER JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = p_user_id
  LIMIT 1;
$$;

-- New user: profile + 14-day trial
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')
  );

  INSERT INTO user_subscriptions (
    user_id,
    plan_id,
    status,
    trial_ends_at,
    current_period_end
  )
  VALUES (
    NEW.id,
    'starter',
    'trialing',
    now() + INTERVAL '14 days',
    now() + INTERVAL '14 days'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION handle_new_user();

-- Replace create_business with auth + limits + membership
CREATE OR REPLACE FUNCTION ntrio_create_business(
  p_name TEXT,
  p_currency TEXT DEFAULT 'USD'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id UUID;
  v_prefix TEXT;
  rec RECORD;
  v_ledger_id TEXT;
  v_count INTEGER;
  v_max INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT ntrio_has_active_subscription() THEN
    RAISE EXCEPTION 'Active subscription required';
  END IF;

  v_count := ntrio_business_count();
  v_max := COALESCE(ntrio_max_businesses(), 1);

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'Business limit reached for your plan (%). Upgrade to add more.', v_max;
  END IF;

  INSERT INTO businesses (name, currency)
  VALUES (p_name, p_currency)
  RETURNING id INTO v_business_id;

  INSERT INTO business_members (business_id, user_id, role)
  VALUES (v_business_id, auth.uid(), 'owner');

  v_prefix := 'biz.' || replace(v_business_id::text, '-', '');

  FOR rec IN
    SELECT *
    FROM (
      VALUES
        ('asset', 'cash', 'Cash', TRUE, TRUE, FALSE),
        ('asset', 'bank', 'Business Bank', FALSE, TRUE, FALSE),
        ('asset', 'ar', 'Accounts Receivable', FALSE, TRUE, FALSE),
        ('liability', 'ap', 'Accounts Payable', FALSE, FALSE, TRUE),
        ('liability', 'cc', 'Credit Card', FALSE, FALSE, TRUE),
        ('equity', 'equity', 'Owner Equity', FALSE, TRUE, TRUE),
        ('income', 'sales', 'Sales Revenue', FALSE, FALSE, TRUE),
        ('income', 'other_income', 'Other Income', FALSE, FALSE, TRUE),
        ('expense', 'cogs', 'Cost of Goods Sold', FALSE, TRUE, FALSE),
        ('expense', 'rent', 'Rent', FALSE, TRUE, FALSE),
        ('expense', 'utilities', 'Utilities', FALSE, TRUE, FALSE),
        ('expense', 'supplies', 'Supplies', FALSE, TRUE, FALSE),
        ('expense', 'payroll', 'Payroll', FALSE, TRUE, FALSE),
        ('expense', 'other_expense', 'Other Expenses', FALSE, TRUE, FALSE)
    ) AS t(category, code, display_name, is_primary, allow_negative, allow_positive)
  LOOP
    SELECT id INTO v_ledger_id
    FROM pgledger_create_account(
      v_prefix || '.' || rec.code,
      p_currency,
      rec.allow_negative,
      rec.allow_positive
    );

    INSERT INTO business_accounts (
      business_id,
      ledger_account_id,
      category,
      code,
      display_name,
      is_primary
    )
    VALUES (
      v_business_id,
      v_ledger_id,
      rec.category::account_category,
      rec.code,
      rec.display_name,
      rec.is_primary
    );
  END LOOP;

  RETURN v_business_id;
END;
$$;

-- Guard ledger RPCs with membership check
CREATE OR REPLACE FUNCTION ntrio_assert_business_access(p_business_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT ntrio_is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Access denied to business';
  END IF;

  IF NOT ntrio_has_active_subscription() THEN
    RAISE EXCEPTION 'Active subscription required';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION ntrio_record_income(
  p_business_id UUID,
  p_amount NUMERIC,
  p_description TEXT DEFAULT NULL,
  p_category TEXT DEFAULT 'sales',
  p_to_account_code TEXT DEFAULT 'cash',
  p_from_account_code TEXT DEFAULT 'sales',
  p_event_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF business_transactions_view
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from_id TEXT;
  v_to_id TEXT;
  v_transfer_id TEXT;
BEGIN
  PERFORM ntrio_assert_business_access(p_business_id);

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  v_from_id := ntrio_get_account_id(p_business_id, p_from_account_code);
  v_to_id := ntrio_get_account_id(p_business_id, p_to_account_code);

  SELECT id INTO v_transfer_id
  FROM pgledger_create_transfer(v_from_id, v_to_id, p_amount, p_event_at);

  INSERT INTO transaction_details (transfer_id, business_id, kind, category, description)
  VALUES (v_transfer_id, p_business_id, 'income', p_category, p_description);

  RETURN QUERY
  SELECT * FROM business_transactions_view WHERE id = v_transfer_id;
END;
$$;

CREATE OR REPLACE FUNCTION ntrio_record_expense(
  p_business_id UUID,
  p_amount NUMERIC,
  p_description TEXT DEFAULT NULL,
  p_category TEXT DEFAULT 'other_expense',
  p_from_account_code TEXT DEFAULT 'rent',
  p_to_account_code TEXT DEFAULT 'cash',
  p_event_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF business_transactions_view
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from_id TEXT;
  v_to_id TEXT;
  v_transfer_id TEXT;
BEGIN
  PERFORM ntrio_assert_business_access(p_business_id);

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  v_from_id := ntrio_get_account_id(p_business_id, p_to_account_code);
  v_to_id := ntrio_get_account_id(p_business_id, p_from_account_code);

  SELECT id INTO v_transfer_id
  FROM pgledger_create_transfer(v_from_id, v_to_id, p_amount, p_event_at);

  INSERT INTO transaction_details (transfer_id, business_id, kind, category, description)
  VALUES (v_transfer_id, p_business_id, 'expense', p_category, p_description);

  RETURN QUERY
  SELECT * FROM business_transactions_view WHERE id = v_transfer_id;
END;
$$;

CREATE OR REPLACE FUNCTION ntrio_record_transfer(
  p_business_id UUID,
  p_amount NUMERIC,
  p_from_account_code TEXT,
  p_to_account_code TEXT,
  p_description TEXT DEFAULT NULL,
  p_event_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF business_transactions_view
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from_id TEXT;
  v_to_id TEXT;
  v_transfer_id TEXT;
BEGIN
  PERFORM ntrio_assert_business_access(p_business_id);

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  v_from_id := ntrio_get_account_id(p_business_id, p_from_account_code);
  v_to_id := ntrio_get_account_id(p_business_id, p_to_account_code);

  SELECT id INTO v_transfer_id
  FROM pgledger_create_transfer(v_from_id, v_to_id, p_amount, p_event_at);

  INSERT INTO transaction_details (transfer_id, business_id, kind, description)
  VALUES (v_transfer_id, p_business_id, 'transfer', p_description);

  RETURN QUERY
  SELECT * FROM business_transactions_view WHERE id = v_transfer_id;
END;
$$;

-- Change plan (app / Stripe webhook can call this)
CREATE OR REPLACE FUNCTION ntrio_change_plan(p_plan_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM subscription_plans WHERE id = p_plan_id AND is_active) THEN
    RAISE EXCEPTION 'Invalid plan';
  END IF;

  UPDATE user_subscriptions
  SET
    plan_id = p_plan_id,
    status = 'active',
    current_period_end = now() + INTERVAL '30 days',
    updated_at = now()
  WHERE user_id = auth.uid();
END;
$$;

-- Drop permissive policies
DROP POLICY IF EXISTS businesses_all ON businesses;
DROP POLICY IF EXISTS business_accounts_all ON business_accounts;
DROP POLICY IF EXISTS transaction_details_all ON transaction_details;

-- RLS: businesses
CREATE POLICY businesses_select ON businesses
FOR SELECT
USING (id IN (SELECT ntrio_user_business_ids()));

CREATE POLICY businesses_insert ON businesses
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY businesses_update ON businesses
FOR UPDATE
USING (
  id IN (
    SELECT business_id FROM business_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

-- business_members
ALTER TABLE business_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY business_members_select ON business_members
FOR SELECT
USING (user_id = auth.uid() OR business_id IN (SELECT ntrio_user_business_ids()));

CREATE POLICY business_members_insert ON business_members
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  OR business_id IN (
    SELECT business_id FROM business_members
    WHERE user_id = auth.uid() AND role = 'owner'
  )
);

-- business_accounts
CREATE POLICY business_accounts_select ON business_accounts
FOR SELECT
USING (business_id IN (SELECT ntrio_user_business_ids()));

CREATE POLICY business_accounts_all_write ON business_accounts
FOR ALL
USING (business_id IN (SELECT ntrio_user_business_ids()))
WITH CHECK (business_id IN (SELECT ntrio_user_business_ids()));

-- transaction_details
CREATE POLICY transaction_details_select ON transaction_details
FOR SELECT
USING (business_id IN (SELECT ntrio_user_business_ids()));

CREATE POLICY transaction_details_insert ON transaction_details
FOR INSERT
WITH CHECK (business_id IN (SELECT ntrio_user_business_ids()));

-- profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select ON profiles
FOR SELECT
USING (id = auth.uid());

CREATE POLICY profiles_update ON profiles
FOR UPDATE
USING (id = auth.uid());

-- subscriptions
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_subscriptions_select ON user_subscriptions
FOR SELECT
USING (user_id = auth.uid());

ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY subscription_plans_select ON subscription_plans
FOR SELECT
USING (is_active = TRUE);

-- pgledger: restrict via linked business accounts
ALTER TABLE pgledger_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pgledger_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE pgledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY pgledger_accounts_select ON pgledger_accounts
FOR SELECT
USING (
  id IN (
    SELECT ledger_account_id FROM business_accounts
    WHERE business_id IN (SELECT ntrio_user_business_ids())
  )
);

CREATE POLICY pgledger_transfers_select ON pgledger_transfers
FOR SELECT
USING (
  from_account_id IN (
    SELECT ledger_account_id FROM business_accounts
    WHERE business_id IN (SELECT ntrio_user_business_ids())
  )
);

CREATE POLICY pgledger_entries_select ON pgledger_entries
FOR SELECT
USING (
  account_id IN (
    SELECT ledger_account_id FROM business_accounts
    WHERE business_id IN (SELECT ntrio_user_business_ids())
  )
);

-- Revoke anon access to app data
REVOKE ALL ON businesses FROM anon;
REVOKE ALL ON business_accounts FROM anon;
REVOKE ALL ON transaction_details FROM anon;
REVOKE ALL ON business_members FROM anon;
REVOKE ALL ON profiles FROM anon;
REVOKE ALL ON user_subscriptions FROM anon;

REVOKE SELECT ON business_transactions_view FROM anon;
REVOKE SELECT ON business_accounts_view FROM anon;
REVOKE SELECT ON business_summary_view FROM anon;
REVOKE SELECT ON my_businesses_view FROM anon;
REVOKE SELECT ON my_subscription_view FROM anon;

REVOKE EXECUTE ON FUNCTION ntrio_create_business FROM anon;
REVOKE EXECUTE ON FUNCTION ntrio_record_income FROM anon;
REVOKE EXECUTE ON FUNCTION ntrio_record_expense FROM anon;
REVOKE EXECUTE ON FUNCTION ntrio_record_transfer FROM anon;
REVOKE EXECUTE ON FUNCTION ntrio_change_plan FROM anon;

GRANT SELECT ON my_businesses_view TO authenticated;
GRANT SELECT ON my_subscription_view TO authenticated;
GRANT SELECT ON subscription_plans TO authenticated;
GRANT SELECT, UPDATE ON profiles TO authenticated;
GRANT SELECT ON user_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON businesses TO authenticated;
GRANT SELECT, INSERT ON business_members TO authenticated;
GRANT SELECT ON business_accounts TO authenticated;
GRANT SELECT ON transaction_details TO authenticated;
GRANT SELECT ON business_transactions_view TO authenticated;
GRANT SELECT ON business_accounts_view TO authenticated;
GRANT SELECT ON business_summary_view TO authenticated;
GRANT SELECT ON pgledger_accounts_view TO authenticated;
GRANT SELECT ON pgledger_entries_view TO authenticated;
GRANT SELECT ON pgledger_transfers_view TO authenticated;

GRANT EXECUTE ON FUNCTION ntrio_create_business TO authenticated;
GRANT EXECUTE ON FUNCTION ntrio_record_income TO authenticated;
GRANT EXECUTE ON FUNCTION ntrio_record_expense TO authenticated;
GRANT EXECUTE ON FUNCTION ntrio_record_transfer TO authenticated;
GRANT EXECUTE ON FUNCTION ntrio_change_plan TO authenticated;
