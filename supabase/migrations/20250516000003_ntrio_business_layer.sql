-- NTRIO small-business layer on top of pgledger
-- https://github.com/pgr0ss/pgledger

CREATE TYPE account_category AS ENUM (
  'asset',
  'liability',
  'equity',
  'income',
  'expense'
);

CREATE TYPE transaction_kind AS ENUM (
  'income',
  'expense',
  'transfer'
);

CREATE TABLE businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE business_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  ledger_account_id TEXT NOT NULL REFERENCES pgledger_accounts (id) ON DELETE RESTRICT,
  category account_category NOT NULL,
  code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, code),
  UNIQUE (ledger_account_id)
);

CREATE INDEX business_accounts_business_id_idx ON business_accounts (business_id);
CREATE INDEX business_accounts_category_idx ON business_accounts (business_id, category);

CREATE TABLE transaction_details (
  transfer_id TEXT PRIMARY KEY REFERENCES pgledger_transfers (id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  kind transaction_kind NOT NULL,
  category TEXT,
  description TEXT,
  reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX transaction_details_business_id_idx ON transaction_details (business_id, created_at DESC);

-- Friendly view joining ledger + business metadata
CREATE VIEW business_transactions_view AS
SELECT
  td.transfer_id AS id,
  td.business_id,
  td.kind,
  td.category,
  td.description,
  td.reference,
  t.amount,
  t.event_at,
  t.created_at,
  fa.display_name AS from_account_name,
  fa.category AS from_category,
  ta.display_name AS to_account_name,
  ta.category AS to_category,
  a.currency
FROM transaction_details td
INNER JOIN pgledger_transfers t ON td.transfer_id = t.id
INNER JOIN business_accounts fa ON t.from_account_id = fa.ledger_account_id
INNER JOIN business_accounts ta ON t.to_account_id = ta.ledger_account_id
INNER JOIN businesses b ON td.business_id = b.id
INNER JOIN pgledger_accounts a ON t.from_account_id = a.id;

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
LEFT JOIN business_accounts_view ba ON b.id = ba.business_id
GROUP BY b.id, b.name, b.currency;

-- Create business with standard chart of accounts (pgledger naming: biz.{code})
CREATE OR REPLACE FUNCTION ntrio_create_business(
  p_name TEXT,
  p_currency TEXT DEFAULT 'USD'
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_business_id UUID;
  v_prefix TEXT;
  rec RECORD;
  v_ledger_id TEXT;
BEGIN
  INSERT INTO businesses (name, currency)
  VALUES (p_name, p_currency)
  RETURNING id INTO v_business_id;

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

CREATE OR REPLACE FUNCTION ntrio_get_account_id(
  p_business_id UUID,
  p_code TEXT
)
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT ledger_account_id
  FROM business_accounts
  WHERE business_id = p_business_id AND code = p_code;
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
AS $$
DECLARE
  v_from_id TEXT;
  v_to_id TEXT;
  v_transfer_id TEXT;
BEGIN
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
AS $$
DECLARE
  v_from_id TEXT;
  v_to_id TEXT;
  v_transfer_id TEXT;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  -- Expense: debit expense, credit cash (from cash to expense account)
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
AS $$
DECLARE
  v_from_id TEXT;
  v_to_id TEXT;
  v_transfer_id TEXT;
BEGIN
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

-- RLS (permissive for MVP; tighten with auth.uid() when adding Supabase Auth)
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY businesses_all ON businesses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY business_accounts_all ON business_accounts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY transaction_details_all ON transaction_details FOR ALL USING (true) WITH CHECK (true);

GRANT SELECT ON business_transactions_view TO anon, authenticated;
GRANT SELECT ON business_accounts_view TO anon, authenticated;
GRANT SELECT ON business_summary_view TO anon, authenticated;
GRANT SELECT ON pgledger_accounts_view TO anon, authenticated;
GRANT SELECT ON pgledger_entries_view TO anon, authenticated;
GRANT SELECT ON pgledger_transfers_view TO anon, authenticated;

GRANT ALL ON businesses TO anon, authenticated;
GRANT ALL ON business_accounts TO anon, authenticated;
GRANT ALL ON transaction_details TO anon, authenticated;

GRANT EXECUTE ON FUNCTION ntrio_create_business TO anon, authenticated;
GRANT EXECUTE ON FUNCTION ntrio_record_income TO anon, authenticated;
GRANT EXECUTE ON FUNCTION ntrio_record_expense TO anon, authenticated;
GRANT EXECUTE ON FUNCTION ntrio_record_transfer TO anon, authenticated;
