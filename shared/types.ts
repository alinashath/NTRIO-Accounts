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

/** Kitchen / Stock (Isola Alifu breakfast ops) */

export type BreakfastType = "maldivian" | "continental";
export type EggStyle = "omelette" | "fried" | "boiled" | "scrambled";
export type BreakfastOrderStatus = "pending" | "served" | "cancelled";
export type StockItemKind = "kitchen" | "other";
export type FruitType = "watermelon" | "apple" | "papaya" | "orange";

export interface RoomDto {
  id: string;
  number: string;
}

export interface RoomStayDto {
  id: string;
  room_id: string;
  room_number: string;
  from_date: string;
  to_date: string;
  occupant_count: number;
  notes: string | null;
  created_at: string;
  days_filled?: number;
}

export interface BreakfastOrderDto {
  id: string;
  room_id: string;
  room_number: string;
  breakfast_date: string;
  guest_number: number;
  serving_time: string;
  outside_normal_window: boolean;
  breakfast_type: BreakfastType;
  egg_style: EggStyle;
  potato: boolean;
  juice: boolean;
  tea: boolean;
  coffee: boolean;
  milk: boolean;
  sugar: boolean;
  special_requests: string | null;
  status: BreakfastOrderStatus;
  created_at: string;
  updated_at: string;
}

export interface RoomDayExtrasDto {
  id: string | null;
  fruits: string[];
  pancake: boolean;
  honey: boolean;
  nutella: boolean;
  cereal: boolean;
  water_bottle: boolean;
}

export interface KitchenDayRoomDto {
  id: string;
  number: string;
  occupant_count: number;
  notes: string | null;
  breakfast_participants: number;
  orders: BreakfastOrderDto[];
  extras: RoomDayExtrasDto;
}

export interface KitchenDayDto {
  date: string;
  serving_times: string[];
  rooms: KitchenDayRoomDto[];
}

export interface ServerSummaryRowDto {
  date: string;
  breakfast_time: string;
  room_number: string;
  maldivian: number;
  continental: number;
  juice: number;
  tea_or_coffee: number;
  special_requests: string[];
  outside_normal_window: boolean;
}

export interface KitchenPlanDto {
  roshi: number;
  mashuni_cups: number;
  sausages: number;
  eggs_omelette: number;
  eggs_fried: number;
  eggs_boiled: number;
  eggs_scrambled: number;
  potato_servings: number;
  pancakes: number;
  schedule: Array<{
    room_number: string;
    guest_number: number;
    serving_time: string;
    breakfast_type: BreakfastType;
    egg_style: EggStyle;
    outside_normal_window: boolean;
    special_requests: string | null;
  }>;
}

export interface KitchenSummariesDto {
  date: string;
  server_summary: ServerSummaryRowDto[];
  kitchen_plan: KitchenPlanDto;
}

export interface StockItemDto {
  id: string;
  code: string | null;
  name: string;
  unit: string;
  kind: StockItemKind;
  min_stock: number;
  use_notes: string | null;
  pack_info: string | null;
  sort_order: number;
}

export interface StockInventoryRowDto {
  stock_item_id: string;
  code: string | null;
  name: string;
  unit: string;
  kind: StockItemKind;
  use_notes: string | null;
  pack_info: string | null;
  min_stock: number;
  opening: number;
  received: number;
  used: number;
  waste: number;
  expenditure: number;
  unit_cost: number | null;
  balance: number;
  below_min: boolean;
  ledger_id: string | null;
}

export interface ShoppingListLineDto {
  code: string;
  stock_item_id: string;
  name: string;
  unit: string;
  required: number;
  on_hand: number;
  to_buy: number;
  use_notes: string | null;
  pack_info: string | null;
}

export interface ShoppingListDto {
  date: string;
  items: ShoppingListLineDto[];
  buy_items: ShoppingListLineDto[];
}

export interface StockReportDto {
  from: string;
  to: string;
  guest_count: number;
  ingredient_consumption: Array<{
    stock_item_id: string;
    name: string;
    unit: string;
    used: number;
    waste: number;
    expenditure: number;
  }>;
  expenditure: number;
  cost_per_guest: number | null;
  food_waste: {
    total_waste_qty: number;
    total_used_qty: number;
    lines: Array<{
      stock_item_id: string;
      name: string;
      unit: string;
      waste: number;
    }>;
  };
}

export type RecipeApplyTo = "maldivian" | "continental" | "room_extras" | "custom";

export interface RecipeLineDto {
  id: string;
  stock_item_id: string;
  stock_item_name: string;
  stock_item_unit: string;
  stock_item_code: string | null;
  qty_per_serving: number;
  notes: string | null;
}

export interface RecipeDto {
  id: string;
  name: string;
  apply_to: RecipeApplyTo;
  code: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  lines: RecipeLineDto[];
}
