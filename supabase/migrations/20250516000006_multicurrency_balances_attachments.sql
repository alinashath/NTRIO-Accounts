-- Per-account currency, opening balances, FX transfers, attachments, balance sheet views

ALTER TABLE business_accounts
ADD COLUMN IF NOT EXISTS account_currency TEXT;

UPDATE business_accounts ba
SET account_currency = b.currency
FROM businesses b
WHERE ba.business_id = b.id AND ba.account_currency IS NULL;

ALTER TABLE business_accounts
ALTER COLUMN account_currency SET NOT NULL;

-- Default from business on insert handled in functions

ALTER TABLE transaction_details
ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC,
ADD COLUMN IF NOT EXISTS from_currency TEXT,
ADD COLUMN IF NOT EXISTS to_currency TEXT,
ADD COLUMN IF NOT EXISTS amount_from NUMERIC,
ADD COLUMN IF NOT EXISTS amount_to NUMERIC;

CREATE TABLE IF NOT EXISTS transaction_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id TEXT NOT NULL REFERENCES pgledger_transfers (id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name TEXT,
  content_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transaction_attachments_transfer_idx
ON transaction_attachments (transfer_id);

-- Recreate accounts view with account_currency
DROP VIEW IF EXISTS business_summary_view;
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
  ba.account_currency,
  la.name AS ledger_name,
  la.balance,
  la.currency AS ledger_currency,
  COALESCE(ba.account_currency, la.currency) AS currency,
  la.version,
  la.updated_at
FROM business_accounts ba
INNER JOIN pgledger_accounts_view la ON ba.ledger_account_id = la.id;

CREATE VIEW business_summary_view AS
SELECT
  b.id AS business_id,
  b.name,
  b.currency AS base_currency,
  COALESCE(SUM(ba.balance) FILTER (WHERE ba.category = 'asset'), 0) AS total_assets,
  COALESCE(SUM(ba.balance) FILTER (WHERE ba.category = 'liability'), 0) AS total_liabilities,
  COALESCE(SUM(ba.balance) FILTER (WHERE ba.category = 'income'), 0) AS total_income,
  COALESCE(SUM(ba.balance) FILTER (WHERE ba.category = 'expense'), 0) AS total_expenses,
  COALESCE(SUM(ba.balance) FILTER (WHERE ba.category = 'asset' AND ba.is_primary), 0) AS cash_balance
FROM businesses b
LEFT JOIN business_accounts_view ba
  ON b.id = ba.business_id AND ba.is_active = TRUE
GROUP BY b.id, b.name, b.currency;

-- Balance sheet snapshot (current)
CREATE VIEW balance_sheet_view AS
SELECT
  ba.business_id,
  ba.id AS account_id,
  ba.category,
  ba.code,
  ba.display_name,
  ba.account_currency AS currency,
  ba.balance,
  ba.is_primary
FROM business_accounts_view ba
WHERE ba.is_active = TRUE
ORDER BY ba.category, ba.sort_order, ba.display_name;

-- Period P&L from transaction details
CREATE VIEW period_pl_summary_view AS
SELECT
  td.business_id,
  date_trunc('day', t.event_at) AS period_day,
  date_trunc('month', t.event_at) AS period_month,
  date_trunc('quarter', t.event_at) AS period_quarter,
  td.kind,
  td.category,
  SUM(t.amount) AS total_amount,
  COUNT(*) AS transaction_count
FROM transaction_details td
INNER JOIN pgledger_transfers t ON td.transfer_id = t.id
GROUP BY td.business_id, period_day, period_month, period_quarter, td.kind, td.category;

-- Ensure FX liquidity account exists for a currency
CREATE OR REPLACE FUNCTION ntrio_ensure_fx_liquidity(
  p_business_id UUID,
  p_currency TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
  v_prefix TEXT;
  v_ledger_id TEXT;
BEGIN
  v_code := 'fx_liquidity_' || lower(p_currency);
  SELECT ledger_account_id INTO v_ledger_id
  FROM business_accounts
  WHERE business_id = p_business_id AND code = v_code;

  IF v_ledger_id IS NOT NULL THEN
    RETURN v_ledger_id;
  END IF;

  v_prefix := 'biz.' || replace(p_business_id::text, '-', '');
  SELECT id INTO v_ledger_id
  FROM pgledger_create_account(
    v_prefix || '.' || v_code,
    p_currency,
    TRUE,
    TRUE
  );

  INSERT INTO business_accounts (
    business_id, ledger_account_id, category, code, display_name,
    account_currency, is_primary, sort_order
  )
  VALUES (
    p_business_id, v_ledger_id, 'asset', v_code,
    'FX Liquidity (' || p_currency || ')',
    p_currency, FALSE, 999
  );

  RETURN v_ledger_id;
END;
$$;

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
  p_sort_order INTEGER DEFAULT 0,
  p_initial_balance NUMERIC DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ledger_id TEXT;
  v_account_id UUID;
BEGIN
  SELECT id INTO v_ledger_id
  FROM pgledger_create_account(
    p_prefix || '.' || p_code,
    p_currency,
    p_allow_negative,
    p_allow_positive
  );

  INSERT INTO business_accounts (
    business_id, ledger_account_id, category, code, display_name,
    is_primary, sort_order, account_currency
  )
  VALUES (
    p_business_id, v_ledger_id, p_category, p_code, p_display_name,
    p_is_primary, p_sort_order, p_currency
  )
  RETURNING id INTO v_account_id;

  IF p_initial_balance IS NOT NULL AND p_initial_balance > 0 AND p_category = 'asset' THEN
    PERFORM ntrio_set_opening_balance(v_account_id, p_initial_balance);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION ntrio_set_opening_balance(
  p_account_id UUID,
  p_amount NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id UUID;
  v_code TEXT;
  v_category account_category;
  v_from TEXT;
  v_to TEXT;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Opening balance must be positive';
  END IF;

  SELECT business_id, code, category INTO v_business_id, v_code, v_category
  FROM business_accounts WHERE id = p_account_id;

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Account not found';
  END IF;

  PERFORM ntrio_assert_business_access(v_business_id);

  IF v_category <> 'asset' THEN
    RAISE EXCEPTION 'Opening balance only supported for asset accounts';
  END IF;

  v_from := ntrio_get_account_id(v_business_id, 'owner_equity');
  v_to := ntrio_get_account_id(v_business_id, v_code);

  PERFORM ntrio_create_opening_transfer(v_business_id, v_from, v_to, p_amount, 'Opening balance');
END;
$$;

CREATE OR REPLACE FUNCTION ntrio_create_opening_transfer(
  p_business_id UUID,
  p_from_account_id TEXT,
  p_to_account_id TEXT,
  p_amount NUMERIC,
  p_description TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer_id TEXT;
BEGIN
  SELECT id INTO v_transfer_id
  FROM pgledger_create_transfer(p_from_account_id, p_to_account_id, p_amount);

  INSERT INTO transaction_details (transfer_id, business_id, kind, category, description)
  VALUES (v_transfer_id, p_business_id, 'transfer', 'opening_balance', p_description);

  RETURN v_transfer_id;
END;
$$;

CREATE OR REPLACE FUNCTION ntrio_add_account(
  p_business_id UUID,
  p_category account_category,
  p_display_name TEXT,
  p_code TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_currency TEXT DEFAULT NULL,
  p_initial_balance NUMERIC DEFAULT 0
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

  SELECT COALESCE(NULLIF(trim(p_currency), ''), currency) INTO v_currency
  FROM businesses WHERE id = p_business_id;

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
    business_id, ledger_account_id, category, code, display_name,
    description, account_currency
  )
  VALUES (
    p_business_id, v_ledger_id, p_category, v_code, p_display_name,
    p_description, v_currency
  )
  RETURNING id INTO v_id;

  IF COALESCE(p_initial_balance, 0) > 0 AND p_category = 'asset' THEN
    PERFORM ntrio_set_opening_balance(v_id, p_initial_balance);
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION ntrio_record_transfer(
  p_business_id UUID,
  p_amount NUMERIC,
  p_from_account_code TEXT,
  p_to_account_code TEXT,
  p_description TEXT DEFAULT NULL,
  p_event_at TIMESTAMPTZ DEFAULT NULL,
  p_exchange_rate NUMERIC DEFAULT NULL
)
RETURNS SETOF business_transactions_view
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from_id TEXT;
  v_to_id TEXT;
  v_from_cur TEXT;
  v_to_cur TEXT;
  v_transfer_id TEXT;
  v_liq_from TEXT;
  v_liq_to TEXT;
  v_amount_to NUMERIC;
BEGIN
  PERFORM ntrio_assert_business_access(p_business_id);

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  v_from_id := ntrio_get_account_id(p_business_id, p_from_account_code);
  v_to_id := ntrio_get_account_id(p_business_id, p_to_account_code);

  SELECT account_currency INTO v_from_cur FROM business_accounts WHERE ledger_account_id = v_from_id;
  SELECT account_currency INTO v_to_cur FROM business_accounts WHERE ledger_account_id = v_to_id;

  IF v_from_cur = v_to_cur THEN
    SELECT id INTO v_transfer_id
    FROM pgledger_create_transfer(v_from_id, v_to_id, p_amount, p_event_at);

    INSERT INTO transaction_details (
      transfer_id, business_id, kind, description,
      from_currency, to_currency, amount_from, amount_to
    )
    VALUES (
      v_transfer_id, p_business_id, 'transfer', p_description,
      v_from_cur, v_to_cur, p_amount, p_amount
    );
  ELSE
    IF p_exchange_rate IS NULL OR p_exchange_rate <= 0 THEN
      RAISE EXCEPTION 'Exchange rate required between % and %', v_from_cur, v_to_cur;
    END IF;

    v_amount_to := round(p_amount * p_exchange_rate, 2);
    v_liq_from := ntrio_ensure_fx_liquidity(p_business_id, v_from_cur);
    v_liq_to := ntrio_ensure_fx_liquidity(p_business_id, v_to_cur);

    SELECT (array_agg(x.id ORDER BY x.id))[1] INTO v_transfer_id
    FROM pgledger_create_transfers(
      transfer_requests => ARRAY[
        (v_from_id, v_liq_from, p_amount)::transfer_request,
        (v_liq_to, v_to_id, v_amount_to)::transfer_request
      ],
      event_at => p_event_at
    ) x;

    INSERT INTO transaction_details (
      transfer_id, business_id, kind, description,
      exchange_rate, from_currency, to_currency, amount_from, amount_to
    )
    VALUES (
      v_transfer_id, p_business_id, 'transfer', p_description,
      p_exchange_rate, v_from_cur, v_to_cur, p_amount, v_amount_to
    );
  END IF;

  RETURN QUERY
  SELECT * FROM business_transactions_view WHERE id = v_transfer_id;
END;
$$;

CREATE OR REPLACE FUNCTION ntrio_get_period_summary(
  p_business_id UUID,
  p_period TEXT,
  p_reference_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  period_label TEXT,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  total_income NUMERIC,
  total_expense NUMERIC,
  net NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
  v_label TEXT;
BEGIN
  PERFORM ntrio_assert_business_access(p_business_id);

  CASE p_period
    WHEN 'daily' THEN
      v_start := date_trunc('day', p_reference_date::timestamptz);
      v_end := v_start + INTERVAL '1 day';
      v_label := to_char(p_reference_date, 'YYYY-MM-DD');
    WHEN 'monthly' THEN
      v_start := date_trunc('month', p_reference_date::timestamptz);
      v_end := v_start + INTERVAL '1 month';
      v_label := to_char(p_reference_date, 'Mon YYYY');
    WHEN 'quarterly' THEN
      v_start := date_trunc('quarter', p_reference_date::timestamptz);
      v_end := v_start + INTERVAL '3 months';
      v_label := 'Q' || to_char(p_reference_date, 'Q YYYY');
    ELSE
      RAISE EXCEPTION 'period must be daily, monthly, or quarterly';
  END CASE;

  RETURN QUERY
  WITH tx AS (
    SELECT td.kind, t.amount, t.event_at
    FROM transaction_details td
    INNER JOIN pgledger_transfers t ON td.transfer_id = t.id
    WHERE td.business_id = p_business_id
      AND t.event_at >= v_start AND t.event_at < v_end
  )
  SELECT
    v_label,
    v_start,
    v_end,
    COALESCE(SUM(amount) FILTER (WHERE kind = 'income'), 0),
    COALESCE(SUM(amount) FILTER (WHERE kind = 'expense'), 0),
    COALESCE(SUM(amount) FILTER (WHERE kind = 'income'), 0)
      - COALESCE(SUM(amount) FILTER (WHERE kind = 'expense'), 0)
  FROM tx;
END;
$$;

-- Storage bucket (run once; ignore error if exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', FALSE)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE transaction_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transaction_attachments_all ON transaction_attachments;
CREATE POLICY transaction_attachments_all ON transaction_attachments
FOR ALL
USING (business_id IN (SELECT ntrio_user_business_ids()))
WITH CHECK (business_id IN (SELECT ntrio_user_business_ids()));

DROP POLICY IF EXISTS receipts_storage ON storage.objects;
CREATE POLICY receipts_storage ON storage.objects
FOR ALL
USING (
  bucket_id = 'receipts'
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'receipts'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

GRANT SELECT ON balance_sheet_view TO authenticated;
GRANT SELECT ON period_pl_summary_view TO authenticated;
GRANT SELECT, INSERT ON transaction_attachments TO authenticated;

GRANT EXECUTE ON FUNCTION ntrio_set_opening_balance TO authenticated;
GRANT EXECUTE ON FUNCTION ntrio_get_period_summary TO authenticated;
