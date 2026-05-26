/**
 * Import Ntrio statement JSON into income/expense entries (no debt updates).
 *
 * Usage (from server/):
 *   npx tsx src/scripts/import-ntrio-statement.ts --user-id <uuid> --file data/ntrio-statement-import.json
 *   npx tsx src/scripts/import-ntrio-statement.ts --user-id <uuid> --file data/ntrio-statement-import.json --dry-run
 *   npx tsx src/scripts/import-ntrio-statement.ts --user-id <uuid> --file data/ntrio-statement-import.json --include-review
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import "dotenv/config";
import { prisma } from "../lib/prisma.js";
import { toMoney } from "../lib/money.js";
import { recalculateAccountBalance } from "../services/balanceService.js";

type CategoryKind = "income" | "expense";

const fileSchema = z.object({
  meta: z.object({
    source: z.string(),
    batch_tag: z.string(),
    notes: z.string().optional(),
  }),
  categories: z.array(
    z.object({ name: z.string(), kind: z.enum(["income", "expense"]) }),
  ),
  excluded: z
    .array(
      z.object({
        label: z.string(),
        reason: z.string(),
        amount_text: z.string().optional(),
      }),
    )
    .optional(),
  entries: z.array(
    z.object({
      kind: z.enum(["income", "expense"]),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      amount: z.number(),
      currency: z.enum(["USD", "MVR"]),
      account_key: z.enum(["BML_USD", "BML_MVR"]),
      category_name: z.string().nullish(),
      description: z.string().nullish(),
      merchant: z.string().nullish(),
      statement_ref: z.string(),
      needs_review: z.boolean().optional(),
      notes: z.string().optional(),
    }),
  ),
});

type FileShape = z.infer<typeof fileSchema>;

function parseArgs(argv: string[]) {
  let userId: string | null = null;
  let file: string | null = null;
  let dryRun = false;
  let includeReview = false;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    if (a === "--dry-run") dryRun = true;
    else if (a === "--include-review") includeReview = true;
    else if (a === "--user-id") {
      i += 1;
      const next = argv[i];
      if (next) userId = next;
    } else if (a.startsWith("--user-id=")) userId = a.slice("--user-id=".length);
    else if (a === "--file") {
      i += 1;
      const next = argv[i];
      if (next) file = next;
    } else if (a.startsWith("--file=")) file = a.slice("--file=".length);
  }
  return { userId, file, dryRun, includeReview };
}

function stmtTag(ref: string) {
  return `stmt:${ref}`;
}

async function ensureCategory(
  userId: string,
  name: string,
  kind: CategoryKind,
): Promise<string> {
  const existing = await prisma.category.findFirst({
    where: { userId, name, type: kind },
  });
  if (existing) return existing.id;
  const row = await prisma.category.create({
    data: { userId, name, type: kind },
  });
  return row.id;
}

async function ensureAccount(
  userId: string,
  name: string,
  currency: string,
): Promise<string> {
  const existing = await prisma.account.findFirst({
    where: { userId, name },
  });
  if (existing) return existing.id;
  const row = await prisma.account.create({
    data: {
      userId,
      name,
      type: "bank",
      currency,
      openingBalance: 0,
      balance: 0,
    },
  });
  return row.id;
}

async function alreadyImported(
  userId: string,
  statementRef: string,
  kind: "income" | "expense",
): Promise<boolean> {
  const tag = stmtTag(statementRef);
  if (kind === "income") {
    const hit = await prisma.incomeEntry.findFirst({
      where: { userId, tags: { has: tag }, deletedAt: null },
    });
    return !!hit;
  }
  const hit = await prisma.expenseEntry.findFirst({
    where: { userId, tags: { has: tag }, deletedAt: null },
  });
  return !!hit;
}

async function run() {
  const { userId, file, dryRun, includeReview } = parseArgs(process.argv);
  if (!userId || !file) {
    console.error(
      "Usage: tsx src/scripts/import-ntrio-statement.ts --user-id <uuid> --file <path> [--dry-run] [--include-review]",
    );
    process.exit(1);
  }

  const absFile = resolve(process.cwd(), file);
  const raw = readFileSync(absFile, "utf8");
  const parsed = fileSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    console.error(parsed.error.flatten());
    process.exit(1);
  }
  const data: FileShape = parsed.data;

  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) {
    console.error(`No user for id ${userId}`);
    process.exit(1);
  }

  let bmlUsdId: string;
  let bmlMvrId: string;
  if (!dryRun) {
    bmlUsdId = await ensureAccount(userId, "BML USD", "USD");
    bmlMvrId = await ensureAccount(userId, "BML MVR", "MVR");
    for (const c of data.categories) {
      await ensureCategory(userId, c.name, c.kind as CategoryKind);
    }
  } else {
    bmlUsdId = "dry-run";
    bmlMvrId = "dry-run";
  }

  const accountIds = {
    BML_USD: bmlUsdId,
    BML_MVR: bmlMvrId,
  } as const;

  const results: Array<{
    statement_ref: string;
    status: "posted" | "skipped" | "dry_run";
    id?: string;
    reason?: string;
  }> = [];

  for (const e of data.entries) {
    if (e.needs_review && !includeReview) {
      results.push({
        statement_ref: e.statement_ref,
        status: "skipped",
        reason: "needs_review (use --include-review after verifying)",
      });
      continue;
    }
    if (e.amount <= 0) {
      results.push({
        statement_ref: e.statement_ref,
        status: "skipped",
        reason: "non-positive amount",
      });
      continue;
    }

    const tags = [data.meta.batch_tag, stmtTag(e.statement_ref)];

    if (!dryRun && (await alreadyImported(userId, e.statement_ref, e.kind))) {
      results.push({
        statement_ref: e.statement_ref,
        status: "skipped",
        reason: "already imported (stmt tag exists)",
      });
      continue;
    }

    const accountId = accountIds[e.account_key];
    const catId =
      e.category_name && !dryRun
        ? await ensureCategory(
            userId,
            e.category_name,
            e.kind === "income" ? "income" : "expense",
          )
        : null;

    const amount = toMoney(e.amount);
    const date = new Date(`${e.date}T00:00:00Z`);

    if (dryRun) {
      console.log(
        `[dry-run] ${e.kind} ${e.statement_ref} ${amount} ${e.currency} ${e.account_key} ${e.date}`,
      );
      results.push({ statement_ref: e.statement_ref, status: "dry_run" });
      continue;
    }

    if (e.kind === "income") {
      const row = await prisma.incomeEntry.create({
        data: {
          userId,
          amount,
          date,
          receivedDate: date,
          currency: e.currency.toUpperCase(),
          description: e.description ?? null,
          categoryId: catId,
          accountId,
          source: e.merchant ?? null,
          notes: e.notes ?? null,
          tags,
        },
      });
      results.push({
        statement_ref: e.statement_ref,
        status: "posted",
        id: row.id,
      });
    } else {
      const row = await prisma.expenseEntry.create({
        data: {
          userId,
          amount,
          date,
          billDate: date,
          paidDate: date,
          description: e.description ?? null,
          categoryId: catId,
          accountId,
          debtId: null,
          payLater: false,
          billCurrency: e.currency,
          merchant: e.merchant ?? null,
          notes: e.notes ?? null,
          tags,
        },
      });
      results.push({
        statement_ref: e.statement_ref,
        status: "posted",
        id: row.id,
      });
    }
  }

  if (!dryRun) {
    await recalculateAccountBalance(bmlUsdId);
    await recalculateAccountBalance(bmlMvrId);
  }

  const outPath = absFile.replace(/\.json$/i, ".result.json");
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        meta: { ...data.meta, userId, dryRun },
        results,
        posted: results.filter((r) => r.status === "posted").length,
        skipped: results.filter((r) => r.status === "skipped").length,
        dry_run: results.filter((r) => r.status === "dry_run").length,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`Wrote ${outPath}`);
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
