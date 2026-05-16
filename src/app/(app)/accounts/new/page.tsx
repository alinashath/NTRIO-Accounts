"use client";

import { useBusiness } from "@/components/business-provider";
import { Button, Card, Input, PageHeader, Select } from "@/components/ui";
import { addAccount } from "@/lib/api";
import { CURRENCIES } from "@/lib/currencies";
import type { AccountCategory } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useState } from "react";

const categories: { value: AccountCategory; label: string }[] = [
  { value: "asset", label: "Asset" },
  { value: "liability", label: "Liability" },
  { value: "equity", label: "Equity" },
  { value: "income", label: "Income" },
  { value: "expense", label: "Expense" },
];

export default function NewAccountPage() {
  const router = useRouter();
  const { activeBusiness } = useBusiness();
  const [category, setCategory] = useState<AccountCategory>("expense");
  const [displayName, setDisplayName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState("");
  const [initialBalance, setInitialBalance] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const baseCurrency = activeBusiness?.currency ?? "MVR";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeBusiness || !displayName.trim()) return;

    const opening =
      category === "asset" ? parseFloat(initialBalance) || 0 : 0;

    setSubmitting(true);
    setError(null);
    try {
      await addAccount({
        businessId: activeBusiness.id,
        category,
        displayName: displayName.trim(),
        code: code.trim() || undefined,
        description: description.trim() || undefined,
        currency: currency || baseCurrency,
        initialBalance: opening > 0 ? opening : undefined,
      });
      router.push("/accounts");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add account");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader title="Add account" subtitle="Chart of accounts" />
      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Select
            label="Type"
            value={category}
            onChange={(e) => setCategory(e.target.value as AccountCategory)}
          >
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
          <Input
            label="Name"
            placeholder="e.g. Snorkeling equipment"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
          <Select
            label="Currency"
            value={currency || baseCurrency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          {category === "asset" ? (
            <Input
              label="Opening balance (optional)"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={initialBalance}
              onChange={(e) => setInitialBalance(e.target.value)}
            />
          ) : null}
          <Input
            label="Code (optional)"
            placeholder="Auto-generated from name"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <Input
            label="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Saving…" : "Save account"}
          </Button>
        </form>
      </Card>
    </>
  );
}
