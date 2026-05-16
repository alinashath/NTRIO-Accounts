import { createClient } from "@/lib/supabase/client";
import type {
  Business,
  BusinessAccount,
  BusinessSummary,
  BusinessTransaction,
  TransactionCategory,
  AccountCategory,
  BalanceSheetRow,
  PeriodSummary,
  PeriodGranularity,
} from "./types";

const BUSINESS_KEY = "ntrio_active_business_id";

export function getActiveBusinessId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(BUSINESS_KEY);
}

export function setActiveBusinessId(id: string) {
  localStorage.setItem(BUSINESS_KEY, id);
}

export async function listBusinesses(): Promise<Business[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("my_businesses_view")
    .select("id, name, currency, created_at, role")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    currency: row.currency,
    created_at: row.created_at,
    role: row.role,
  }));
}

export async function getMySubscription() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("my_subscription_view")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    ...data,
    max_businesses: Number(data.max_businesses),
    price_monthly_cents: Number(data.price_monthly_cents),
    is_active: Boolean(data.is_active),
  };
}

export async function listPlans() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("subscription_plans")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map((p) => ({
    ...p,
    price_monthly_cents: Number(p.price_monthly_cents),
    max_businesses: Number(p.max_businesses),
  }));
}

export async function changePlan(planId: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("ntrio_change_plan", {
    p_plan_id: planId,
  });
  if (error) throw error;
}

export async function updateProfile(fullName: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) throw error;
}

export async function createBusiness(name: string, currency = "MVR") {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("ntrio_create_business", {
    p_name: name,
    p_currency: currency,
  });
  if (error) throw error;
  return data as string;
}

export async function getSummary(businessId: string): Promise<BusinessSummary> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("business_summary_view")
    .select("*")
    .eq("business_id", businessId)
    .single();
  if (error) throw error;
  return {
    ...data,
    total_assets: Number(data.total_assets),
    total_liabilities: Number(data.total_liabilities),
    total_income: Math.abs(Number(data.total_income)),
    total_expenses: Number(data.total_expenses),
    cash_balance: Number(data.cash_balance),
  };
}

export async function listAccounts(
  businessId: string,
  activeOnly = true,
): Promise<BusinessAccount[]> {
  const supabase = createClient();
  let query = supabase
    .from("business_accounts_view")
    .select("*")
    .eq("business_id", businessId)
    .order("sort_order")
    .order("display_name");
  if (activeOnly) {
    query = query.eq("is_active", true);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    balance: Number(row.balance),
  }));
}

export async function listTransactionCategories(
  businessId: string,
  kind?: "income" | "expense",
): Promise<TransactionCategory[]> {
  const supabase = createClient();
  let query = supabase
    .from("transaction_categories_view")
    .select("*")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("sort_order")
    .order("name");
  if (kind) query = query.eq("kind", kind);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function addAccount(params: {
  businessId: string;
  category: AccountCategory;
  displayName: string;
  code?: string;
  description?: string;
  currency?: string;
  initialBalance?: number;
}) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("ntrio_add_account", {
    p_business_id: params.businessId,
    p_category: params.category,
    p_display_name: params.displayName,
    p_code: params.code ?? null,
    p_description: params.description ?? null,
    p_currency: params.currency ?? null,
    p_initial_balance: params.initialBalance ?? 0,
  });
  if (error) throw error;
  return data as string;
}

export async function setOpeningBalance(accountId: string, amount: number) {
  const supabase = createClient();
  const { error } = await supabase.rpc("ntrio_set_opening_balance", {
    p_account_id: accountId,
    p_amount: amount,
  });
  if (error) throw error;
}

export async function getBalanceSheet(
  businessId: string,
): Promise<BalanceSheetRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("balance_sheet_view")
    .select("*")
    .eq("business_id", businessId);
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, balance: Number(r.balance) }));
}

export async function getPeriodSummary(
  businessId: string,
  period: PeriodGranularity,
  referenceDate?: string,
): Promise<PeriodSummary> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("ntrio_get_period_summary", {
    p_business_id: businessId,
    p_period: period,
    p_reference_date: referenceDate ?? new Date().toISOString().slice(0, 10),
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    period_label: row.period_label,
    period_start: row.period_start,
    period_end: row.period_end,
    total_income: Number(row.total_income),
    total_expense: Number(row.total_expense),
    net: Number(row.net),
  };
}

export async function uploadReceipt(
  businessId: string,
  transferId: string,
  file: File,
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${user.id}/${businessId}/${transferId}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("receipts")
    .upload(path, file, { upsert: true });
  if (uploadError) throw uploadError;

  const { error: dbError } = await supabase.from("transaction_attachments").insert({
    transfer_id: transferId,
    business_id: businessId,
    storage_path: path,
    file_name: file.name,
    content_type: file.type,
  });
  if (dbError) throw dbError;

  return path;
}

export async function updateAccount(params: {
  accountId: string;
  displayName?: string;
  description?: string;
  isPrimary?: boolean;
  isActive?: boolean;
}) {
  const supabase = createClient();
  const { error } = await supabase.rpc("ntrio_update_account", {
    p_account_id: params.accountId,
    p_display_name: params.displayName ?? null,
    p_description: params.description ?? null,
    p_is_primary: params.isPrimary ?? null,
    p_is_active: params.isActive ?? null,
  });
  if (error) throw error;
}

export async function addTransactionCategory(params: {
  businessId: string;
  kind: "income" | "expense";
  name: string;
  accountCode: string;
}) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("ntrio_add_transaction_category", {
    p_business_id: params.businessId,
    p_kind: params.kind,
    p_name: params.name,
    p_account_code: params.accountCode,
  });
  if (error) throw error;
  return data as string;
}

export async function updateTransactionCategory(params: {
  categoryId: string;
  name?: string;
  accountCode?: string;
  isActive?: boolean;
}) {
  const supabase = createClient();
  const { error } = await supabase.rpc("ntrio_update_transaction_category", {
    p_category_id: params.categoryId,
    p_name: params.name ?? null,
    p_account_code: params.accountCode ?? null,
    p_is_active: params.isActive ?? null,
  });
  if (error) throw error;
}

export async function listTransactions(
  businessId: string,
  limit = 50,
): Promise<BusinessTransaction[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("business_transactions_view")
    .select("*")
    .eq("business_id", businessId)
    .order("event_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    amount: Number(row.amount),
  }));
}

export async function recordIncome(params: {
  businessId: string;
  amount: number;
  description?: string;
  category?: string;
}): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("ntrio_record_income", {
    p_business_id: params.businessId,
    p_amount: params.amount,
    p_description: params.description ?? null,
    p_category: params.category ?? "Room booking",
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  return row?.id ?? null;
}

export async function recordExpense(params: {
  businessId: string;
  amount: number;
  description?: string;
  category?: string;
  expenseAccount?: string;
}): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("ntrio_record_expense", {
    p_business_id: params.businessId,
    p_amount: params.amount,
    p_description: params.description ?? null,
    p_category: params.category ?? null,
    p_from_account_code: params.expenseAccount ?? "misc_expense",
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  return row?.id ?? null;
}

export async function recordTransfer(params: {
  businessId: string;
  amount: number;
  fromAccount: string;
  toAccount: string;
  description?: string;
  exchangeRate?: number;
}): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("ntrio_record_transfer", {
    p_business_id: params.businessId,
    p_amount: params.amount,
    p_from_account_code: params.fromAccount,
    p_to_account_code: params.toAccount,
    p_description: params.description ?? null,
    p_exchange_rate: params.exchangeRate ?? null,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  return row?.id ?? null;
}
