"use client";

import { useBusiness } from "@/components/business-provider";
import { ReceiptUpload } from "@/components/receipt-upload";
import { Button, Card, Input, PageHeader, Select } from "@/components/ui";
import Link from "next/link";
import {
  listAccounts,
  listTransactionCategories,
  recordExpense,
  recordIncome,
  recordTransfer,
  uploadReceipt,
} from "@/lib/api";
import type { BusinessAccount, TransactionCategory } from "@/lib/types";
import clsx from "clsx";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

type FormType = "income" | "expense" | "transfer";

function NewTransactionForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { activeBusiness } = useBusiness();
  const [type, setType] = useState<FormType>(
    (params.get("type") as FormType) || "income",
  );
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [incomeType, setIncomeType] = useState("");
  const [expenseType, setExpenseType] = useState("");
  const [fromAccount, setFromAccount] = useState("cash");
  const [toAccount, setToAccount] = useState("bank");
  const [exchangeRate, setExchangeRate] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [assetAccounts, setAssetAccounts] = useState<BusinessAccount[]>([]);
  const [incomeCategories, setIncomeCategories] = useState<TransactionCategory[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<TransactionCategory[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = params.get("type") as FormType | null;
    if (t && ["income", "expense", "transfer"].includes(t)) setType(t);
  }, [params]);

  useEffect(() => {
    if (!activeBusiness) return;
    Promise.all([
      listAccounts(activeBusiness.id),
      listTransactionCategories(activeBusiness.id, "income"),
      listTransactionCategories(activeBusiness.id, "expense"),
    ]).then(([accounts, income, expense]) => {
      const assets = accounts.filter((a) => a.category === "asset");
      setAssetAccounts(assets);
      setIncomeCategories(income);
      setExpenseCategories(expense);
      if (income[0]) setIncomeType(income[0].name);
      if (expense[0]) setExpenseType(expense[0].name);
      if (assets[0]) setFromAccount(assets[0].code);
      if (assets[1]) setToAccount(assets[1].code);
    });
  }, [activeBusiness]);

  const fromMeta = assetAccounts.find((a) => a.code === fromAccount);
  const toMeta = assetAccounts.find((a) => a.code === toAccount);
  const crossCurrency = useMemo(() => {
    if (!fromMeta || !toMeta) return false;
    const fc = fromMeta.account_currency ?? fromMeta.currency;
    const tc = toMeta.account_currency ?? toMeta.currency;
    return fc !== tc;
  }, [fromMeta, toMeta]);

  const convertedPreview = useMemo(() => {
    const amt = parseFloat(amount);
    const rate = parseFloat(exchangeRate);
    if (!crossCurrency || !amt || !rate) return null;
    return (amt * rate).toFixed(2);
  }, [amount, exchangeRate, crossCurrency]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeBusiness) return;

    const value = parseFloat(amount);
    if (!value || value <= 0) {
      setError("Enter a valid amount");
      return;
    }

    if (type === "transfer" && crossCurrency) {
      const rate = parseFloat(exchangeRate);
      if (!rate || rate <= 0) {
        setError("Enter the exchange rate for this currency pair");
        return;
      }
    }

    setSubmitting(true);
    setError(null);

    try {
      let transferId: string | null = null;

      if (type === "income") {
        transferId = await recordIncome({
          businessId: activeBusiness.id,
          amount: value,
          description: description || undefined,
          category: incomeType,
        });
      } else if (type === "expense") {
        const cat = expenseCategories.find((c) => c.name === expenseType);
        transferId = await recordExpense({
          businessId: activeBusiness.id,
          amount: value,
          description: description || undefined,
          category: expenseType,
          expenseAccount: cat?.account_code,
        });
      } else {
        transferId = await recordTransfer({
          businessId: activeBusiness.id,
          amount: value,
          fromAccount,
          toAccount,
          description: description || undefined,
          exchangeRate: crossCurrency ? parseFloat(exchangeRate) : undefined,
        });
      }

      if (receiptFile && transferId) {
        await uploadReceipt(activeBusiness.id, transferId, receiptFile);
      }

      router.push("/transactions");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  if (!activeBusiness) {
    return (
      <Card>
        <p className="text-sm text-muted">Select or create a business first.</p>
        <Link href="/businesses/new" className="mt-4 block">
          <Button className="w-full">Add business</Button>
        </Link>
      </Card>
    );
  }

  const tabs: { id: FormType; label: string }[] = [
    { id: "income", label: "Income" },
    { id: "expense", label: "Expense" },
    { id: "transfer", label: "Transfer" },
  ];

  return (
    <>
      <PageHeader title="New transaction" />

      <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setType(tab.id)}
            className={clsx(
              "min-h-10 rounded-lg text-sm font-semibold transition",
              type === tab.id
                ? "bg-white text-brand-600 shadow-sm"
                : "text-muted",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Amount"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />

          <Input
            label="Description"
            placeholder="Guest name, booking ref, etc."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          {type === "income" ? (
            <Select
              label="Income type"
              value={incomeType}
              onChange={(e) => setIncomeType(e.target.value)}
            >
              {incomeCategories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </Select>
          ) : null}

          {type === "expense" ? (
            <Select
              label="Expense type"
              value={expenseType}
              onChange={(e) => setExpenseType(e.target.value)}
            >
              {expenseCategories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </Select>
          ) : null}

          {type === "transfer" ? (
            <>
              <Select
                label="From account"
                value={fromAccount}
                onChange={(e) => setFromAccount(e.target.value)}
              >
                {assetAccounts.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.display_name} ({a.account_currency ?? a.currency})
                  </option>
                ))}
              </Select>
              <Select
                label="To account"
                value={toAccount}
                onChange={(e) => setToAccount(e.target.value)}
              >
                {assetAccounts.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.display_name} ({a.account_currency ?? a.currency})
                  </option>
                ))}
              </Select>
              {crossCurrency ? (
                <>
                  <p className="text-sm text-amber-800 rounded-lg bg-amber-50 px-3 py-2">
                    Different currencies: {fromMeta?.account_currency ?? fromMeta?.currency}{" "}
                    → {toMeta?.account_currency ?? toMeta?.currency}. Enter how many units of
                    the destination currency you receive per 1 unit sent.
                  </p>
                  <Input
                    label={`Exchange rate (1 ${fromMeta?.account_currency ?? fromMeta?.currency} = ? ${toMeta?.account_currency ?? toMeta?.currency})`}
                    type="number"
                    inputMode="decimal"
                    step="0.0001"
                    min="0.0001"
                    placeholder="e.g. 15.42"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(e.target.value)}
                    required
                  />
                  {convertedPreview ? (
                    <p className="text-sm text-muted">
                      Recipient gets approximately{" "}
                      <span className="font-medium text-slate-800">
                        {convertedPreview} {toMeta?.account_currency ?? toMeta?.currency}
                      </span>
                    </p>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}

          {type !== "transfer" ? (
            <ReceiptUpload file={receiptFile} onChange={setReceiptFile} />
          ) : null}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Saving…" : "Save transaction"}
          </Button>
        </form>
      </Card>

      <p className="mt-3 text-center text-xs text-muted">
        <Link href="/accounts" className="text-brand-600">
          Manage accounts & types
        </Link>
      </p>
    </>
  );
}

export default function NewPage() {
  return (
    <Suspense fallback={<p className="text-center text-muted">Loading…</p>}>
      <NewTransactionForm />
    </Suspense>
  );
}
