"use client";

import { useAuth } from "@/components/auth-provider";
import { Button, Card, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { changePlan, listPlans } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import type { SubscriptionPlan } from "@/lib/types";
import clsx from "clsx";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function SubscribePage() {
  const router = useRouter();
  const { subscription, refreshSubscription, user } = useAuth();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listPlans()
      .then(setPlans)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleSelect(planId: string) {
    setUpgrading(planId);
    setError(null);
    try {
      await changePlan(planId);
      await refreshSubscription();
      router.push("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upgrade failed");
    } finally {
      setUpgrading(null);
    }
  }

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 py-8">
      <PageHeader
        title="Choose a plan"
        subtitle={
          subscription?.is_active
            ? "Manage your subscription"
            : "Your trial has ended — pick a plan to continue"
        }
      />

      {user ? (
        <p className="mb-4 text-sm text-muted">Signed in as {user.email}</p>
      ) : null}

      {loading ? (
        <p className="text-center text-muted">Loading plans…</p>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => {
            const isCurrent = subscription?.plan_id === plan.id;
            const price = plan.price_monthly_cents / 100;

            return (
              <Card
                key={plan.id}
                className={clsx(
                  isCurrent && "ring-2 ring-brand-500",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-bold">{plan.name}</h3>
                    <p className="mt-1 text-sm text-muted">{plan.description}</p>
                  </div>
                  <p className="text-right">
                    <span className="text-2xl font-bold tabular-nums">
                      {formatMoney(price, "USD").replace(/\.00$/, "")}
                    </span>
                    <span className="block text-xs text-muted">/month</span>
                  </p>
                </div>

                <ul className="mt-4 space-y-2 text-sm text-slate-700">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-income" />
                    Up to {plan.max_businesses >= 999 ? "unlimited" : plan.max_businesses}{" "}
                    {plan.max_businesses === 1 ? "business" : "businesses"}
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-income" />
                    Double-entry ledger (pgledger)
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-income" />
                    Income, expenses & transfers
                  </li>
                </ul>

                <Button
                  className="mt-4 w-full"
                  variant={isCurrent ? "secondary" : "primary"}
                  disabled={isCurrent || upgrading === plan.id}
                  onClick={() => handleSelect(plan.id)}
                >
                  {isCurrent
                    ? "Current plan"
                    : upgrading === plan.id
                      ? "Updating…"
                      : subscription?.is_active
                        ? "Switch plan"
                        : "Subscribe"}
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      {error ? (
        <p className="mt-4 text-center text-sm text-red-600">{error}</p>
      ) : null}

      <p className="mt-6 text-center text-xs text-muted">
        Stripe billing can be connected via API for production checkout. Plan
        changes apply immediately in this workspace.
      </p>

      <button
        type="button"
        className="mt-6 w-full text-center text-sm text-muted underline"
        onClick={async () => {
          await createClient().auth.signOut();
          router.push("/login");
        }}
      >
        Sign out
      </button>
    </main>
  );
}
