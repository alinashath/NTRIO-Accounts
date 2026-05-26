/**
 * One-off generator: PDF text → server/data/ntrio-statement-import.json
 * Run from repo server/: node scripts/generate-ntrio-statement-json.mjs
 *   --stdout  Print JSON to stdout (default: write server/data/ntrio-statement-import.json)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverDir = join(__dirname, "..");
const outDir = join(serverDir, "data");
const outFile = join(outDir, "ntrio-statement-import.json");

const D = {
  feb: "2026-02-28",
  mar: "2026-03-31",
  apr: "2026-04-30",
};

/**
 * Six numbers per row: Feb USD, Feb MVR, Mar USD, Mar MVR, Apr USD, Apr MVR.
 * Statement rule: if the USD cell for a month is empty, the amount is MVR only.
 * If the USD cell has a value, use USD; when `suppressMvrWhenUsd` is true, the MVR
 * cell on the same month is ignored (spreadsheet conversion column, not a second leg).
 * Do not duplicate the same figure into Mar when Mar is blank (common PDF read error).
 *
 * @param {string} refBase
 * @param {object} [opts]
 * @param {boolean} [opts.suppressMvrWhenUsd] when true and USD > 0 for a month, skip MVR for that month
 */
function legs(refBase, kind, category, description, tuple6, merchant = null, opts = {}) {
  const suppressMvrWhenUsd = opts.suppressMvrWhenUsd === true;
  const dates = [D.feb, D.mar, D.apr];
  /** @type {object[]} */
  const entries = [];
  const suf = ["FEB", "MAR", "APR"];
  for (let i = 0; i < 3; i++) {
    const u = tuple6[i * 2] ?? 0;
    const m = tuple6[i * 2 + 1] ?? 0;
    const date = dates[i];
    if (u > 0) {
      entries.push({
        kind,
        date,
        amount: round2(u),
        currency: "USD",
        account_key: "BML_USD",
        category_name: category,
        description,
        merchant,
        statement_ref: `${refBase}-${suf[i]}-USD`,
      });
      if (!suppressMvrWhenUsd && m > 0) {
        entries.push({
          kind,
          date,
          amount: round2(m),
          currency: "MVR",
          account_key: "BML_MVR",
          category_name: category,
          description,
          merchant,
          statement_ref: `${refBase}-${suf[i]}-MVR`,
        });
      }
    } else if (m > 0) {
      entries.push({
        kind,
        date,
        amount: round2(m),
        currency: "MVR",
        account_key: "BML_MVR",
        category_name: category,
        description,
        merchant,
        statement_ref: `${refBase}-${suf[i]}-MVR`,
      });
    }
  }
  return entries;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

const categories = [
  { name: "Sales", kind: "income" },
  { name: "Vendor supplies", kind: "expense" },
  { name: "Safety equipment", kind: "expense" },
  { name: "Groceries", kind: "expense" },
  { name: "Water & beverages", kind: "expense" },
  { name: "Glass & ceramics", kind: "expense" },
  { name: "Stationery", kind: "expense" },
  { name: "Printing & signage", kind: "expense" },
  { name: "Housekeeping supplies", kind: "expense" },
  { name: "Food supplies", kind: "expense" },
  { name: "Transfers & remittances", kind: "expense" },
  { name: "Loan repayments", kind: "expense" },
  { name: "Salaries", kind: "expense" },
  { name: "Staff allowances", kind: "expense" },
  { name: "Utilities", kind: "expense" },
  { name: "Telecom", kind: "expense" },
  { name: "Motor parts", kind: "expense" },
  { name: "Insurance", kind: "expense" },
  { name: "Subscriptions", kind: "expense" },
];

const excluded = [
  {
    label: "Settlement Account - Effimetic Solutions LLP",
    reason: "liability_snapshot",
    amount_text: "505,192.76",
  },
  {
    label: "Settlement Account - Hassan Nawaz",
    reason: "liability_snapshot",
    amount_text: "138,362.00",
  },
  {
    label: "Settlement Account - Mohamed Najaah",
    reason: "liability_snapshot",
    amount_text: "449,788.85",
  },
  {
    label: "Rasheed - Balance",
    reason: "liability_snapshot",
    amount_text: "58,500.00",
  },
  {
    label: "Total Liability as of Now Exclusing Laon",
    reason: "liability_snapshot",
    amount_text: "1,151,843.61",
  },
  {
    label: "Financial Input / Gross Profit (subtotal rows)",
    reason: "derived_subtotal_not_posted",
  },
  {
    label: "Expnese Carry Forward",
    reason: "opening_carryforward_ambiguous",
  },
  {
    label: "Total Expense / Net Profit / Notes block",
    reason: "statement_control_lines",
  },
];

/** @type {object[]} */
const entries = [];

entries.push(
  ...legs(
    "sales",
    "income",
    "Sales",
    "Sales",
    [3335.2, 66704, 2714, 54280, 1668.8, 33376],
  ),
);

entries.push(
  ...legs(
    "grease-trip",
    "expense",
    "Vendor supplies",
    "455 GREASE TRIP ( STELCO SALES CENTER)",
    [0, 5500, 0, 0, 275, 0],
  ),
);
entries.push(
  ...legs(
    "veliga-fire",
    "expense",
    "Safety equipment",
    "455 VELIGA - FIRE EXTINGUISERS",
    [0, 5628.96, 0, 0, 281.45, 0],
  ),
);
entries.push(
  ...legs(
    "unlimit-hardware",
    "expense",
    "Vendor supplies",
    "455 UNLIMIT HARDWARE - DOOR CLOSER",
    [0, 2100.02, 0, 0, 105, 0],
  ),
);
entries.push(
  ...legs(
    "naalu",
    "expense",
    "Vendor supplies",
    "425 NAALU",
    [0, 56, 0, 0, 2.8, 0],
  ),
);
entries.push(
  ...legs(
    "euro-store",
    "expense",
    "Vendor supplies",
    "455 EURO STORE",
    [0, 680, 0, 0, 34, 0],
  ),
);
entries.push(
  ...legs(
    "asters",
    "expense",
    "Vendor supplies",
    "455 ASTERS - Containairs and others",
    [0, 827, 0, 0, 41.35, 0],
  ),
);
entries.push(
  ...legs(
    "mineral-water",
    "expense",
    "Water & beverages",
    "MINERAL WATER - KAREEMEE INVESTMET",
    [520, 390, 0, 0, 910, 45.5],
  ),
);
entries.push(
  ...legs(
    "red-star",
    "expense",
    "Glass & ceramics",
    "RED STAR - Glass other ceramics",
    [0, 2908.74, 0, 0, 145.44, 0],
  ),
);
entries.push(
  ...legs(
    "fathaha",
    "expense",
    "Housekeeping supplies",
    "FATHAHA - STRAW/TRAY and Others",
    [0, 865.75, 0, 0, 43.29, 0],
  ),
);
entries.push(
  ...legs(
    "asrafee",
    "expense",
    "Stationery",
    "Asrafee - Stationary",
    [0, 214.96, 0, 0, 10.75, 0],
  ),
);
entries.push(
  ...legs(
    "sky-print",
    "expense",
    "Printing & signage",
    "SKY Print - Sinage Printing",
    [0, 245.02, 0, 0, 12.25, 0],
  ),
);
entries.push(
  ...legs(
    "items-towel",
    "expense",
    "Housekeeping supplies",
    "ITEMS - Towel Microsfiber",
    [0, 230, 0, 0, 11.5, 0],
  ),
);
entries.push(
  ...legs(
    "butter-portion",
    "expense",
    "Food supplies",
    "Butter Portion - Thohir",
    [0, 520, 0, 0, 26, 0],
  ),
);
entries.push(
  ...legs(
    "sanco",
    "expense",
    "Groceries",
    "SANCO - Groceries",
    [0, 2657, 0, 0, 132.85, 0],
  ),
);
entries.push(
  ...legs(
    "senora-transfer",
    "expense",
    "Transfers & remittances",
    "SENORA - Transfer",
    [170.8, 3416, 677.9, 13558, 0, 16974],
    null,
    { suppressMvrWhenUsd: true },
  ),
);
entries.push(
  ...legs(
    "buggy",
    "expense",
    "Vendor supplies",
    "BUGGY - Ahmed Shareef",
    [180, 330, 0, 0, 510, 25.5],
  ),
);
entries.push(
  ...legs(
    "creamy-bakery",
    "expense",
    "Food supplies",
    "CREAMY BAKERY BUNS",
    [0, 60, 0, 0, 3, 0],
  ),
);
entries.push(
  ...legs(
    "loan-repayment",
    "expense",
    "Loan repayments",
    "Loan Repayment",
    [0, 7504.31, 7000, 14504.31, 725.22, 0],
  ),
);
entries.push(
  ...legs(
    "hassan-lui",
    "expense",
    "Loan repayments",
    "Hassan Nawaz - Lui Repayment",
    [0, 2360, 0, 0, 118, 0],
  ),
);
entries.push(
  ...legs(
    "aishath-lui",
    "expense",
    "Loan repayments",
    "Aishath Fazna - Lui Repayment",
    [6070, 0, 0, 12140, 607, 0],
  ),
);
entries.push(
  ...legs(
    "madheeha",
    "expense",
    "Groceries",
    "MADHEEHA - Groceries",
    [260, 193, 0, 0, 453, 22.65],
  ),
);
entries.push(
  ...legs(
    "new-stand",
    "expense",
    "Groceries",
    "NEW STAND - Groceries",
    [1434, 894, 0, 0, 2328, 116.4],
  ),
);
entries.push(
  ...legs(
    "transfer-siraj",
    "expense",
    "Transfers & remittances",
    "Transfer - Siraj - Folhudhoo - Feridhoo",
    [0, 1500, 0, 0, 75, 0],
  ),
);
entries.push(
  ...legs(
    "salary-amin",
    "expense",
    "Salaries",
    "Salary - Amin",
    [510, 10200, 350, 7000, 0, 17200],
    null,
    { suppressMvrWhenUsd: true },
  ),
);
entries.push(
  { kind: "expense", date: D.feb, amount: 500, currency: "USD", account_key: "BML_USD", category_name: "Staff allowances", description: "Pocket Money - Amin", statement_ref: "pocket-amin-FEB-USD" },
  { kind: "expense", date: D.mar, amount: 500, currency: "USD", account_key: "BML_USD", category_name: "Staff allowances", description: "Pocket Money - Amin", statement_ref: "pocket-amin-MAR-USD" },
  { kind: "expense", date: D.apr, amount: 500, currency: "USD", account_key: "BML_USD", category_name: "Staff allowances", description: "Pocket Money - Amin", statement_ref: "pocket-amin-APR-USD" },
);
entries.push(
  ...legs(
    "salary-nawaz",
    "expense",
    "Salaries",
    "Salary - Nawaz",
    [342.86, 6857.2, 243, 4860, 0, 11717.2],
    null,
    { suppressMvrWhenUsd: true },
  ),
);
entries.push(
  ...legs(
    "salary-zeena",
    "expense",
    "Salaries",
    "Salary - Zeena Ahmed",
    [200, 4000, 250, 5000, 0, 9000],
    null,
    { suppressMvrWhenUsd: true },
  ),
);
entries.push(
  ...legs(
    "washing-machine-screw",
    "expense",
    "Vendor supplies",
    "Washing Machine Screw (Mahibadhoo/Thohir)",
    [0, 150, 0, 0, 7.5, 0],
  ),
);
entries.push(
  ...legs(
    "utility-haali",
    "expense",
    "Utilities",
    "Utility Bill - Haali",
    [2605.3, 4272.45, 6238.95, 13116.7, 655.84, 0],
  ),
);
entries.push(
  ...legs(
    "utility-ntrio",
    "expense",
    "Utilities",
    "Utility Bill - Ntrio",
    [0, 1192.78, 11813.76, 13006.54, 650.33, 0],
  ),
);
entries.push(
  ...legs(
    "insurance-guesthouse",
    "expense",
    "Insurance",
    "Insurance Premium - Guest House",
    [0, 1910, 0, 0, 95.5, 0],
  ),
);
entries.push(
  ...legs(
    "ezee",
    "expense",
    "Subscriptions",
    "Ezee Subscription",
    [50, 1000, 54, 1080, 54, 1080],
    null,
    { suppressMvrWhenUsd: true },
  ),
);

entries.push({
  kind: "expense",
  date: D.apr,
  amount: 277.96,
  currency: "USD",
  account_key: "BML_USD",
  category_name: "Telecom",
  description: "Internet - Dhiraagu",
  statement_ref: "dhiraagu-review-APR-usd",
  needs_review: true,
  notes:
    "PDF shows five numbers (3,853.20 / 853.00 / 853.00 / 5,559.20 / 277.96) without a clear Feb/Mar/Apr USD+MVR pairing; confirm split before posting.",
});

entries.push({
  kind: "expense",
  date: D.mar,
  amount: 510,
  currency: "USD",
  account_key: "BML_USD",
  category_name: "Motor parts",
  description: "Sparks - Mortor Spare",
  statement_ref: "sparks-review-MAR-usd",
  needs_review: true,
  notes:
    "Row has ambiguous columns (510 without decimals vs 510.00 / 25.50); confirm which month and currency.",
});

const doc = {
  meta: {
    source: "Ntrio Statement.pdf (Cashflow Feb–Apr 2026, partner header excluded)",
    batch_tag: "ntrio-import:2026-05-25",
    notes:
      "Six-value tuples: Feb USD, Feb MVR, Mar USD, Mar MVR, Apr USD, Apr MVR. Empty USD → MVR only for that month. For salaries, SENORA, Ezee, etc., when USD is filled the adjacent MVR is conversion-only (suppressMvrWhenUsd in generator). Pocket money is USD-only lines. Totals columns omitted.",
  },
  categories,
  excluded,
  entries,
};

const useStdout = process.argv.includes("--stdout");
if (useStdout) {
  process.stdout.write(JSON.stringify(doc, null, 2) + "\n");
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, JSON.stringify(doc, null, 2), "utf8");
console.log("Wrote", outFile, "entries:", entries.length);
