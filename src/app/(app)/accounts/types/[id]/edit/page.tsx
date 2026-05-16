"use client";

import { useBusiness } from "@/components/business-provider";
import { Button, Card, Input, PageHeader, Select } from "@/components/ui";
import {
  listAccounts,
  listTransactionCategories,
  updateTransactionCategory,
} from "@/lib/api";
import type { BusinessAccount } from "@/lib/types";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function EditTypePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { activeBusiness } = useBusiness();
  const [name, setName] = useState("");
  const [accountCode, setAccountCode] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [kind, setKind] = useState<"income" | "expense">("income");
  const [accounts, setAccounts] = useState<BusinessAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeBusiness) return;
    Promise.all([
      listTransactionCategories(activeBusiness.id),
      listAccounts(activeBusiness.id),
    ]).then(([cats, accts]) => {
      const cat = cats.find((c) => c.id === id);
      if (cat) {
        setName(cat.name);
        setAccountCode(cat.account_code);
        setIsActive(cat.is_active);
        setKind(cat.kind);
        setAccounts(accts.filter((a) => a.category === cat.kind));
      }
    }).finally(() => setLoading(false));
  }, [activeBusiness, id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await updateTransactionCategory({
        categoryId: id,
        name: name.trim(),
        accountCode,
        isActive,
      });
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
      <PageHeader title="Edit type" subtitle={kind} />
      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Type name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Select
            label="Posts to account"
            value={accountCode}
            onChange={(e) => setAccountCode(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.code} value={a.code}>
                {a.display_name}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded"
            />
            Active
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
