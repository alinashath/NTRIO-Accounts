"use client";

import { useBusiness } from "@/components/business-provider";
import { Button, Card, Input, PageHeader } from "@/components/ui";
import {
  listAccounts,
  setOpeningBalance as postOpeningBalance,
  updateAccount,
} from "@/lib/api";
import type { AccountCategory } from "@/lib/types";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function EditAccountPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { activeBusiness } = useBusiness();
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [code, setCode] = useState("");
  const [category, setCategory] = useState<AccountCategory>("asset");
  const [accountCurrency, setAccountCurrency] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [openingBalance, setOpeningBalance] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeBusiness) return;
    listAccounts(activeBusiness.id, false)
      .then((accounts) => {
        const account = accounts.find((a) => a.id === id);
        if (account) {
          setDisplayName(account.display_name);
          setDescription(account.description ?? "");
          setCode(account.code);
          setCategory(account.category);
          setAccountCurrency(account.account_currency ?? account.currency);
          setIsPrimary(account.is_primary);
          setIsActive(account.is_active !== false);
        }
      })
      .finally(() => setLoading(false));
  }, [activeBusiness, id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await updateAccount({
        accountId: id,
        displayName: displayName.trim(),
        description: description.trim() || undefined,
        isPrimary,
        isActive,
      });

      const opening = parseFloat(openingBalance);
      if (category === "asset" && opening > 0) {
        await postOpeningBalance(id, opening);
      }

      router.push("/accounts");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p className="text-center text-muted">Loading…</p>;
  }

  return (
    <>
      <PageHeader title="Edit account" subtitle={code} />
      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
          <p className="text-sm text-muted">
            Currency: <span className="font-medium text-slate-800">{accountCurrency}</span>
          </p>
          {category === "asset" ? (
            <>
              <p className="text-xs text-muted">
                Opening balance posts to equity (use if you skipped it at creation).
              </p>
              <Input
                label="Opening balance"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
              />
            </>
          ) : null}
          <Input
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
              className="h-4 w-4 rounded"
            />
            Primary cash account
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded"
            />
            Active (shown in lists)
          </label>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Saving…" : "Save changes"}
          </Button>
        </form>
      </Card>
    </>
  );
}
