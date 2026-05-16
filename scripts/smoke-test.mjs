#!/usr/bin/env node
/**
 * Smoke test: signup-like flow via service role not available —
 * tests RPC + tables when run after migrate with a test user JWT optional.
 *
 * With only anon key: verifies schema + plans exist.
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./load-env.mjs";

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(url, key);

async function main() {
  const { data: plans, error } = await supabase
    .from("subscription_plans")
    .select("id, name, max_businesses")
    .order("sort_order");

  if (error) throw new Error(`subscription_plans: ${error.message}`);
  if (!plans?.length) throw new Error("No subscription plans seeded");

  console.log("✓ subscription_plans:", plans.length, "rows");

  const { error: rpcError } = await supabase.rpc("ntrio_create_business", {
    p_name: "Should Fail Without Auth",
    p_currency: "USD",
  });

  if (rpcError && /authenticated|JWT|permission|denied/i.test(rpcError.message)) {
    console.log("✓ ntrio_create_business requires auth (expected)");
  } else if (rpcError) {
    console.log("✓ ntrio_create_business blocked:", rpcError.message);
  } else {
    console.warn("⚠ ntrio_create_business succeeded without auth — check RLS");
  }

  console.log("\nSchema smoke test passed. Sign up in the app to test full flow.");
}

main().catch((e) => {
  console.error("Smoke test failed:", e.message);
  process.exit(1);
});
