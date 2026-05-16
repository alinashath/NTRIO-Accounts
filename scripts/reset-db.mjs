#!/usr/bin/env node
/**
 * Runs supabase/reset.sql then all migrations in order.
 * Requires DATABASE_URL or SUPABASE_DB_PASSWORD in .env.local (see migrate.mjs).
 */
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import pg from "pg";
import { loadEnvLocal, projectRoot } from "./load-env.mjs";

loadEnvLocal();
const root = projectRoot();

function projectRef() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.match(
    /https:\/\/([^.]+)\.supabase\.co/,
  )?.[1];
}

function getConnectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const password = process.env.SUPABASE_DB_PASSWORD;
  const ref = projectRef();
  if (!password || !ref) {
    console.error(
      "Set DATABASE_URL or SUPABASE_DB_PASSWORD + NEXT_PUBLIC_SUPABASE_URL in .env.local",
    );
    process.exit(1);
  }
  const region = process.env.SUPABASE_DB_REGION ?? "ap-northeast-1";
  return `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-${region}.pooler.supabase.com:6543/postgres`;
}

async function runSql(client, label, sql) {
  console.log(`→ ${label}`);
  await client.query(sql);
}

async function main() {
  const client = new pg.default.Client({ connectionString: getConnectionString() });
  await client.connect();

  const resetSql = readFileSync(join(root, "supabase/reset.sql"), "utf8");
  await runSql(client, "reset.sql (drop all)", resetSql);

  const migDir = join(root, "supabase/migrations");
  const files = readdirSync(migDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(migDir, file), "utf8");
    await runSql(client, file, sql);
  }

  await client.end();
  console.log("\nDatabase reset complete. Migrations 001–006 applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
