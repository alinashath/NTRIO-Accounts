"use client";

import { useBusiness } from "@/components/business-provider";
import { TransactionRow } from "@/components/transaction-row";
import { Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { getSummary, listTransactions } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import type { BusinessSummary, BusinessTransaction } from "@/lib/types";
import { TrendingDown, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function DashboardPage() {
  const { activeBusiness, loading, error, businesses } = useBusiness();
  const [summary, setSummary] = useState<BusinessSummary | null>(null);
  const [transactions, setTransactions] = useState<BusinessTransaction[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeBusiness) return;
    let cancelled = false;

    async function load() {
      try {
        const [s, txs] = await Promise.all([
          getSummary(activeBusiness!.id),
          listTransactions(activeBusiness!.id, 8),
        ]);
        if (!cancelled) {
          setSummary(s);
          setTransactions(txs);
          setDataError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setDataError(e instanceof Error ? e.message : "Failed to load");
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [activeBusiness]);

  if (loading) {
    return <p className="text-center text-muted">Loading…</p>;
  }

  if (error) {
    return (
      <EmptyState
        title="Connection error"
        description={error}
        action={
          <p className="text-xs text-muted">
            Add Supabase env vars and run migrations.
          </p>
        }
      />
    );
  }

  if (!activeBusiness || businesses.length === 0) {
    return (
      <>
        <PageHeader
          title="Welcome"
          subtitle="Create a business to start bookkeeping"
        />
        <Card>
          <p className="text-sm text-muted">
            Each business gets its own chart of accounts and ledger, powered by
            pgledger double-entry accounting.
          </p>
          <Link href="/businesses/new" className="mt-4 block">
            <Button className="w-full">Create your first business</Button>
          </Link>
        </Card>
      </>
    );
  }

  const currency = summary?.currency ?? activeBusiness.currency;
  const net = (summary?.total_income ?? 0) - (summary?.total_expenses ?? 0);

  return (
    <>
      <PageHeader title={activeBusiness.name} subtitle="Dashboard" />

      {dataError ? (
        <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {dataError}
        </p>
      ) : null}

      <Card className="bg-gradient-to-br from-brand-600 to-brand-700 text-white border-0">
        <p className="text-sm font-medium text-brand-100">Cash on hand</p>
        <p className="mt-1 text-3xl font-bold tabular-nums">
          {formatMoney(summary?.cash_balance ?? 0, currency)}
        </p>
        <p className="mt-3 text-sm text-brand-100">
          Net this period: {formatMoney(net, currency)}
        </p>
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Card className="!p-3">
          <div className="flex items-center gap-2 text-income">
            <TrendingUp className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wide">
              Income
            </span>
          </div>
          <p className="mt-2 text-lg font-bold tabular-nums">
            {formatMoney(summary?.total_income ?? 0, currency)}
          </p>
        </Card>
        <Card className="!p-3">
          <div className="flex items-center gap-2 text-expense">
            <TrendingDown className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wide">
              Expenses
            </span>
          </div>
          <p className="mt-2 text-lg font-bold tabular-nums">
            {formatMoney(summary?.total_expenses ?? 0, currency)}
          </p>
        </Card>
      </div>

      <Card className="mt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-700">
            <Wallet className="h-4 w-4" />
            <span className="font-semibold">Balance sheet</span>
          </div>
        </div>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Assets</dt>
            <dd className="font-medium tabular-nums">
              {formatMoney(summary?.total_assets ?? 0, currency)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Liabilities</dt>
            <dd className="font-medium tabular-nums">
              {formatMoney(summary?.total_liabilities ?? 0, currency)}
            </dd>
          </div>
        </dl>
      </Card>

      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent activity</h2>
          <Link href="/transactions">
            <Button variant="ghost" className="!min-h-8 !px-2 text-xs">
              See all
            </Button>
          </Link>
        </div>
        <Card className="divide-y divide-border !py-0">
          {transactions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">
              No transactions yet. Record income or an expense.
            </p>
          ) : (
            <div className="divide-y divide-border px-1">
              {transactions.map((tx) => (
                <TransactionRow key={tx.id} tx={tx} />
              ))}
            </div>
          )}
        </Card>
      </section>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Link href="/new?type=income">
          <Button className="w-full" variant="secondary">
            + Income
          </Button>
        </Link>
        <Link href="/new?type=expense">
          <Button className="w-full" variant="secondary">
            − Expense
          </Button>
        </Link>
      </div>
    </>
  );
}
