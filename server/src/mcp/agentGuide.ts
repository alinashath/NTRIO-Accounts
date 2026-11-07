import { MCP_TOOLS } from "./catalog.js";

/**
 * Single MCP tool payload that teaches agents how to operate the whole NTRIO app.
 */
export function buildAgentGuide(opts?: { task?: string | null }): string {
  const task = opts?.task?.trim().toLowerCase() || null;

  const sections: Record<string, string> = {
    overview: `# NTRIO Accounts — agent operating guide

You are connected to one organization via MCP OAuth (scope \`org\`).
All money, kitchen, occupancy, and stock tools write the organization's shared books.

## First steps (always)
1. Call \`ntrio_howto\` with no args (or \`task: "overview"\`) if you need this guide again.
2. Call \`get_settings\` to learn org title, FX rate, GST, and enabled features.
3. Call \`list_accounts\`, \`list_categories\`, and \`list_contacts\` before creating entries so you reuse existing IDs.
4. Prefer tools over inventing URLs. Every mutating tool maps to the real HTTP API.

## Tool calling convention
- Path IDs are top-level args: \`id\`, \`paymentId\`, etc.
- Extra query/body fields go in \`params\` (object), e.g. \`{ "params": { "from": "2026-01-01", "to": "2026-01-31" } }\`.
- Dates are \`YYYY-MM-DD\`. Money amounts are decimal numbers (2 places for cash).
- Credit/income is money in; debit/expense is money out.
- Soft-deleted / voided rows are excluded unless you pass status filters where supported.

## Receipts
1. \`upload_receipt\` with base64 → get \`attachment_url\`.
2. Pass that URL on \`create_income\`, \`create_expense\`, or \`add_debt_payment\`.
3. \`read_receipt\` with the URL to visually inspect the image/PDF before booking.

## Modules
Tools are filtered by the org's enabled modules: accounts, occupancy, kitchen, stock.
`,

    accounts: `## Accounts & cash
- \`list_accounts\` / \`get_account\` / \`create_account\` / \`update_account\` / \`delete_account\`
- \`transfer_between_accounts\` for wallet↔bank moves (include FX rate when currencies differ)
- \`get_account_ledger\` for a statement
- \`create_account_adjustment\` to correct opening/balance without a transfer

Typical create body (via params):
\`{ "name": "Cash MVR", "type": "cash", "currency": "MVR" }\`
`,

    income: `## Income (money in)
1. \`list_categories\` (kind income) and \`list_accounts\` / \`list_contacts\` / \`list_projects\`
2. Optional: \`upload_receipt\` → \`attachment_url\`
3. \`create_income\` with date, amount, currency, account_id, category_id, optional contact/project, notes, attachment_url, GST fields if applicable
4. Fix mistakes with \`update_income\`; cancel with \`void_income\` (or \`unvoid_income\`); remove with \`delete_income\`
5. \`list_income\` with date filters in params
`,

    expenses: `## Expenses (money out)
Same flow as income using \`create_expense\` / \`update_expense\` / \`void_expense\` / \`list_expenses\`.
Pay-later vendor bills may link to contacts and later settle via contact settlement tools.
`,

    contacts: `## Contacts (vendors / customers)
- \`list_contacts\`, \`create_contact\`, \`update_contact\`, \`delete_contact\`
- \`get_contact_statement\` for activity
- \`settle_contact_expenses\` / \`merge_pay_later_bills\` for vendor pay-later workflows
`,

    debts: `## Debts
- \`list_debts\` / \`get_debt\` / \`create_debt\` / \`update_debt\` / \`merge_debts\` / \`add_debt_principal\`
- Payments: \`add_debt_payment\` (optional receipt), \`list_debt_payments\`, \`update_debt_payment\`, \`void_debt_payment\`
`,

    reports: `## Reports
Use date range params \`from\` / \`to\` (YYYY-MM-DD):
- \`report_pnl\`, \`report_cashflow\`, \`report_balance_sheet\`, \`report_net_worth\`
- \`report_category_breakdown\`, \`report_category_detail\`
- Maldives: \`report_mira_gst\`, \`export_mira_gst\` (xlsx base64), \`report_mira_green_tax\`, \`export_mira_green_tax\`
- \`export_report\` for CSV (PDF may be unimplemented)
`,

    kitchen: `## Kitchen orders & recipes
Occupancy first (rooms occupied) then orders:
1. \`list_rooms\` / \`create_room\` as needed
2. \`get_kitchen_day\` / \`put_occupancy\` / \`list_stays\` / \`create_stay\`
3. \`create_kitchen_order\` / \`update_kitchen_order\` / \`delete_kitchen_order\`
4. \`put_room_extras\` for meal extras
5. \`kitchen_summaries\`, \`kitchen_requirements\`, then \`kitchen_apply_usage\` to deduct stock
6. Recipes: \`list_recipes\` / \`create_recipe\` / \`update_recipe\` / \`delete_recipe\`
7. Menus: \`list_menus\` / \`create_menu\` / \`update_menu\` / \`delete_menu\`
8. One-time: \`kitchen_seed\` if catalog empty
`,

    occupancy: `## Occupancy
- Manage rooms with \`list_rooms\`, \`create_room\`, \`delete_room\`
- Calendar day: \`get_kitchen_day\`, \`put_occupancy\`
- Stays: \`list_stays\`, \`create_stay\`, \`delete_stay\`
`,

    stock: `## Stock & inventory
- Items: \`list_stock_items\`, \`create_stock_item\`, \`update_stock_item\`, \`delete_stock_item\`
- Products (purchase packs): \`list_stock_products\` … create/update/delete
- Snapshot: \`get_stock_inventory\`
- Adjust received/used/waste: \`put_stock_ledger\`
- Planning: \`stock_shopping_list\`, \`stock_reports\`
Quantities are in base units (g / ml / pcs) unless the tool docs say otherwise.
`,

    settings: `## Settings (read/update org prefs)
- \`get_settings\`, \`patch_settings\` (FX, GST TIN, green tax flags, title)
- \`list_organizations\` if the token can see org list
MCP tokens cannot create/disable MCP users — that is Settings → MCP access in the web app only.
`,

    catalog: `## Full tool catalog
${MCP_TOOLS.map((t) => `- \`${t.name}\` — ${t.description} [${t.method} ${t.path}]`).join("\n")}

Also always available:
- \`ntrio_howto\` — this guide
- \`upload_receipt\` / \`read_receipt\` — attachments
`,
  };

  if (!task || task === "all" || task === "overview") {
    return [
      sections.overview,
      sections.accounts,
      sections.income,
      sections.expenses,
      sections.contacts,
      sections.debts,
      sections.reports,
      sections.occupancy,
      sections.kitchen,
      sections.stock,
      sections.settings,
      sections.catalog,
    ].join("\n");
  }

  // fuzzy match section keys and tool names
  const key = Object.keys(sections).find((k) => task.includes(k) || k.includes(task));
  if (key) return `${sections.overview}\n${sections[key]}`;

  const toolHits = MCP_TOOLS.filter(
    (t) =>
      t.name.includes(task.replace(/\s+/g, "_")) ||
      t.description.toLowerCase().includes(task) ||
      t.path.includes(task),
  );
  if (toolHits.length) {
    return [
      sections.overview,
      `## Matching tools for "${opts?.task}"`,
      ...toolHits.map(
        (t) =>
          `### \`${t.name}\`\n${t.description}\nHTTP: \`${t.method} ${t.path}\`\nPass path params as top-level args; other fields in \`params\`.`,
      ),
    ].join("\n\n");
  }

  return `${sections.overview}\nNo section matched "${opts?.task}". Try task: overview | accounts | income | expenses | contacts | debts | reports | kitchen | occupancy | stock | settings | catalog`;
}
