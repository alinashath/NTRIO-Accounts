"use client";

import { useBusiness } from "@/components/business-provider";
import { Button, Card, PageHeader } from "@/components/ui";
import {
  listAccounts,
  listTransactionCategories,
} from "@/lib/api";
import { categoryLabel, displayBalance, formatMoney } from "@/lib/format";
import type {
  AccountCategory,
  BusinessAccount,
  TransactionCategory,
} from "@/lib/types";
import clsx from "clsx";
import { ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

const categoryOrder: AccountCategory[] = [
  "asset",
  "liability",
  "equity",
  "income",
  "expense",
];

type Tab = "chart" | "types";

export default function AccountsPage() {
  const { activeBusiness, loading } = useBusiness();
  const [tab, setTab] = useState<Tab>("chart");
  const [accounts, setAccounts] = useState<BusinessAccount[]>([]);
  const [categories, setCategories] = useState<TransactionCategory[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeBusiness) return;
    try {
      const [accts, cats] = await Promise.all([
        listAccounts(activeBusiness.id, false),
        listTransactionCategories(activeBusiness.id),
      ]);
      setAccounts(accts);
      setCategories(cats);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, [activeBusiness]);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<AccountCategory, BusinessAccount[]>();
    for (const cat of categoryOrder) map.set(cat, []);
    for (const account of accounts.filter((a) => a.is_active !== false)) {
      map.get(account.category)?.push(account);
    }
    return map;
  }, [accounts]);

  const incomeTypes = categories.filter((c) => c.kind === "income");
  const expenseTypes = categories.filter((c) => c.kind === "expense");

  if (loading) {
    return <p className="text-center text-muted">Loading…</p>;
  }

  if (!activeBusiness) {
    return (
      <>
        <PageHeader title="Accounts" subtitle="Chart of accounts" />
        <Card>
          <p className="text-sm text-muted">Create a guest house first.</p>
          <Link href="/businesses/new" className="mt-4 block">
            <Button className="w-full">Add business</Button>
          </Link>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Accounts & types"
        subtitle={`${activeBusiness.name} · ${activeBusiness.currency}`}
      />

      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
        {(
          [
            { id: "chart" as Tab, label: "Chart" },
            { id: "types" as Tab, label: "Types" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={clsx(
              "min-h-10 rounded-lg text-sm font-semibold transition",
              tab === t.id
                ? "bg-white text-brand-600 shadow-sm"
                : "text-muted",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {tab === "chart" ? (
        <>
          <Link href="/accounts/new" className="mb-4 block">
            <Button className="w-full" variant="secondary">
              <Plus className="mr-2 inline h-4 w-4" />
              Add account
            </Button>
          </Link>

          <div className="space-y-5">
            {categoryOrder.map((category) => {
              const items = grouped.get(category) ?? [];
              if (items.length === 0) return null;

              return (
                <section key={category}>
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                    {categoryLabel(category)}
                  </h2>
                  <Card className="!p-0 overflow-hidden">
                    <ul className="divide-y divide-border">
                      {items.map((account) => (
                        <li key={account.id}>
                          <Link
                            href={`/accounts/${account.id}/edit`}
                            className="flex items-center justify-between px-4 py-3 hover:bg-slate-50"
                          >
                            <div>
                              <p className="font-medium text-slate-900">
                                {account.display_name}
                              </p>
                              <p className="text-xs text-muted">
                                {account.code}
                                {account.account_currency &&
                                account.account_currency !== activeBusiness.currency
                                  ? ` · ${account.account_currency}`
                                  : null}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <p
                                className={clsx(
                                  "font-semibold tabular-nums",
                                  category === "income" && "text-income",
                                  category === "expense" && "text-expense",
                                )}
                              >
                                {formatMoney(
                                  displayBalance(account.balance, category),
                                  account.currency,
                                )}
                              </p>
                              <ChevronRight className="h-4 w-4 text-muted" />
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </Card>
                </section>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2">
            <Link href="/accounts/types/new?kind=income">
              <Button variant="secondary" className="w-full text-xs">
                + Income type
              </Button>
            </Link>
            <Link href="/accounts/types/new?kind=expense">
              <Button variant="secondary" className="w-full text-xs">
                + Expense type
              </Button>
            </Link>
          </div>

          <section className="mb-5">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-income">
              Income types
            </h2>
            <Card className="!p-0 overflow-hidden">
              <TypeList items={incomeTypes} />
            </Card>
          </section>

          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-expense">
              Expense types
            </h2>
            <Card className="!p-0 overflow-hidden">
              <TypeList items={expenseTypes} />
            </Card>
          </section>
        </>
      )}
    </>
  );
}

function TypeList({ items }: { items: TransactionCategory[] }) {
  if (items.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-muted">No types yet.</p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={`/accounts/types/${item.id}/edit`}
            className="flex items-center justify-between px-4 py-3 hover:bg-slate-50"
          >
            <div>
              <p className="font-medium text-slate-900">{item.name}</p>
              <p className="text-xs text-muted">→ {item.account_name ?? item.account_code}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
