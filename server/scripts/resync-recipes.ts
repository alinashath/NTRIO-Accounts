import { PrismaClient } from "@prisma/client";
import { ensureKitchenStockSeed } from "../src/services/kitchenSeed.js";

const prisma = new PrismaClient();
const USER_EMAIL = process.env.BACKFILL_USER_EMAIL ?? "ali.nashath@outlook.com";

async function main() {
  const user = await prisma.user.findFirst({ where: { email: USER_EMAIL } });
  if (!user) throw new Error(`User not found: ${USER_EMAIL}`);
  await ensureKitchenStockSeed(user.id);

  const pancakes = await prisma.recipe.findFirst({
    where: { userId: user.id, code: "pancakes" },
    include: { lines: { include: { stockItem: true } } },
  });
  const extras = await prisma.recipe.findFirst({
    where: { userId: user.id, code: "room_extras" },
    include: {
      lines: {
        where: { stockItem: { code: { in: ["pancake_batch", "potato_portion"] } } },
        include: { stockItem: true, componentRecipe: true },
      },
    },
  });

  console.log("pancakes batch", pancakes?.batchSize);
  console.log(
    "pancake BOM",
    pancakes?.lines.map(
      (l) => `${l.stockItem.code}: ${l.inputQty} ${l.inputUnit} → ${l.qtyPerServing} base`,
    ),
  );
  console.log(
    "extras links",
    extras?.lines.map(
      (l) => `${l.stockItem.code} → ${l.componentRecipe?.code ?? "(none)"}`,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
