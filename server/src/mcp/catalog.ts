import type { WorkspaceModuleId } from "../lib/workspaces.js";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type McpToolDef = {
  name: string;
  description: string;
  module: WorkspaceModuleId | "core";
  method: HttpMethod;
  /** Path under /api, may include {id} placeholders filled from args.path */
  path: string;
  /** Args that become path params */
  pathParams?: string[];
  /** Remaining object keys go to query (GET) or JSON body (others). path/query reserved keys stripped. */
  passBody?: boolean;
};

/**
 * One MCP tool per tenant API surface (excluding admin, signup, MCP user management).
 */
export const MCP_TOOLS: McpToolDef[] = [
  // —— Accounts ——
  { name: "list_accounts", description: "List bank/cash/wallet accounts and balances", module: "accounts", method: "GET", path: "/api/accounts" },
  { name: "create_account", description: "Create an account", module: "accounts", method: "POST", path: "/api/accounts", passBody: true },
  { name: "transfer_between_accounts", description: "Transfer money between accounts (supports FX)", module: "accounts", method: "POST", path: "/api/accounts/transfer", passBody: true },
  { name: "update_account", description: "Update an account", module: "accounts", method: "PUT", path: "/api/accounts/{id}", pathParams: ["id"], passBody: true },
  { name: "delete_account", description: "Delete an account", module: "accounts", method: "DELETE", path: "/api/accounts/{id}", pathParams: ["id"] },
  { name: "get_account_ledger", description: "Get account statement/ledger", module: "accounts", method: "GET", path: "/api/accounts/{id}/ledger", pathParams: ["id"] },
  { name: "get_account", description: "Get one account", module: "accounts", method: "GET", path: "/api/accounts/{id}", pathParams: ["id"] },
  { name: "create_account_adjustment", description: "Create a balance adjustment", module: "accounts", method: "POST", path: "/api/accounts/{id}/adjustments", pathParams: ["id"], passBody: true },

  // —— Income ——
  { name: "list_income", description: "List income entries (filters via query)", module: "accounts", method: "GET", path: "/api/income" },
  { name: "create_income", description: "Create an income entry (use attachment_url from upload_receipt)", module: "accounts", method: "POST", path: "/api/income", passBody: true },
  { name: "update_income", description: "Update an income entry", module: "accounts", method: "PUT", path: "/api/income/{id}", pathParams: ["id"], passBody: true },
  { name: "void_income", description: "Void an income entry", module: "accounts", method: "POST", path: "/api/income/{id}/void", pathParams: ["id"], passBody: true },
  { name: "unvoid_income", description: "Unvoid an income entry", module: "accounts", method: "POST", path: "/api/income/{id}/unvoid", pathParams: ["id"], passBody: true },
  { name: "delete_income", description: "Soft-delete an income entry", module: "accounts", method: "DELETE", path: "/api/income/{id}", pathParams: ["id"] },

  // —— Expenses ——
  { name: "list_expenses", description: "List expense entries", module: "accounts", method: "GET", path: "/api/expenses" },
  { name: "create_expense", description: "Create an expense (use attachment_url from upload_receipt)", module: "accounts", method: "POST", path: "/api/expenses", passBody: true },
  { name: "update_expense", description: "Update an expense", module: "accounts", method: "PUT", path: "/api/expenses/{id}", pathParams: ["id"], passBody: true },
  { name: "void_expense", description: "Void an expense", module: "accounts", method: "POST", path: "/api/expenses/{id}/void", pathParams: ["id"], passBody: true },
  { name: "unvoid_expense", description: "Unvoid an expense", module: "accounts", method: "POST", path: "/api/expenses/{id}/unvoid", pathParams: ["id"], passBody: true },
  { name: "delete_expense", description: "Soft-delete an expense", module: "accounts", method: "DELETE", path: "/api/expenses/{id}", pathParams: ["id"] },

  // —— Categories ——
  { name: "list_categories", description: "List income/expense categories", module: "accounts", method: "GET", path: "/api/categories" },
  { name: "create_category", description: "Create a category", module: "accounts", method: "POST", path: "/api/categories", passBody: true },
  { name: "update_category", description: "Update a category", module: "accounts", method: "PUT", path: "/api/categories/{id}", pathParams: ["id"], passBody: true },
  { name: "delete_category", description: "Delete a category", module: "accounts", method: "DELETE", path: "/api/categories/{id}", pathParams: ["id"] },

  // —— Projects ——
  { name: "list_projects", description: "List projects", module: "accounts", method: "GET", path: "/api/projects" },
  { name: "create_project", description: "Create a project", module: "accounts", method: "POST", path: "/api/projects", passBody: true },
  { name: "update_project", description: "Update a project", module: "accounts", method: "PUT", path: "/api/projects/{id}", pathParams: ["id"], passBody: true },
  { name: "delete_project", description: "Delete a project", module: "accounts", method: "DELETE", path: "/api/projects/{id}", pathParams: ["id"] },

  // —— Contacts ——
  { name: "list_contacts", description: "List contacts (vendors/customers)", module: "accounts", method: "GET", path: "/api/contacts" },
  { name: "get_contact_statement", description: "Contact statement", module: "accounts", method: "GET", path: "/api/contacts/{id}/statement", pathParams: ["id"] },
  { name: "settle_contact_expenses", description: "Settle pay-later expenses for a contact", module: "accounts", method: "POST", path: "/api/contacts/{id}/settle-expenses", pathParams: ["id"], passBody: true },
  { name: "merge_pay_later_bills", description: "Merge pay-later bills for a contact", module: "accounts", method: "POST", path: "/api/contacts/{id}/merge-pay-later-bills", pathParams: ["id"], passBody: true },
  { name: "create_contact", description: "Create a contact", module: "accounts", method: "POST", path: "/api/contacts", passBody: true },
  { name: "update_contact", description: "Update a contact", module: "accounts", method: "PUT", path: "/api/contacts/{id}", pathParams: ["id"], passBody: true },
  { name: "delete_contact", description: "Delete a contact", module: "accounts", method: "DELETE", path: "/api/contacts/{id}", pathParams: ["id"] },

  // —— Debts ——
  { name: "list_debts", description: "List debts", module: "accounts", method: "GET", path: "/api/debts" },
  { name: "get_debt", description: "Get one debt", module: "accounts", method: "GET", path: "/api/debts/{id}", pathParams: ["id"] },
  { name: "create_debt", description: "Create a debt", module: "accounts", method: "POST", path: "/api/debts", passBody: true },
  { name: "merge_debts", description: "Merge debts", module: "accounts", method: "POST", path: "/api/debts/merge", passBody: true },
  { name: "add_debt_principal", description: "Add principal to a debt", module: "accounts", method: "POST", path: "/api/debts/{id}/add-principal", pathParams: ["id"], passBody: true },
  { name: "update_debt", description: "Update a debt", module: "accounts", method: "PUT", path: "/api/debts/{id}", pathParams: ["id"], passBody: true },
  { name: "add_debt_payment", description: "Add a debt payment (optional receipt URL)", module: "accounts", method: "POST", path: "/api/debts/{id}/payments", pathParams: ["id"], passBody: true },
  { name: "list_debt_payments", description: "List payments on a debt", module: "accounts", method: "GET", path: "/api/debts/{id}/payments", pathParams: ["id"] },
  { name: "update_debt_payment", description: "Update a debt payment", module: "accounts", method: "PUT", path: "/api/debts/{id}/payments/{paymentId}", pathParams: ["id", "paymentId"], passBody: true },
  { name: "void_debt_payment", description: "Void a debt payment", module: "accounts", method: "POST", path: "/api/debts/{id}/payments/{paymentId}/void", pathParams: ["id", "paymentId"], passBody: true },
  { name: "unvoid_debt_payment", description: "Unvoid a debt payment", module: "accounts", method: "POST", path: "/api/debts/{id}/payments/{paymentId}/unvoid", pathParams: ["id", "paymentId"], passBody: true },

  // —— Reports ——
  { name: "report_category_detail", description: "Category detail report", module: "accounts", method: "GET", path: "/api/reports/category-detail" },
  { name: "report_pnl", description: "Profit and loss report", module: "accounts", method: "GET", path: "/api/reports/pnl" },
  { name: "report_cashflow", description: "Cashflow report", module: "accounts", method: "GET", path: "/api/reports/cashflow" },
  { name: "report_balance_sheet", description: "Balance sheet", module: "accounts", method: "GET", path: "/api/reports/balance-sheet" },
  { name: "report_net_worth", description: "Net worth", module: "accounts", method: "GET", path: "/api/reports/net-worth" },
  { name: "report_category_breakdown", description: "Category breakdown", module: "accounts", method: "GET", path: "/api/reports/category-breakdown" },
  { name: "report_mira_gst", description: "MIRA GST preview", module: "accounts", method: "GET", path: "/api/reports/mira-gst" },
  { name: "export_mira_gst", description: "Export MIRA GST workbook (xlsx base64)", module: "accounts", method: "GET", path: "/api/reports/mira-gst/export" },
  { name: "report_mira_green_tax", description: "MIRA Green Tax preview", module: "accounts", method: "GET", path: "/api/reports/mira-green-tax" },
  { name: "export_mira_green_tax", description: "Export MIRA Green Tax CSV", module: "accounts", method: "GET", path: "/api/reports/mira-green-tax/export" },
  { name: "export_report", description: "Export report (csv; pdf may be unimplemented)", module: "accounts", method: "POST", path: "/api/reports/export", passBody: true },

  // —— Settings (safe subset) ——
  { name: "get_settings", description: "Get organization settings (FX, GST, title)", module: "core", method: "GET", path: "/api/settings" },
  { name: "list_organizations", description: "List organizations for this login scope", module: "core", method: "GET", path: "/api/settings/organizations" },
  { name: "patch_settings", description: "Update settings / FX / GST fields", module: "core", method: "PATCH", path: "/api/settings", passBody: true },

  // —— Kitchen / occupancy ——
  { name: "kitchen_seed", description: "Seed kitchen defaults", module: "kitchen", method: "POST", path: "/api/kitchen/seed", passBody: true },
  { name: "list_rooms", description: "List rooms", module: "occupancy", method: "GET", path: "/api/kitchen/rooms" },
  { name: "create_room", description: "Create a room", module: "occupancy", method: "POST", path: "/api/kitchen/rooms", passBody: true },
  { name: "delete_room", description: "Delete a room", module: "occupancy", method: "DELETE", path: "/api/kitchen/rooms/{id}", pathParams: ["id"] },
  { name: "get_kitchen_day", description: "Occupancy/kitchen day snapshot", module: "occupancy", method: "GET", path: "/api/kitchen/day" },
  { name: "put_occupancy", description: "Set room occupancy for a date", module: "occupancy", method: "PUT", path: "/api/kitchen/occupancy", passBody: true },
  { name: "list_stays", description: "List room stays", module: "occupancy", method: "GET", path: "/api/kitchen/stays" },
  { name: "create_stay", description: "Create a room stay", module: "occupancy", method: "POST", path: "/api/kitchen/stays", passBody: true },
  { name: "delete_stay", description: "Delete a room stay", module: "occupancy", method: "DELETE", path: "/api/kitchen/stays/{id}", pathParams: ["id"] },
  { name: "put_room_extras", description: "Set meal extras for a room day", module: "kitchen", method: "PUT", path: "/api/kitchen/extras", passBody: true },
  { name: "create_kitchen_order", description: "Create a kitchen/breakfast order", module: "kitchen", method: "POST", path: "/api/kitchen/orders", passBody: true },
  { name: "update_kitchen_order", description: "Update a kitchen order", module: "kitchen", method: "PATCH", path: "/api/kitchen/orders/{id}", pathParams: ["id"], passBody: true },
  { name: "delete_kitchen_order", description: "Delete a kitchen order", module: "kitchen", method: "DELETE", path: "/api/kitchen/orders/{id}", pathParams: ["id"] },
  { name: "kitchen_summaries", description: "Kitchen order summaries", module: "kitchen", method: "GET", path: "/api/kitchen/summaries" },
  { name: "kitchen_requirements", description: "Ingredient requirements from orders", module: "kitchen", method: "GET", path: "/api/kitchen/requirements" },
  { name: "kitchen_apply_usage", description: "Apply kitchen usage to stock", module: "kitchen", method: "POST", path: "/api/kitchen/apply-usage", passBody: true },

  // —— Recipes ——
  { name: "list_recipes", description: "List recipes", module: "kitchen", method: "GET", path: "/api/recipes" },
  { name: "get_recipe", description: "Get a recipe", module: "kitchen", method: "GET", path: "/api/recipes/{id}", pathParams: ["id"] },
  { name: "create_recipe", description: "Create a recipe", module: "kitchen", method: "POST", path: "/api/recipes", passBody: true },
  { name: "update_recipe", description: "Update a recipe", module: "kitchen", method: "PUT", path: "/api/recipes/{id}", pathParams: ["id"], passBody: true },
  { name: "delete_recipe", description: "Delete a recipe", module: "kitchen", method: "DELETE", path: "/api/recipes/{id}", pathParams: ["id"] },

  // —— Menus ——
  { name: "list_menus", description: "List meal menus", module: "kitchen", method: "GET", path: "/api/menus" },
  { name: "get_menu", description: "Get a meal menu", module: "kitchen", method: "GET", path: "/api/menus/{id}", pathParams: ["id"] },
  { name: "create_menu", description: "Create a meal menu", module: "kitchen", method: "POST", path: "/api/menus", passBody: true },
  { name: "update_menu", description: "Update a meal menu", module: "kitchen", method: "PUT", path: "/api/menus/{id}", pathParams: ["id"], passBody: true },
  { name: "delete_menu", description: "Delete a meal menu", module: "kitchen", method: "DELETE", path: "/api/menus/{id}", pathParams: ["id"] },

  // —— Stock ——
  { name: "list_stock_items", description: "List stock items", module: "stock", method: "GET", path: "/api/stock/items" },
  { name: "get_stock_item", description: "Get a stock item", module: "stock", method: "GET", path: "/api/stock/items/{id}", pathParams: ["id"] },
  { name: "create_stock_item", description: "Create a stock item", module: "stock", method: "POST", path: "/api/stock/items", passBody: true },
  { name: "update_stock_item", description: "Update a stock item", module: "stock", method: "PATCH", path: "/api/stock/items/{id}", pathParams: ["id"], passBody: true },
  { name: "delete_stock_item", description: "Delete a stock item", module: "stock", method: "DELETE", path: "/api/stock/items/{id}", pathParams: ["id"] },
  { name: "list_stock_products", description: "List stock products", module: "stock", method: "GET", path: "/api/stock/products" },
  { name: "get_stock_product", description: "Get a stock product", module: "stock", method: "GET", path: "/api/stock/products/{id}", pathParams: ["id"] },
  { name: "create_stock_product", description: "Create a stock product", module: "stock", method: "POST", path: "/api/stock/products", passBody: true },
  { name: "update_stock_product", description: "Update a stock product", module: "stock", method: "PUT", path: "/api/stock/products/{id}", pathParams: ["id"], passBody: true },
  { name: "delete_stock_product", description: "Delete a stock product", module: "stock", method: "DELETE", path: "/api/stock/products/{id}", pathParams: ["id"] },
  { name: "get_stock_inventory", description: "Current inventory snapshot", module: "stock", method: "GET", path: "/api/stock/inventory" },
  { name: "put_stock_ledger", description: "Write/adjust stock ledger (received/used/waste)", module: "stock", method: "PUT", path: "/api/stock/ledger", passBody: true },
  { name: "stock_shopping_list", description: "Shopping list from shortfalls", module: "stock", method: "GET", path: "/api/stock/shopping-list" },
  { name: "stock_reports", description: "Stock reports", module: "stock", method: "GET", path: "/api/stock/reports" },
];

export function toolsForModules(enabled: WorkspaceModuleId[]): McpToolDef[] {
  const set = new Set(enabled);
  return MCP_TOOLS.filter((t) => t.module === "core" || set.has(t.module));
}
