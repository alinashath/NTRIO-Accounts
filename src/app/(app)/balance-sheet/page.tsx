"use client";

import { useBusiness } from "@/components/business-provider";
import { Button, Card, Input, PageHeader } from "@/components/ui";
import { getBalanceSheet, getPeriodSummary } from "@/lib/api";
import { categoryLabel, displayBalance, formatMoney } from "@/lib/format";
import type {
  AccountCategory,
  BalanceSheetRow,
  PeriodGranularity,
  PeriodSummary,
} from "@/lib/types";
import clsx from "clsx";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

const categoryOrder: AccountCategory[] = [
  "asset",
  "liability",
  "equity",
  "income",
  "expense",
];

const periods: { id: PeriodGranularity; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "monthly", label: "Monthly" },
  { id: "quarterly", label: "Quarterly" },
];

export default function BalanceSheetPage() {
  const { activeBusiness, loading } = useBusiness();
  const [period, setPeriod] = useState<PeriodGranularity>("monthly");
  const [referenceDate, setReferenceDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [rows, setRows] = useState<BalanceSheetRow[]>([]);
  const [pl, setPl] = useState<PeriodSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeBusiness) return;
    try {
      const [sheet, summary] = await Promise.all([
        getBalanceSheet(activeBusiness.id),
        getPeriodSummary(activeBusiness.id, period, referenceDate),
      ]);
      setRows(sheet);
      setPl(summary);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, [activeBusiness, period, referenceDate]);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<AccountCategory, BalanceSheetRow[]>();
    for (const cat of categoryOrder) map.set(cat, []);
    for (const row of rows) {
      map.get(row.category)?.push(row);
    }
    return map;
  }, [rows]);

  if (loading) {
    return <p className="text-center text-muted">Loading…</p>;
  }

  if (!activeBusiness) {
    return (
      <>
        <PageHeader title="Reports" subtitle="Balance sheet & P&amp;L" />
        <Card>
          <p className="text-sm text-muted">Create a business first.</p>
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
        title="Reports"
        subtitle={`${activeBusiness.name} · balance sheet & P&L`}
      />

      <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
        {periods.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPeriod(p.id)}
            className={clsx(
              "min-h-10 rounded-lg text-sm font-semibold transition",
              period === p.id
                ? "bg-white text-brand-600 shadow-sm"
                : "text-muted",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <Card className="mb-4">
        <Input
          label="Reference date"
          type="date"
          value={referenceDate}
          onChange={(e) => setReferenceDate(e.target.value)}
        />
        {pl ? (
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4">
            <div>
              <p className="text-xs text-muted">Income</p>
              <p className="text-lg font-semibold text-income tabular-nums">
                {formatMoney(pl.total_income, activeBusiness.currency)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">Expenses</p>
              <p className="text-lg font-semibold text-expense tabular-nums">
                {formatMoney(pl.total_expense, activeBusiness.currency)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">Net ({pl.period_label})</p>
              <p
                className={clsx(
                  "text-lg font-semibold tabular-nums",
                  pl.net >= 0 ? "text-income" : "text-expense",
                )}
              >
                {formatMoney(pl.net, activeBusiness.currency)}
              </p>
            </div>
          </div>
        ) : null}
      </Card>

      {error ? (
        <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
        Balance sheet (current)
      </h2>

      <div className="space-y-5">
        {categoryOrder.map((category) => {
          const items = grouped.get(category) ?? [];
          if (items.length === 0) return null;

          return (
            <section key={category}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                {categoryLabel(category)}
              </h3>
              <Card className="!p-0 overflow-hidden">
                <ul className="divide-y divide-border">
                  {items.map((row) => (
                    <li
                      key={row.account_id}
                      className="flex items-center justify-between px-4 py-3"
                    >
                      <div>
                        <p className="font-medium text-slate-900">
                          {row.display_name}
                        </p>
                        <p className="text-xs text-muted">
                          {row.code} · {row.currency}
                        </p>
                      </div>
                      <p className="font-semibold tabular-nums">
                        {formatMoney(
                          displayBalance(row.balance, category),
                          row.currency,
                        )}
                      </p>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          );
        })}
      </div>
    </>
  );
}
