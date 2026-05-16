#!/usr/bin/env node
/**
 * Test Supabase using URL + key from .env.local (no MCP).
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./load-env.mjs";

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or API key in .env.local");
  process.exit(1);
}

console.log("Supabase URL:", url);
console.log("Key prefix:", key.slice(0, 20) + "…");

const supabase = createClient(url, key);

async function main() {
  const { error: authError } = await supabase.auth.getSession();
  if (authError) {
    console.error("Auth client error:", authError.message);
    process.exit(1);
  }
  console.log("✓ Auth client OK");

  const checks = [
    { table: "subscription_plans", label: "subscription_plans" },
    { table: "pgledger_accounts", label: "pgledger (ledger)" },
    { table: "businesses", label: "businesses" },
  ];

  for (const { table, label } of checks) {
    const { error } = await supabase.from(table).select("*", { count: "exact", head: true });
    if (error) {
      console.log(`✗ ${label}: ${error.message}`);
    } else {
      console.log(`✓ ${label} table reachable`);
    }
  }

  const { data: plans, error: plansError } = await supabase
    .from("subscription_plans")
    .select("id, name, price_monthly_cents")
    .limit(5);

  if (!plansError && plans?.length) {
    console.log("\nPlans:", plans.map((p) => `${p.id} ($${p.price_monthly_cents / 100})`).join(", "));
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
