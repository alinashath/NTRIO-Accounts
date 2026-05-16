"use client";

import { useBusiness } from "@/components/business-provider";
import { useAuth } from "@/components/auth-provider";
import { Button, Card, Input, PageHeader } from "@/components/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewBusinessPage() {
  const router = useRouter();
  const { subscription } = useAuth();
  const { setupBusiness, businesses } = useBusiness();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("MVR");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const max = subscription?.max_businesses ?? 1;
  const atLimit = businesses.length >= max;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || atLimit) return;

    setSubmitting(true);
    setError(null);
    try {
      await setupBusiness(name.trim(), currency);
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create business");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="New business"
        subtitle={
          atLimit
            ? `Your plan allows ${max} business${max === 1 ? "" : "es"}. Upgrade to add more.`
            : "Maldives guest house chart of accounts (MVR)"
        }
      />

      {atLimit ? (
        <Card>
          <p className="text-sm text-muted">
            You&apos;ve reached the limit for your {subscription?.plan_name}{" "}
            plan.
          </p>
          <Button
            className="mt-4 w-full"
            onClick={() => router.push("/subscribe")}
          >
            Upgrade plan
          </Button>
        </Card>
      ) : (
        <Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Business name"
              placeholder="Coral Reef Guest House"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Input
              label="Currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              maxLength={3}
              required
            />
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Creating…" : "Create business"}
            </Button>
          </form>
        </Card>
      )}
    </>
  );
}
