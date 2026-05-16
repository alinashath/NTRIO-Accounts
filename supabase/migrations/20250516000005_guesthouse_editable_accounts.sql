-- Maldives guest house defaults + editable accounts & transaction types
-- Idempotent: safe to re-run after partial failures (drops views before recreate)

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

ALTER TABLE business_accounts
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE business_accounts
ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS transaction_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  kind transaction_kind NOT NULL CHECK (kind IN ('income', 'expense')),
  name TEXT NOT NULL,
  account_code TEXT NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, kind, name),
  CHECK (kind IN ('income', 'expense'))
);

CREATE INDEX IF NOT EXISTS transaction_categories_business_idx
ON transaction_categories (business_id, kind, sort_order);

-- ---------------------------------------------------------------------------
-- Views (must DROP first — CREATE OR REPLACE cannot add/reorder columns)
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS business_summary_view;
DROP VIEW IF EXISTS transaction_categories_view;
DROP VIEW IF EXISTS business_accounts_view;

CREATE VIEW business_accounts_view AS
SELECT
  ba.id,
  ba.business_id,
  ba.ledger_account_id,
  ba.category,
  ba.code,
  ba.display_name,
  ba.description,
  ba.is_primary,
  ba.is_active,
  ba.sort_order,
  la.name AS ledger_name,
  la.balance,
  la.currency,
  la.version,
  la.updated_at
FROM business_accounts ba
INNER JOIN pgledger_accounts_view la ON ba.ledger_account_id = la.id;

CREATE VIEW business_summary_view AS
SELECT
  b.id AS business_id,
  b.name,
  b.currency,
  COALESCE(SUM(ba.balance) FILTER (WHERE ba.category = 'asset'), 0) AS total_assets,
  COALESCE(SUM(ba.balance) FILTER (WHERE ba.category = 'liability'), 0) AS total_liabilities,
  COALESCE(SUM(ba.balance) FILTER (WHERE ba.category = 'income'), 0) AS total_income,
  COALESCE(SUM(ba.balance) FILTER (WHERE ba.category = 'expense'), 0) AS total_expenses,
  COALESCE(SUM(ba.balance) FILTER (WHERE ba.category = 'asset' AND ba.is_primary), 0) AS cash_balance
FROM businesses b
LEFT JOIN business_accounts_view ba
  ON b.id = ba.business_id AND ba.is_active = TRUE
GROUP BY b.id, b.name, b.currency;

CREATE VIEW transaction_categories_view AS
SELECT
  tc.id,
  tc.business_id,
  tc.kind,
  tc.name,
  tc.account_code,
  ba.display_name AS account_name,
  tc.is_system,
  tc.is_active,
  tc.sort_order
FROM transaction_categories tc
LEFT JOIN business_accounts ba
  ON tc.business_id = ba.business_id AND tc.account_code = ba.code;

-- ---------------------------------------------------------------------------
-- Helpers & seed (Maldives small guest house, default currency MVR)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION ntrio_insert_account(
  p_business_id UUID,
  p_prefix TEXT,
  p_currency TEXT,
  p_category account_category,
  p_code TEXT,
  p_display_name TEXT,
  p_is_primary BOOLEAN,
  p_allow_negative BOOLEAN,
  p_allow_positive BOOLEAN,
  p_sort_order INTEGER DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ledger_id TEXT;
BEGIN
  SELECT id INTO v_ledger_id
  FROM pgledger_create_account(
    p_prefix || '.' || p_code,
    p_currency,
    p_allow_negative,
    p_allow_positive
  );

  INSERT INTO business_accounts (
    business_id,
    ledger_account_id,
    category,
    code,
    display_name,
    is_primary,
    sort_order
  )
  VALUES (
    p_business_id,
    v_ledger_id,
    p_category,
    p_code,
    p_display_name,
    p_is_primary,
    p_sort_order
  );
END;
$$;

CREATE OR REPLACE FUNCTION ntrio_seed_guesthouse(
  p_business_id UUID,
  p_prefix TEXT,
  p_currency TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Assets
  PERFORM ntrio_insert_account(p_business_id, p_prefix, p_currency, 'asset', 'cash', 'Cash on Hand', TRUE, TRUE, FALSE, 1);
  PERFORM ntrio_insert_account(p_business_id, p_prefix, p_currency, 'asset', 'bank', 'Bank Account', FALSE, TRUE, FALSE, 2);
  PERFORM ntrio_insert_account(p_business_id, p_prefix, p_currency, 'asset', 'guest_receivables', 'Guest Receivables', FALSE, TRUE, FALSE, 3);
  PERFORM ntrio_insert_account(p_business_id, p_prefix, p_currency, 'asset', 'prepaid', 'Prepaid Expenses', FALSE, TRUE, FALSE, 4);

  -- Liabilities
  PERFORM ntrio_insert_account(p_business_id, p_prefix, p_currency, 'liability', 'ap', 'Accounts Payable', FALSE, FALSE, TRUE, 10);
  PERFORM ntrio_insert_account(p_business_id, p_prefix, p_currency, 'liability', 'tourism_tax', 'Tourism Tax Payable (TGST)', FALSE, FALSE, TRUE, 11);
  PERFORM ntrio_insert_account(p_business_id, p_prefix, p_currency, 'liability', 'staff_payable', 'Staff Wages Payable', FALSE, FALSE, TRUE, 12);

  -- Equity
  PERFORM ntrio_insert_account(p_business_id, p_prefix, p_currency, 'equity', 'owner_equity', 'Owner Equity', FALSE, TRUE, TRUE, 20);

  -- Income
  PERFORM ntrio_insert_account(p_business_id, p_prefix, p_currency, 'income', 'room_revenue', 'Room Revenue', FALSE, FALSE, TRUE, 30);
  PERFORM ntrio_insert_account(p_business_id, p_prefix, p_currency, 'income', 'meal_revenue', 'Meal & Beverage Revenue', FALSE, FALSE, TRUE, 31);
  PERFORM ntrio_insert_account(p_business_id, p_prefix, p_currency, 'income', 'excursion_revenue', 'Excursions & Activities', FALSE, FALSE, TRUE, 32);
  PERFORM ntrio_insert_account(p_business_id, p_prefix, p_currency, 'income', 'laundry_revenue', 'Laundry & Extras', FALSE, FALSE, TRUE, 33);
  PERFORM ntrio_insert_account(p_business_id, p_prefix, p_currency, 'income', 'other_income', 'Other Income', FALSE, FALSE, TRUE, 34);

  -- Expenses
  PERFORM ntrio_insert_account(p_business_id, p_prefix, p_currency, 'expense', 'housekeeping', 'Housekeeping & Cleaning', FALSE, TRUE, FALSE, 40);
  PERFORM ntrio_insert_account(p_business_id, p_prefix, p_currency, 'expense', 'food_supplies', 'Food & Kitchen Supplies', FALSE, TRUE, FALSE, 41);
  PERFORM ntrio_insert_account(p_business_id, p_prefix, p_currency, 'expense', 'utilities', 'Electricity & Water', FALSE, TRUE, FALSE, 42);
  PERFORM ntrio_insert_account(p_business_id, p_prefix, p_currency, 'expense', 'staff_wages', 'Staff Wages', FALSE, TRUE, FALSE, 43);
  PERFORM ntrio_insert_account(p_business_id, p_prefix, p_currency, 'expense', 'maintenance', 'Maintenance & Repairs', FALSE, TRUE, FALSE, 44);
  PERFORM ntrio_insert_account(p_business_id, p_prefix, p_currency, 'expense', 'guest_amenities', 'Guest Amenities & Toiletries', FALSE, TRUE, FALSE, 45);
  PERFORM ntrio_insert_account(p_business_id, p_prefix, p_currency, 'expense', 'transport', 'Boat & Transfer Costs', FALSE, TRUE, FALSE, 46);
  PERFORM ntrio_insert_account(p_business_id, p_prefix, p_currency, 'expense', 'marketing', 'Marketing & OTA Commissions', FALSE, TRUE, FALSE, 47);
  PERFORM ntrio_insert_account(p_business_id, p_prefix, p_currency, 'expense', 'licensing', 'Licenses & Government Fees', FALSE, TRUE, FALSE, 48);
  PERFORM ntrio_insert_account(p_business_id, p_prefix, p_currency, 'expense', 'bank_charges', 'Bank Charges', FALSE, TRUE, FALSE, 49);
  PERFORM ntrio_insert_account(p_business_id, p_prefix, p_currency, 'expense', 'misc_expense', 'Miscellaneous Expenses', FALSE, TRUE, FALSE, 50);

  -- Income types
  INSERT INTO transaction_categories (business_id, kind, name, account_code, is_system, sort_order)
  VALUES
    (p_business_id, 'income', 'Room booking', 'room_revenue', TRUE, 1),
    (p_business_id, 'income', 'Meals & beverages', 'meal_revenue', TRUE, 2),
    (p_business_id, 'income', 'Excursion / activity', 'excursion_revenue', TRUE, 3),
    (p_business_id, 'income', 'Laundry & extras', 'laundry_revenue', TRUE, 4),
    (p_business_id, 'income', 'Other income', 'other_income', TRUE, 5)
  ON CONFLICT (business_id, kind, name) DO NOTHING;

  -- Expense types
  INSERT INTO transaction_categories (business_id, kind, name, account_code, is_system, sort_order)
  VALUES
    (p_business_id, 'expense', 'Housekeeping', 'housekeeping', TRUE, 1),
    (p_business_id, 'expense', 'Food & kitchen', 'food_supplies', TRUE, 2),
    (p_business_id, 'expense', 'Electricity & water', 'utilities', TRUE, 3),
    (p_business_id, 'expense', 'Staff wages', 'staff_wages', TRUE, 4),
    (p_business_id, 'expense', 'Maintenance', 'maintenance', TRUE, 5),
    (p_business_id, 'expense', 'Guest amenities', 'guest_amenities', TRUE, 6),
    (p_business_id, 'expense', 'Boat / transfer', 'transport', TRUE, 7),
    (p_business_id, 'expense', 'Marketing & OTA fees', 'marketing', TRUE, 8),
    (p_business_id, 'expense', 'Licenses & fees', 'licensing', TRUE, 9),
    (p_business_id, 'expense', 'Bank charges', 'bank_charges', TRUE, 10),
    (p_business_id, 'expense', 'Miscellaneous', 'misc_expense', TRUE, 11)
  ON CONFLICT (business_id, kind, name) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION ntrio_create_business(
  p_name TEXT,
  p_currency TEXT DEFAULT 'MVR'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id UUID;
  v_prefix TEXT;
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
  PERFORM ntrio_seed_guesthouse(v_business_id, v_prefix, p_currency);

  RETURN v_business_id;
END;
$$;

CREATE OR REPLACE FUNCTION ntrio_get_account_id(
  p_business_id UUID,
  p_code TEXT
)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ledger_account_id
  FROM business_accounts
  WHERE business_id = p_business_id AND code = p_code AND is_active = TRUE;
$$;

CREATE OR REPLACE FUNCTION ntrio_make_account_code(p_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(both '_' from regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '_', 'g'));
$$;

CREATE OR REPLACE FUNCTION ntrio_add_account(
  p_business_id UUID,
  p_category account_category,
  p_display_name TEXT,
  p_code TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
  v_prefix TEXT;
  v_currency TEXT;
  v_ledger_id TEXT;
  v_id UUID;
  v_allow_neg BOOLEAN;
  v_allow_pos BOOLEAN;
BEGIN
  PERFORM ntrio_assert_business_access(p_business_id);

  SELECT currency INTO v_currency FROM businesses WHERE id = p_business_id;
  v_prefix := 'biz.' || replace(p_business_id::text, '-', '');
  v_code := COALESCE(NULLIF(trim(p_code), ''), ntrio_make_account_code(p_display_name));

  IF EXISTS (
    SELECT 1 FROM business_accounts
    WHERE business_id = p_business_id AND code = v_code
  ) THEN
    RAISE EXCEPTION 'Account code already exists: %', v_code;
  END IF;

  v_allow_neg := p_category IN ('asset', 'expense', 'equity');
  v_allow_pos := p_category IN ('asset', 'income', 'liability', 'equity');

  SELECT id INTO v_ledger_id
  FROM pgledger_create_account(
    v_prefix || '.' || v_code,
    v_currency,
    v_allow_neg,
    v_allow_pos
  );

  INSERT INTO business_accounts (
    business_id,
    ledger_account_id,
    category,
    code,
    display_name,
    description
  )
  VALUES (
    p_business_id,
    v_ledger_id,
    p_category,
    v_code,
    p_display_name,
    p_description
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION ntrio_update_account(
  p_account_id UUID,
  p_display_name TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_is_primary BOOLEAN DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT NULL,
  p_sort_order INTEGER DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id UUID;
BEGIN
  SELECT business_id INTO v_business_id
  FROM business_accounts WHERE id = p_account_id;

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Account not found';
  END IF;

  PERFORM ntrio_assert_business_access(v_business_id);

  IF p_is_primary IS TRUE THEN
    UPDATE business_accounts
    SET is_primary = FALSE
    WHERE business_id = v_business_id AND category = 'asset';
  END IF;

  UPDATE business_accounts
  SET
    display_name = COALESCE(p_display_name, display_name),
    description = COALESCE(p_description, description),
    is_primary = COALESCE(p_is_primary, is_primary),
    is_active = COALESCE(p_is_active, is_active),
    sort_order = COALESCE(p_sort_order, sort_order)
  WHERE id = p_account_id;
END;
$$;

CREATE OR REPLACE FUNCTION ntrio_add_transaction_category(
  p_business_id UUID,
  p_kind transaction_kind,
  p_name TEXT,
  p_account_code TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  PERFORM ntrio_assert_business_access(p_business_id);

  IF p_kind NOT IN ('income', 'expense') THEN
    RAISE EXCEPTION 'Category kind must be income or expense';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM business_accounts
    WHERE business_id = p_business_id AND code = p_account_code AND is_active
  ) THEN
    RAISE EXCEPTION 'Linked account not found: %', p_account_code;
  END IF;

  INSERT INTO transaction_categories (business_id, kind, name, account_code)
  VALUES (p_business_id, p_kind, p_name, p_account_code)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION ntrio_update_transaction_category(
  p_category_id UUID,
  p_name TEXT DEFAULT NULL,
  p_account_code TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT NULL,
  p_sort_order INTEGER DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id UUID;
BEGIN
  SELECT business_id INTO v_business_id
  FROM transaction_categories WHERE id = p_category_id;

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Category not found';
  END IF;

  PERFORM ntrio_assert_business_access(v_business_id);

  IF p_account_code IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM business_accounts
    WHERE business_id = v_business_id AND code = p_account_code AND is_active
  ) THEN
    RAISE EXCEPTION 'Linked account not found: %', p_account_code;
  END IF;

  UPDATE transaction_categories
  SET
    name = COALESCE(p_name, name),
    account_code = COALESCE(p_account_code, account_code),
    is_active = COALESCE(p_is_active, is_active),
    sort_order = COALESCE(p_sort_order, sort_order),
    updated_at = now()
  WHERE id = p_category_id;
END;
$$;

CREATE OR REPLACE FUNCTION ntrio_record_income(
  p_business_id UUID,
  p_amount NUMERIC,
  p_description TEXT DEFAULT NULL,
  p_category TEXT DEFAULT 'Room booking',
  p_to_account_code TEXT DEFAULT 'cash',
  p_from_account_code TEXT DEFAULT 'room_revenue',
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
  v_from_code TEXT;
BEGIN
  PERFORM ntrio_assert_business_access(p_business_id);

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  SELECT account_code INTO v_from_code
  FROM transaction_categories
  WHERE business_id = p_business_id AND kind = 'income'
    AND (name = p_category OR account_code = p_category) AND is_active
  LIMIT 1;

  v_from_code := COALESCE(v_from_code, p_from_account_code, 'room_revenue');
  v_from_id := ntrio_get_account_id(p_business_id, v_from_code);
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
  p_category TEXT DEFAULT NULL,
  p_from_account_code TEXT DEFAULT 'misc_expense',
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
  v_expense_code TEXT;
BEGIN
  PERFORM ntrio_assert_business_access(p_business_id);

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  IF p_category IS NOT NULL THEN
    SELECT account_code INTO v_expense_code
    FROM transaction_categories
    WHERE business_id = p_business_id AND kind = 'expense'
      AND (name = p_category OR account_code = p_category) AND is_active
    LIMIT 1;
  END IF;

  v_expense_code := COALESCE(v_expense_code, p_from_account_code, 'misc_expense');
  v_from_id := ntrio_get_account_id(p_business_id, p_to_account_code);
  v_to_id := ntrio_get_account_id(p_business_id, v_expense_code);

  SELECT id INTO v_transfer_id
  FROM pgledger_create_transfer(v_from_id, v_to_id, p_amount, p_event_at);

  INSERT INTO transaction_details (transfer_id, business_id, kind, category, description)
  VALUES (v_transfer_id, p_business_id, 'expense', p_category, p_description);

  RETURN QUERY
  SELECT * FROM business_transactions_view WHERE id = v_transfer_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS & grants
-- ---------------------------------------------------------------------------

ALTER TABLE transaction_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transaction_categories_select ON transaction_categories;
DROP POLICY IF EXISTS transaction_categories_insert ON transaction_categories;
DROP POLICY IF EXISTS transaction_categories_update ON transaction_categories;

CREATE POLICY transaction_categories_select ON transaction_categories
FOR SELECT
USING (business_id IN (SELECT ntrio_user_business_ids()));

CREATE POLICY transaction_categories_insert ON transaction_categories
FOR INSERT
WITH CHECK (business_id IN (SELECT ntrio_user_business_ids()));

CREATE POLICY transaction_categories_update ON transaction_categories
FOR UPDATE
USING (business_id IN (SELECT ntrio_user_business_ids()));

GRANT SELECT ON business_accounts_view TO authenticated;
GRANT SELECT ON business_summary_view TO authenticated;
GRANT SELECT ON transaction_categories_view TO authenticated;
GRANT SELECT, INSERT, UPDATE ON transaction_categories TO authenticated;
GRANT UPDATE ON business_accounts TO authenticated;

GRANT EXECUTE ON FUNCTION ntrio_add_account TO authenticated;
GRANT EXECUTE ON FUNCTION ntrio_update_account TO authenticated;
GRANT EXECUTE ON FUNCTION ntrio_add_transaction_category TO authenticated;
GRANT EXECUTE ON FUNCTION ntrio_update_transaction_category TO authenticated;
