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

/** GST taxable activity from the Maldives registration certificate. */
export interface TaxableActivityDto {
  number: string;
  name: string | null;
}

export interface SettingsDto {
  global_usd_mvr_rate: number;
  organization_id: string;
  /** Wordmark in TopBar / Hub. Default NTRIO. */
  organization_title: string;
  /** When true, project tagging and filters are available. */
  projects_enabled: boolean;
  /** Maldives GST TIN (taxpayer identification number). */
  gst_tin: string | null;
  /** Legal / registered name on the GST certificate. */
  gst_registered_name: string | null;
  /** Currency used when preparing the GST return (typically MVR). */
  gst_return_currency: string;
  /** Taxable activity numbers from the GST registration certificate. */
  taxable_activities: TaxableActivityDto[];
  /** When true, GST wizards can optionally capture Maldives Green Tax. */
  green_tax_enabled: boolean;
  /**
   * When true (and green tax enabled), income Green Tax step collects guest
   * name / nationality / category for the MIRA Information Sheet.
   */
  green_tax_collect_guests: boolean;
  fx_rates: FxDailyRateDto[];
}

/** MIRA Information Sheet guest category: 1 taxable, 2 Maldivian, 3 other exempt. */
export type GreenTaxGuestCategory = "1" | "2" | "3";

/** One guest row for Maldives Green Tax Information Sheet (per stay / invoice). */
export interface GreenTaxGuestDto {
  guest_reg_no: string | null;
  name: string;
  category: GreenTaxGuestCategory;
  identification_no: string | null;
  /** Country of nationality as filed with MIRA (e.g. Finland, Maldives, USA). */
  nationality: string;
  booking_method: string | null;
}

/** GET /api/projects */
export interface ProjectDto {
  id: string;
  name: string;
  created_at: string;
}

/** Workspace modules (tenant feature flags). */
export type WorkspaceModuleId = "accounts" | "occupancy" | "kitchen" | "stock";

export const ALL_WORKSPACE_MODULES: readonly WorkspaceModuleId[] = [
  "accounts",
  "occupancy",
  "kitchen",
  "stock",
] as const;

export const WORKSPACE_MODULE_PATH: Record<WorkspaceModuleId, string> = {
  accounts: "/accounts",
  occupancy: "/occupancy",
  kitchen: "/kitchen",
  stock: "/stock",
};

/** GET /api/settings/organizations */
export interface OrganizationDto {
  id: string;
  title: string;
  enabled_modules: WorkspaceModuleId[];
}

export interface OrganizationsListDto {
  organizations: OrganizationDto[];
  active_organization_id: string;
  /** Modules enabled for the active organization. */
  enabled_modules: WorkspaceModuleId[];
  is_system_admin?: boolean;
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
  project_id: string | null;
  project_name: string | null;
  account_id: string | null;
  account_name: string;
  account_currency: string;
  contact_id: string | null;
  contact_name: string | null;
  source: string | null;
  notes: string | null;
  tags: string[];
  attachment_url: string | null;
  /** Optional tax invoice number (MIRA-style). */
  invoice_number: string | null;
  /** GST percent (e.g. 8). Null when no tax breakdown. */
  gst_rate: number | null;
  /** Value of supplies subject to GST (excl. tax). */
  gst_subtotal: number | null;
  /** Tax charged (auto or manual). */
  gst_amount: number | null;
  /** Value of zero-rated supplies. */
  zero_rated_amount: number | null;
  /** Maldives Green Tax (excluded from GST taxable subtotal). */
  green_tax_amount: number | null;
  green_tax_check_in: string | null;
  green_tax_check_out: string | null;
  green_tax_form_url: string | null;
  /** Guest rows for MIRA Information Sheet (empty when not collected). */
  green_tax_guests: GreenTaxGuestDto[];
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
  project_id: string | null;
  project_name: string | null;
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
  /** Optional tax invoice number (MIRA-style). */
  invoice_number: string | null;
  /** GST percent (e.g. 8). Null when no tax breakdown. */
  gst_rate: number | null;
  /** Value of supplies subject to GST (excl. tax). */
  gst_subtotal: number | null;
  /** Tax charged (auto or manual). */
  gst_amount: number | null;
  /** Value of zero-rated supplies. */
  zero_rated_amount: number | null;
  green_tax_amount: number | null;
  green_tax_check_in: string | null;
  green_tax_check_out: string | null;
  green_tax_form_url: string | null;
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
  /** Selected optional side stock-item ids from the breakfast-type recipe. */
  selected_option_ids: string[];
  special_requests: string | null;
  status: BreakfastOrderStatus;
  created_at: string;
  updated_at: string;
}

/** Choosable side on a Maldivian / Continental breakfast order. */
export interface BreakfastOptionDto {
  stock_item_id: string;
  name: string;
  unit: string;
  code: string | null;
  qty_per_serving: number;
  show_on_kot: boolean;
  notes: string | null;
}

export interface RoomExtraOptionDto {
  stock_item_id: string;
  name: string;
  unit: string;
  code: string | null;
  qty_per_serving: number;
  notes: string | null;
  show_on_kot: boolean;
}

export interface RoomExtraSelectionDto {
  stock_item_id: string;
  quantity: number;
  /** Present when returned from day/summaries APIs. */
  name?: string;
  unit?: string;
  code?: string | null;
  show_on_kot?: boolean;
}

export type MealPeriod = "breakfast" | "lunch" | "dinner";

export const MEAL_PERIODS: readonly MealPeriod[] = ["breakfast", "lunch", "dinner"] as const;

export interface RoomDayExtrasDto {
  id: string | null;
  meal_period: MealPeriod;
  fruits: string[];
  /** @deprecated Prefer selected_lines. Kept for older clients. */
  selected_item_ids: string[];
  /** Configurable extras with quantities (stock units). */
  selected_lines: RoomExtraSelectionDto[];
  pancake: boolean;
  honey: boolean;
  nutella: boolean;
  cereal: boolean;
  water_bottle: boolean;
}

export type RoomExtrasByMealDto = Record<MealPeriod, RoomDayExtrasDto>;

export interface KitchenDayRoomDto {
  id: string;
  number: string;
  occupant_count: number;
  notes: string | null;
  breakfast_participants: number;
  orders: BreakfastOrderDto[];
  /** Breakfast extras (compat alias of extras_by_meal.breakfast). */
  extras: RoomDayExtrasDto;
  /** Fruits & extras independently for breakfast, lunch, and dinner. */
  extras_by_meal: RoomExtrasByMealDto;
}

export interface KitchenDayDto {
  date: string;
  serving_times: string[];
  /** Choosable room extras from Recipes → Room extras (configure there). */
  extra_options: RoomExtraOptionDto[];
  /** Optional sides per breakfast menu type (from Recipes → Maldivian / Continental). */
  breakfast_options: Record<BreakfastType, BreakfastOptionDto[]>;
  rooms: KitchenDayRoomDto[];
}

export interface ServerSummaryOptionSideDto {
  name: string;
  code: string | null;
  quantity: number;
}

export interface ServerSummaryRowDto {
  date: string;
  breakfast_time: string;
  room_number: string;
  maldivian: number;
  continental: number;
  /** Selected optional sides from Recipes for this room/time. */
  option_sides: ServerSummaryOptionSideDto[];
  /** @deprecated Prefer option_sides — kept for older CSV labels. */
  juice: number;
  /** @deprecated Prefer option_sides — kept for older CSV labels. */
  tea_or_coffee: number;
  special_requests: string[];
  outside_normal_window: boolean;
}

export interface KitchenPlanExtraLineDto {
  name: string;
  unit: string;
  code: string | null;
  quantity: number;
  rooms: string[];
}

export interface KitchenPlanDto {
  /** @deprecated Prefer prep_lines — kept for older CSV labels. */
  roshi: number;
  /** @deprecated Prefer prep_lines */
  mashuni_cups: number;
  /** @deprecated Prefer prep_lines */
  sausages: number;
  eggs_omelette: number;
  eggs_fried: number;
  eggs_boiled: number;
  eggs_scrambled: number;
  /** @deprecated Prefer prep_lines */
  potato_servings: number;
  pancakes: number;
  /**
   * KOT prep from breakfast recipes: base lines with Show on KOT + selected optional sides.
   * Fully recipe-driven (no hardcoded menu items).
   */
  prep_lines: KitchenPlanExtraLineDto[];
  /** Room extras with Show on KOT enabled. */
  extras: KitchenPlanExtraLineDto[];
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

export type ShoppingReason = "order_shortfall" | "min_stock" | "missing_item";

export interface ShoppingListLineDto {
  code: string;
  stock_item_id: string | null;
  name: string;
  unit: string;
  required: number;
  on_hand: number;
  min_stock: number;
  to_buy: number;
  projected_after_use: number;
  reasons: ShoppingReason[];
  use_notes: string | null;
  pack_info: string | null;
}

export interface ShoppingSummaryDto {
  buy_line_count: number;
  order_shortfall_count: number;
  min_stock_count: number;
  missing_item_count: number;
}

export interface ShoppingListDto {
  date: string;
  items: ShoppingListLineDto[];
  buy_items: ShoppingListLineDto[];
  summary: ShoppingSummaryDto;
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
  show_on_kot: boolean;
  /** Choosable side on Maldivian/Continental orders (not always included). */
  is_option: boolean;
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
