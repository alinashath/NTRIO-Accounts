"use client";

import { useAuth } from "@/components/auth-provider";
import { useBusiness } from "@/components/business-provider";
import { Button, Card, Input, PageHeader } from "@/components/ui";
import { updateProfile } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SettingsPage() {
  const router = useRouter();
  const { user, subscription, signOut } = useAuth();
  const { businesses } = useBusiness();
  const [fullName, setFullName] = useState(
    (user?.user_metadata?.full_name as string) ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await updateProfile(fullName);
      setMessage("Profile updated");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <PageHeader title="Settings" subtitle={user?.email ?? ""} />

      <Card className="mb-4">
        <h2 className="font-semibold">Profile</h2>
        <form onSubmit={saveProfile} className="mt-3 space-y-3">
          <Input
            label="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
          {message ? (
            <p className="text-sm text-muted">{message}</p>
          ) : null}
          <Button type="submit" disabled={saving} variant="secondary">
            {saving ? "Saving…" : "Save profile"}
          </Button>
        </form>
      </Card>

      <Card className="mb-4">
        <h2 className="font-semibold">Subscription</h2>
        {subscription ? (
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Plan</dt>
              <dd className="font-medium">{subscription.plan_name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Status</dt>
              <dd className="font-medium capitalize">{subscription.status}</dd>
            </div>
            {subscription.trial_ends_at ? (
              <div className="flex justify-between">
                <dt className="text-muted">Trial ends</dt>
                <dd>{formatDate(subscription.trial_ends_at)}</dd>
              </div>
            ) : null}
            {subscription.current_period_end ? (
              <div className="flex justify-between">
                <dt className="text-muted">Renews</dt>
                <dd>{formatDate(subscription.current_period_end)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt className="text-muted">Price</dt>
              <dd>
                {formatMoney(subscription.price_monthly_cents / 100)}/mo
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-sm text-muted">No subscription found</p>
        )}
        <Link href="/subscribe" className="mt-4 block">
          <Button variant="secondary" className="w-full">
            Change plan
          </Button>
        </Link>
      </Card>

      <Card className="mb-4">
        <h2 className="font-semibold">Businesses</h2>
        <p className="mt-1 text-sm text-muted">
          {businesses.length} of {subscription?.max_businesses ?? "—"} on your
          plan
        </p>
        <ul className="mt-3 divide-y divide-border text-sm">
          {businesses.map((b) => (
            <li key={b.id} className="flex justify-between py-2">
              <span className="font-medium">{b.name}</span>
              <span className="text-muted capitalize">{b.role}</span>
            </li>
          ))}
        </ul>
        <Link href="/businesses/new" className="mt-3 block">
          <Button variant="ghost" className="w-full">
            Add business
          </Button>
        </Link>
      </Card>

      <Button variant="danger" className="w-full" onClick={handleSignOut}>
        Sign out
      </Button>
    </>
  );
}
