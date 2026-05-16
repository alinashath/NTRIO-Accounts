#!/usr/bin/env node
/**
 * Run migrations using only .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL (required)
 *   SUPABASE_ACCESS_TOKEN (Dashboard account token) — preferred
 *   — or —
 *   DATABASE_URL / SUPABASE_DB_PASSWORD (direct Postgres)
 */
import { readdirSync, readFileSync } from "fs";
import { resolve, join } from "path";
import { loadEnvLocal, projectRoot } from "./load-env.mjs";

loadEnvLocal();

const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

function projectRef() {
  return publicUrl?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
}

async function runViaManagementApi(sql, name) {
  const ref = projectRef();
  if (!ref || !accessToken) return false;

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );

  const body = await res.text();
  if (!res.ok) {
    throw new Error(`${name}: ${res.status} ${body}`);
  }
  return true;
}

function buildDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const password = process.env.SUPABASE_DB_PASSWORD;
  const ref = projectRef();
  if (!password || !ref) return null;
  const region = process.env.SUPABASE_DB_REGION ?? "ap-northeast-1";
  const encoded = encodeURIComponent(password);
  return `postgresql://postgres.${ref}:${encoded}@aws-0-${region}.pooler.supabase.com:6543/postgres`;
}

async function runViaPostgres(files) {
  const databaseUrl = buildDatabaseUrl();
  if (!databaseUrl) return false;

  const pg = await import("pg");
  const client = new pg.default.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS _ntrio_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const { rows } = await client.query("SELECT name FROM _ntrio_migrations");
  const done = new Set(rows.map((r) => r.name));

  for (const file of files) {
    if (done.has(file)) {
      console.log(`skip  ${file}`);
      continue;
    }
    const sql = readFileSync(join(projectRoot, "supabase/migrations", file), "utf8");
    console.log(`apply ${file} …`);
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO _ntrio_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`  ✓ ${file}`);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }
  await client.end();
  return true;
}

async function runViaApi(files) {
  if (!accessToken) return false;

  let applied = [];
  try {
    const res = await runViaManagementApi(
      "SELECT name FROM _ntrio_migrations ORDER BY name",
      "check",
    );
    if (res === false) return false;
  } catch {
    await runViaManagementApi(
      `CREATE TABLE IF NOT EXISTS _ntrio_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );`,
      "init tracker",
    );
  }

  try {
    const check = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef()}/database/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: "SELECT name FROM _ntrio_migrations" }),
      },
    );
    const data = await check.json();
    if (Array.isArray(data)) applied = data.map((r) => r.name);
  } catch {
    /* fresh */
  }

  const done = new Set(applied);

  for (const file of files) {
    if (done.has(file)) {
      console.log(`skip  ${file}`);
      continue;
    }
    const sql = readFileSync(join(projectRoot, "supabase/migrations", file), "utf8");
    console.log(`apply ${file} …`);
    await runViaManagementApi(sql, file);
    await runViaManagementApi(
      `INSERT INTO _ntrio_migrations (name) VALUES ('${file.replace(/'/g, "''")}') ON CONFLICT DO NOTHING`,
      `${file} tracker`,
    );
    console.log(`  ✓ ${file}`);
  }
  return true;
}

async function main() {
  if (!publicUrl) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL in .env.local");
    process.exit(1);
  }

  const migrationsDir = resolve(projectRoot, "supabase/migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  console.log(`Project: ${projectRef()}\n`);

  if (accessToken) {
    console.log("Using SUPABASE_ACCESS_TOKEN from .env.local\n");
    await runViaApi(files);
    console.log("\nAll migrations applied.");
    return;
  }

  if (buildDatabaseUrl()) {
    console.log("Using DATABASE_URL / SUPABASE_DB_PASSWORD from .env.local\n");
    await runViaPostgres(files);
    console.log("\nAll migrations applied.");
    return;
  }

  console.error(`Add to .env.local (one option):

  SUPABASE_ACCESS_TOKEN=sbp_...   ← Account → Access Tokens (easiest)

  — or —

  SUPABASE_DB_PASSWORD=...      ← Project Settings → Database password
`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
