#!/usr/bin/env node
/**
 * Prisma P3015: "Could not find the migration file at migration.sql"
 * — usually an empty migration folder. This script lists dirs under
 * prisma/migrations that are missing migration.sql.
 *
 * Usage (from repo root or server/):
 *   node server/scripts/audit-migrations.mjs
 *   node server/scripts/audit-migrations.mjs --remove-empty
 */
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "prisma", "migrations");
const remove = process.argv.includes("--remove-empty");

const bad = [];
for (const name of readdirSync(migrationsDir)) {
  if (name === "migration_lock.toml" || name.startsWith(".")) continue;
  const full = join(migrationsDir, name);
  if (!statSync(full).isDirectory()) continue;
  const sql = join(full, "migration.sql");
  if (!existsSync(sql)) {
    bad.push(full);
    continue;
  }
  const st = statSync(sql);
  if (st.size === 0) {
    console.warn("Warning: empty migration.sql (may confuse Prisma):", sql);
  }
}

if (!bad.length) {
  console.log("OK: every migration folder has migration.sql");
  process.exit(0);
}

console.error("Missing migration.sql in:");
for (const p of bad) console.error(" ", p);
if (remove) {
  for (const p of bad) {
    rmSync(p, { recursive: true, force: true });
    console.log("Removed:", p);
  }
  console.log("Done. Run: cd server && npx prisma migrate deploy");
} else {
  console.error("\nRe-run with --remove-empty to delete these folders (dev only), or add migration.sql manually.");
  process.exit(1);
}
