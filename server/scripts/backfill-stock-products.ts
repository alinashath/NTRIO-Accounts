/**
 * Create / price StockProduct rows from kitchen catalog, grocery bill hints,
 * and past stock ledger data.
 *
 * Run: npx tsx scripts/backfill-stock-products.ts
 */
import { PrismaClient } from "@prisma/client";
import { ensureKitchenStockSeed } from "../src/services/kitchenSeed.js";
import { ensureProductsFromHistory } from "../src/services/stockProductBackfill.js";

const prisma = new PrismaClient();
const USER_EMAIL = process.env.BACKFILL_USER_EMAIL ?? "ali.nashath@outlook.com";

async function main() {
  const user = await prisma.user.findFirst({ where: { email: USER_EMAIL } });
  if (!user) throw new Error(`User not found: ${USER_EMAIL}`);

  console.log(`Seeding catalog + backfilling products for ${USER_EMAIL}…`);
  await ensureKitchenStockSeed(user.id);
  // ensureKitchenStockSeed already calls ensureProductsFromHistory; run once more
  // so the log reflects a dedicated pass after seed products exist.
  const result = await ensureProductsFromHistory(user.id);

  // Clear absurd auto-prices (e.g. bottle unit-cost applied to a 50 ml seed product).
  const cleared = await prisma.stockProduct.updateMany({
    where: {
      userId: user.id,
      isActive: true,
      name: { in: ["Banana essence 50 ml"] },
      defaultPrice: { gt: 100 },
    },
    data: { defaultPrice: null },
  });
  if (cleared.count) console.log(`Cleared ${cleared.count} bad auto-prices`);

  const products = await prisma.stockProduct.findMany({
    where: { userId: user.id, isActive: true },
    include: { stockItem: { select: { name: true, code: true } } },
    orderBy: [{ stockItem: { name: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
  });

  console.log(
    `Created: ${result.created}; priced: ${result.priced}; deduped: ${result.deduped}`,
  );
  console.log(`Total active products: ${products.length}`);
  for (const p of products) {
    const price = p.defaultPrice != null ? String(p.defaultPrice) : "—";
    console.log(
      `  ${p.stockItem.name.padEnd(24)} → ${p.name} · ${p.qty} ${p.unitCode} @ ${price}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
