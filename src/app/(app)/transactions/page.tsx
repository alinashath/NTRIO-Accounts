"use client";

import { useBusiness } from "@/components/business-provider";
import { TransactionRow } from "@/components/transaction-row";
import { Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { listTransactions } from "@/lib/api";
import type { BusinessTransaction } from "@/lib/types";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function TransactionsPage() {
  const { activeBusiness, loading } = useBusiness();
  const [transactions, setTransactions] = useState<BusinessTransaction[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeBusiness) return;
    listTransactions(activeBusiness.id, 100)
      .then(setTransactions)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load"),
      );
  }, [activeBusiness]);

  if (loading) {
    return <p className="text-center text-muted">Loading…</p>;
  }

  if (!activeBusiness) {
    return (
      <>
        <PageHeader title="Activity" />
        <Card>
          <p className="text-sm text-muted">Create a business to see transactions.</p>
          <Link href="/businesses/new" className="mt-4 block">
            <Button className="w-full">Add business</Button>
          </Link>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Activity" subtitle="All ledger transactions" />

      {error ? (
        <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {transactions.length === 0 ? (
        <EmptyState
          title="No transactions yet"
          description="Record income, expenses, or transfers from the New tab."
        />
      ) : (
        <Card className="divide-y divide-border !py-0">
          <div className="divide-y divide-border px-1">
            {transactions.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} />
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
