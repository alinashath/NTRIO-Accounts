"use client";

import { useBusiness } from "@/components/business-provider";
import { Button, Card, Input, PageHeader, Select } from "@/components/ui";
import { addTransactionCategory, listAccounts } from "@/lib/api";
import type { BusinessAccount } from "@/lib/types";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function NewTypeForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { activeBusiness } = useBusiness();
  const kind = (params.get("kind") === "expense" ? "expense" : "income") as
    | "income"
    | "expense";

  const [name, setName] = useState("");
  const [accountCode, setAccountCode] = useState("");
  const [accounts, setAccounts] = useState<BusinessAccount[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeBusiness) return;
    listAccounts(activeBusiness.id).then((list) => {
      const filtered = list.filter((a) => a.category === kind);
      setAccounts(filtered);
      if (filtered[0]) setAccountCode(filtered[0].code);
    });
  }, [activeBusiness, kind]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeBusiness || !name.trim() || !accountCode) return;

    setSubmitting(true);
    setError(null);
    try {
      await addTransactionCategory({
        businessId: activeBusiness.id,
        kind,
        name: name.trim(),
        accountCode,
      });
      router.push("/accounts");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title={`Add ${kind} type`}
        subtitle="Used when recording transactions"
      />
      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Type name"
            placeholder={
              kind === "income" ? "e.g. Dive package" : "e.g. Wi-Fi & internet"
            }
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
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Saving…" : "Save type"}
          </Button>
        </form>
      </Card>
    </>
  );
}

export default function NewTypePage() {
  return (
    <Suspense fallback={<p className="text-center text-muted">Loading…</p>}>
      <NewTypeForm />
    </Suspense>
  );
}
