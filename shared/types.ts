/** Shared API-facing types (subset for client consumption). */

/** GET /api/settings/users */
export interface SettingsUserDto {
  id: string;
  email: string | null;
  created_at: string;
}

/** GET / PATCH /api/settings */
export interface FxDailyRateDto {
  rate_date: string;
  usd_mvr_rate: number;
}

export interface SettingsDto {
  global_usd_mvr_rate: number;
  fx_rates: FxDailyRateDto[];
}

export type AccountType = "bank" | "cash" | "wallet";

export interface AccountDto {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  opening_balance: number;
  balance: number;
  opened_at: string | null;
  created_at: string;
  /** False when opening balance ≠ 0 or there is ledger activity; currency edits are blocked. */
  can_change_currency: boolean;
}

export type LedgerKind =
  | "income"
  | "expense"
  | "transfer_in"
  | "transfer_out"
  | "debt"
  | "adjustment";

export interface LedgerLineDto {
  id: string;
  kind: LedgerKind;
  date: string;
  description: string | null;
  amount: number;
  signed_amount: number;
  running_balance: number;
  money_in: number | null;
  money_out: number | null;
}

/** GET /api/accounts/:id/ledger */
export interface AccountLedgerPageDto {
  account: AccountDto;
  opening_balance: number;
  currency: string;
  page: number;
  page_size: number;
  total: number;
  items: LedgerLineDto[];
}

export interface CategoryDto {
  id: string;
  name: string;
  type: "income" | "expense";
  color: string | null;
  icon: string | null;
  budget_limit: number | null;
  created_at: string;
}

export type ContactKind = "vendor" | "customer" | "other";

export interface ContactDto {
  id: string;
  name: string;
  kind: ContactKind;
  email: string | null;
  phone: string | null;
  tgst_number: string | null;
  notes: string | null;
  created_at: string;
}

/** GET /api/contacts with pagination (`page`, `limit`, optional `search`, `kind`). */
export interface PagedContactsDto {
  items: ContactDto[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

/** GET /api/reports/category-detail */
export interface CategoryDetailTrendPointDto {
  month: string;
  period_from: string;
  period_to: string;
  total: number;
}

export interface CategoryDetailTransactionDto {
  id: string;
  kind: "income" | "expense";
  date: string;
  description: string | null;
  amount: number;
  currency: string;
}

export interface CategoryDetailDto {
  kind: "income" | "expense";
  category_id: string | null;
  name: string;
  from: string;
  to: string;
  display_currency: string | null;
  trend: CategoryDetailTrendPointDto[];
  transactions: CategoryDetailTransactionDto[];
}

/** GET /api/contacts/:id/statement */
export interface ContactStatementLineDto {
  id: string;
  kind: "income" | "expense";
  /** Effective / sort date (received or paid date when set, else bill / earned). */
  date: string;
  description: string | null;
  amount: number;
  currency: string;
  /** Account, debt, pay later, or receivable. */
  via: string;
  category_name: string | null;
  /** Income: amount not yet deposited to an account. */
  pending_receivable?: boolean;
  /** Expense: unpaid vendor bill (pay later). */
  pay_later?: boolean;
  /** Expense: bill / invoice date. */
  bill_date?: string;
}

export interface ContactStatementDto {
  contact: ContactDto;
  lines: ContactStatementLineDto[];
}

export interface IncomeEntryDto {
  id: string;
  amount: number;
  /** Earned / invoice date. */
  date: string;
  /** When deposited; null while receivable. */
  received_date: string | null;
  /** Currency of `amount` (must match account when deposited). */
  currency: string;
  pending_receivable: boolean;
  description: string | null;
  category_id: string | null;
  category_name: string | null;
  account_id: string | null;
  account_name: string;
  account_currency: string;
  contact_id: string | null;
  contact_name: string | null;
  source: string | null;
  notes: string | null;
  tags: string[];
  attachment_url: string | null;
  voided_at: string | null;
  void_reason: string | null;
  recurring_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Returned by GET /api/income when `limit` is present (paginated list). */
export interface PagedIncomeListDto {
  items: IncomeEntryDto[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ExpenseEntryDto {
  id: string;
  amount: number;
  /** Effective date for sorting (paid or bill). */
  date: string;
  bill_date: string;
  paid_date: string | null;
  description: string | null;
  category_id: string | null;
  category_name: string | null;
  account_id: string | null;
  account_name: string;
  account_currency: string;
  debt_id: string | null;
  /** Unpaid bill — not yet deducted from an account or charged to debt. */
  pay_later?: boolean;
  /** Currency of `amount` when `pay_later` is true. */
  bill_currency?: string;
  contact_id: string | null;
  contact_name: string | null;
  merchant: string | null;
  notes: string | null;
  tags: string[];
  attachment_url: string | null;
  voided_at: string | null;
  void_reason: string | null;
  recurring_id: string | null;
  splits: Array<{
    id: string;
    category_id: string;
    amount: number;
    percentage: number | null;
  }>;
  created_at: string;
  updated_at: string;
}

/** Returned by GET /api/expenses when `limit` is present (paginated list). */
export interface PagedExpenseListDto {
  items: ExpenseEntryDto[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface DebtDto {
  id: string;
  direction: "i_owe" | "owed_to_me";
  contact_name: string;
  /** Linked CRM contact (optional). */
  contact_id: string | null;
  linked_contact_name: string | null;
  currency: string;
  principal: number;
  interest_rate: number;
  due_date: string | null;
  notes: string | null;
  status: "open" | "settled";
  total_paid: number;
  /** Spend entries charged to this debt (I owe). */
  charges_from_expenses: number;
  outstanding: number;
  created_at: string;
}

export interface DebtPaymentDto {
  id: string;
  debt_id: string;
  /** Reduction in the debt's currency. */
  amount: number;
  /** Cash debited from the account when currencies differ. */
  account_amount: number | null;
  /** Debt-currency units per 1 account-currency unit, when cross-currency. */
  exchange_rate: number | null;
  account_currency: string;
  date: string;
  notes: string | null;
  account_id: string;
  account_name: string;
  attachment_url: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
}

export interface DebtExpenseChargeDto {
  id: string;
  amount: number;
  date: string;
  description: string | null;
  merchant: string | null;
  category_name: string | null;
}

export interface DebtDetailDto extends DebtDto {
  payments: DebtPaymentDto[];
  expense_charges: DebtExpenseChargeDto[];
}
