/**
 * Prefill StockItem.lastUnitCost from recent bills / receipts + itemized expenses.
 * Run: npx tsx scripts/prefill-stock-unit-costs.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const USER_EMAIL = "ali.nashath@outlook.com";

type PriceHit = {
  /** Match by stock code or exact name (case-insensitive). */
  code?: string;
  name?: string;
  unit_cost: number;
  date: string; // YYYY-MM-DD
  source: string;
  received?: number;
  expenditure?: number;
};

/** Latest wins when sorted by date ascending then applied. */
const PRICES: PriceHit[] = [
  // —— Sanco Traders ST/CR/26-0272 (5 Nov 2026) — Rate excl. GST ——
  { name: "Basmathi Rice", unit_cost: 38.89, date: "2026-11-05", source: "Sanco ST/CR/26-0272", received: 2, expenditure: 77.78 },
  { name: "Noodles", unit_cost: 7.41, date: "2026-11-05", source: "Sanco ST/CR/26-0272", received: 6, expenditure: 44.46 },
  { name: "Spaghetti", unit_cost: 31.48, date: "2026-11-05", source: "Sanco ST/CR/26-0272", received: 2, expenditure: 62.96 },
  { name: "Pasta (Penn)", unit_cost: 31.48, date: "2026-11-05", source: "Sanco ST/CR/26-0272", received: 2, expenditure: 62.96 },
  { name: "fruit cocktail", unit_cost: 44.44, date: "2026-11-05", source: "Sanco ST/CR/26-0272", received: 2, expenditure: 88.88 },
  { name: "Custard", unit_cost: 35.18, date: "2026-11-05", source: "Sanco ST/CR/26-0272", received: 1, expenditure: 35.18 },
  { name: "Tomato Sauce", unit_cost: 25.93, date: "2026-11-05", source: "Sanco ST/CR/26-0272", received: 1, expenditure: 25.93 },
  { name: "Chile Sauce", unit_cost: 29.63, date: "2026-11-05", source: "Sanco ST/CR/26-0272", received: 1, expenditure: 29.63 },
  { name: "Oyster Sauce", unit_cost: 32.41, date: "2026-11-05", source: "Sanco ST/CR/26-0272", received: 1, expenditure: 32.41 },
  { name: "Soy sauce", unit_cost: 46.3, date: "2026-11-05", source: "Sanco ST/CR/26-0272", received: 1, expenditure: 46.3 },
  { code: "potatoes", unit_cost: 16, date: "2026-11-05", source: "Sanco ST/CR/26-0272", received: 5, expenditure: 80 },
  { name: "Peeled Tomato", unit_cost: 22.22, date: "2026-11-05", source: "Sanco ST/CR/26-0272", received: 3, expenditure: 66.66 },
  { name: "Tomato Paste", unit_cost: 53.7, date: "2026-11-05", source: "Sanco ST/CR/26-0272", received: 3, expenditure: 161.1 },
  { code: "banana_essence", unit_cost: 22.22, date: "2026-11-05", source: "Sanco ST/CR/26-0272", received: 2, expenditure: 44.44 },
  { name: "Oregano powder", unit_cost: 32.41, date: "2026-11-05", source: "Sanco ST/CR/26-0272", received: 1, expenditure: 32.41 },
  { name: "Full cream milk", unit_cost: 42, date: "2026-11-05", source: "Sanco ST/CR/26-0272", received: 3, expenditure: 126 },

  // —— Produce bill 4 Nov 2026 (line totals → unit) ——
  { name: "Cucumber", unit_cost: 16.75, date: "2026-11-04", source: "Produce 4 Nov (4×67)", received: 4, expenditure: 67 },
  { name: "Cabbage", unit_cost: 56, date: "2026-11-04", source: "Produce 4 Nov (2×112)", received: 2, expenditure: 112 },
  { name: "Beans", unit_cost: 0.09, date: "2026-11-04", source: "Produce 4 Nov (0.5kg@45 → /g)", received: 500, expenditure: 45 },
  { name: "Carrot", unit_cost: 40, date: "2026-11-04", source: "Produce 4 Nov (1kg@40)", received: 1, expenditure: 40 },
  { name: "Capsicum", unit_cost: 3.125, date: "2026-11-04", source: "Produce 4 Nov (8×25)", received: 8, expenditure: 25 },

  // —— Toilet tissue case 4 Nov 2026 (gst subtotal 245.37 / 48) ——
  { code: "toilet_tissue", unit_cost: 5.112, date: "2026-11-04", source: "Royal toilet roll case 48pcs", received: 48, expenditure: 245.37 },

  // —— Nescafe sachets 4 Nov 2026 ——
  { code: "coffee", unit_cost: 1.85, date: "2026-11-04", source: "Lily F&B Nescafe Classic sachets", received: 100, expenditure: 185 },

  // —— Fathaha FOCUS EXTRA Z FOLD TOWEL (unit rate 41.67 excl. GST) ——
  // Matched to stock item created below if missing: "Z-fold hand towel"
  { name: "Z-fold hand towel", unit_cost: 41.67, date: "2026-11-05", source: "Fathaha FHI/26/POS/C11/31881", received: 2, expenditure: 83.34 },

  // —— Clear single-item expenses (most recent preferred) ——
  { code: "apple", unit_cost: 10, date: "2026-10-10", source: "Expense 4×Apple = 40", received: 4, expenditure: 40 },
  { code: "orange", unit_cost: 6.25, date: "2026-08-01", source: "Expense 8×Orange = 50", received: 8, expenditure: 50 },
  { code: "canned_tuna", unit_cost: 17.2, date: "2026-08-13", source: "Expense 5×Tuna Can = 86", received: 5, expenditure: 86 },
  { code: "bread", unit_cost: 25, date: "2026-11-03", source: "Expense Bread = 25 MVR", received: 1, expenditure: 25 },
  { code: "tea", unit_cost: 1.83, date: "2026-10-09", source: "3×100 teabags = 549.08", received: 300, expenditure: 549.08 },
  { name: "Beans", unit_cost: 0.112, date: "2026-09-18", source: "Expense 500G Beans = 56 → /g", received: 500, expenditure: 56 },
];

function parseYmd(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

async function previousBalance(userId: string, stockItemId: string, before: Date) {
  const prev = await prisma.stockLedgerDay.findFirst({
    where: { userId, stockItemId, date: { lt: before } },
    orderBy: { date: "desc" },
  });
  if (!prev) return 0;
  return Number(prev.opening) + Number(prev.received) - Number(prev.used);
}

async function main() {
  const user = await prisma.user.findFirst({ where: { email: USER_EMAIL } });
  if (!user) throw new Error(`User not found: ${USER_EMAIL}`);

  // Ensure towel from the attached Fathaha bill exists as a stock item.
  const towelName = "Z-fold hand towel";
  let towel = await prisma.stockItem.findFirst({
    where: { userId: user.id, name: { equals: towelName, mode: "insensitive" } },
  });
  if (!towel) {
    towel = await prisma.stockItem.create({
      data: {
        userId: user.id,
        code: "zfold_towel",
        name: towelName,
        unit: "Number",
        kind: "other",
        minStock: 0,
        useNotes: "FOCUS Extra Z-fold hand towel (housekeeping)",
        packInfo: "From Fathaha Home Improvement bills",
        sortOrder: 2000,
      },
    });
    console.log(`Created stock item: ${towel.name}`);
  }

  const items = await prisma.stockItem.findMany({
    where: { userId: user.id, isActive: true },
  });
  const byCode = new Map(items.filter((i) => i.code).map((i) => [i.code!.toLowerCase(), i]));
  const byName = new Map(items.map((i) => [i.name.toLowerCase(), i]));

  // Sort oldest → newest so latest price wins on lastUnitCost.
  const ordered = [...PRICES].sort((a, b) => a.date.localeCompare(b.date));

  const applied: Array<{ name: string; unit_cost: number; source: string; date: string }> = [];
  const missed: string[] = [];

  for (const hit of ordered) {
    const item =
      (hit.code ? byCode.get(hit.code.toLowerCase()) : undefined) ??
      (hit.name ? byName.get(hit.name.toLowerCase()) : undefined);
    if (!item) {
      missed.push(`${hit.code ?? hit.name} (${hit.source})`);
      continue;
    }

    await prisma.stockItem.update({
      where: { id: item.id },
      data: { lastUnitCost: hit.unit_cost },
    });

    const date = parseYmd(hit.date);
    const opening = await previousBalance(user.id, item.id, date);
    const received = hit.received ?? 0;
    const expenditure = hit.expenditure ?? (received > 0 ? received * hit.unit_cost : 0);

    await prisma.stockLedgerDay.upsert({
      where: {
        userId_stockItemId_date: {
          userId: user.id,
          stockItemId: item.id,
          date,
        },
      },
      create: {
        userId: user.id,
        stockItemId: item.id,
        date,
        opening,
        received,
        used: 0,
        waste: 0,
        expenditure,
        unitCost: hit.unit_cost,
        notes: `Prefill from bill: ${hit.source}`,
      },
      update: {
        received: received > 0 ? received : undefined,
        expenditure: expenditure > 0 ? expenditure : undefined,
        unitCost: hit.unit_cost,
        notes: `Prefill from bill: ${hit.source}`,
      },
    });

    applied.push({
      name: item.name,
      unit_cost: hit.unit_cost,
      source: hit.source,
      date: hit.date,
    });
  }

  // Final snapshot
  const updated = await prisma.stockItem.findMany({
    where: { userId: user.id, isActive: true, lastUnitCost: { not: null } },
    orderBy: { name: "asc" },
    select: { name: true, code: true, unit: true, lastUnitCost: true },
  });

  console.log(`Applied ${applied.length} price updates (${new Set(applied.map((a) => a.name)).size} items)`);
  for (const a of applied) {
    console.log(`  ${a.date}  ${a.name.padEnd(22)} @ ${a.unit_cost}  ← ${a.source}`);
  }
  if (missed.length) {
    console.log("\nUnmatched:");
    for (const m of missed) console.log(`  ${m}`);
  }
  console.log(`\nItems with last_unit_cost: ${updated.length}`);
  for (const u of updated) {
    console.log(`  ${u.name} (${u.unit}) = ${u.lastUnitCost}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
