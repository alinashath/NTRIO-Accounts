import { prisma } from "../src/lib/prisma.js";
import { ensureMealMenus } from "../src/services/mealMenus.js";

const users = await prisma.user.findMany({
  where: { breakfastOrders: { some: {} } },
  select: { id: true, email: true },
});
console.log("users with orders", users.length);

for (const u of users) {
  const t0 = Date.now();
  await ensureMealMenus(u.id);
  console.log("ensureMealMenus ms", Date.now() - t0);

  const prepared = await prisma.recipe.findMany({
    where: { userId: u.id, kind: "prepared" },
    include: { lines: { include: { stockItem: true } } },
  });
  console.log("\n===", u.email, "===");
  for (const r of prepared) {
    console.log(
      "prepared",
      r.code,
      r.name,
      "→",
      r.lines.map((l) => `${l.stockItem.code}:${Number(l.qtyPerServing)}`).join(", "),
    );
  }

  const menus = await prisma.mealMenu.findMany({
    where: { userId: u.id, mealPeriod: "breakfast" },
    include: {
      lines: { include: { stockItem: true, componentRecipe: true } },
    },
  });
  for (const m of menus) {
    console.log(
      m.code,
      m.lines.map((l) => {
        const map = l.componentRecipe
          ? `Prepared:${l.componentRecipe.code}`
          : `Stock:${l.stockItem?.code ?? "?"}`;
        return `${l.role}:${l.displayName ?? "?"}=${map}`;
      }),
    );
  }
}

await prisma.$disconnect();
