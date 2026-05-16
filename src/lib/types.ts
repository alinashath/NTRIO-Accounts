export type MemberRole = "owner" | "admin" | "member";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "canceled"
  | "past_due"
  | "expired";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string | null;
  price_monthly_cents: number;
  max_businesses: number;
  stripe_price_id: string | null;
}

export interface UserSubscription {
  id: string;
  user_id: string;
  plan_id: string;
  plan_name: string;
  max_businesses: number;
  price_monthly_cents: number;
  status: SubscriptionStatus;
  trial_ends_at: string | null;
  current_period_end: string | null;
  is_active: boolean;
}

export type AccountCategory =
  | "asset"
  | "liability"
  | "equity"
  | "income"
  | "expense";

export type TransactionKind = "income" | "expense" | "transfer";

export interface Business {
  id: string;
  name: string;
  currency: string;
  created_at: string;
  role?: MemberRole;
}

export interface BusinessSummary {
  business_id: string;
  name: string;
  currency: string;
  total_assets: number;
  total_liabilities: number;
  total_income: number;
  total_expenses: number;
  cash_balance: number;
}

export interface BusinessAccount {
  id: string;
  business_id: string;
  ledger_account_id: string;
  category: AccountCategory;
  code: string;
  display_name: string;
  description: string | null;
  is_primary: boolean;
  is_active?: boolean;
  sort_order?: number;
  account_currency?: string;
  balance: number;
  currency: string;
}

export interface BalanceSheetRow {
  business_id: string;
  account_id: string;
  category: AccountCategory;
  code: string;
  display_name: string;
  currency: string;
  balance: number;
  is_primary: boolean;
}

export interface PeriodSummary {
  period_label: string;
  period_start: string;
  period_end: string;
  total_income: number;
  total_expense: number;
  net: number;
}

export type PeriodGranularity = "daily" | "monthly" | "quarterly";

export interface TransactionCategory {
  id: string;
  business_id: string;
  kind: "income" | "expense";
  name: string;
  account_code: string;
  account_name: string | null;
  is_system: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface BusinessTransaction {
  id: string;
  business_id: string;
  kind: TransactionKind;
  category: string | null;
  description: string | null;
  reference: string | null;
  amount: number;
  event_at: string;
  created_at: string;
  from_account_name: string;
  to_account_name: string;
  currency: string;
}
