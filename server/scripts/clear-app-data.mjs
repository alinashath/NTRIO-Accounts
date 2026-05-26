/**
 * Delete application data without dropping tables.
 * Usage:
 *   node scripts/clear-app-data.mjs --user-id <uuid>
 *   CONFIRM_CLEAR_ALL=yes node scripts/clear-app-data.mjs --all
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function parseArgs(argv) {
  let userId = null;
  let all = false;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--all") all = true;
    else if (a === "--user-id" && argv[i + 1]) {
      userId = argv[++i];
    } else if (a.startsWith("--user-id=")) {
      userId = a.slice("--user-id=".length);
    }
  }
  return { userId, all };
}

async function clearForUser(userId) {
  await prisma.$transaction(async (tx) => {
    await tx.debtPayment.deleteMany({ where: { debt: { userId } } });
    await tx.incomeEntry.deleteMany({ where: { userId } });
    await tx.expenseEntry.deleteMany({ where: { userId } });
    await tx.accountTransfer.deleteMany({ where: { userId } });
    await tx.recurringSchedule.deleteMany({ where: { userId } });
    await tx.debt.deleteMany({ where: { userId } });
    await tx.contact.deleteMany({ where: { userId } });
    await tx.account.deleteMany({ where: { userId } });
    await tx.category.deleteMany({ where: { userId } });
    await tx.userSettings.deleteMany({ where: { userId } });
  });
  console.log(`Cleared app data for user ${userId}`);
}

async function clearAll() {
  await prisma.$transaction(async (tx) => {
    await tx.debtPayment.deleteMany();
    await tx.incomeEntry.deleteMany();
    await tx.expenseEntry.deleteMany();
    await tx.accountTransfer.deleteMany();
    await tx.recurringSchedule.deleteMany();
    await tx.debt.deleteMany();
    await tx.contact.deleteMany();
    await tx.account.deleteMany();
    await tx.category.deleteMany();
    await tx.userSettings.deleteMany();
    await tx.user.deleteMany();
  });
  console.log("Cleared all app data (including users).");
}

async function main() {
  const { userId, all } = parseArgs(process.argv);
  if (all) {
    if (process.env.CONFIRM_CLEAR_ALL !== "yes") {
      console.error(
        "Refusing --all without CONFIRM_CLEAR_ALL=yes (set in environment).",
      );
      process.exit(1);
    }
    await clearAll();
  } else if (userId) {
    const u = await prisma.user.findUnique({ where: { id: userId } });
    if (!u) {
      console.error(`No user row for id ${userId}`);
      process.exit(1);
    }
    await clearForUser(userId);
  } else {
    console.error(
      "Usage: node scripts/clear-app-data.mjs --user-id <uuid>\n" +
        "   or: CONFIRM_CLEAR_ALL=yes node scripts/clear-app-data.mjs --all",
    );
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
