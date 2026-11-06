import { prisma } from "../src/lib/prisma.js";
import { ensureMealMenus } from "../src/services/mealMenus.js";

const u = await prisma.user.findFirst({ where: { email: "ali.nashath@outlook.com" } });
if (!u) throw new Error("no user");
await ensureMealMenus(u.id);

const menus = await prisma.mealMenu.findMany({
  where: { userId: u.id, code: { in: ["maldivian", "continental"] } },
  include: {
    lines: {
      include: {
        stockItem: true,
        componentRecipe: { include: { lines: { include: { stockItem: true } } } },
      },
      orderBy: { sortOrder: "asc" },
    },
  },
});

for (const m of menus) {
  console.log("\n##", m.code);
  for (const l of m.lines) {
    const kind = l.componentRecipeId ? "PREPARED" : l.role === "choice" ? "CHOICE" : "STOCK";
    const map = l.componentRecipe
      ? `${l.componentRecipe.name} [${l.componentRecipe.lines.map((x) => `${x.stockItem.code}:${Number(x.qtyPerServing)}`).join(", ")}]`
      : (l.stockItem?.code ?? "?");
    console.log(
      `  ${l.role.padEnd(7)} ${(l.displayName ?? "").padEnd(24)} ${kind.padEnd(10)} qty=${Number(l.qtyPerServing)} kot=${l.showOnKot} → ${map}`,
    );
  }
}

await prisma.$disconnect();
