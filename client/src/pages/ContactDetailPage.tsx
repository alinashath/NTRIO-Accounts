import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "@/api/http";
import { Dropdown, type DropdownOption } from "@/components/Dropdown";
import { DisplayAmountCell } from "@/components/DisplayAmountCell";
import { Button, Card, TextField } from "@/components/ui";
import type { AccountDto, ContactStatementDto } from "../../../shared/types";

export function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [statementData, setStatementData] = useState<ContactStatementDto | null>(null);
  const [statementAccounts, setStatementAccounts] = useState<AccountDto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPendingIds, setSelectedPendingIds] = useState<string[]>([]);
  const [settleAccountId, setSettleAccountId] = useState("");
  const [settlePaidDate, setSettlePaidDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [settleBusy, setSettleBusy] = useState(false);
  const [mergeBusy, setMergeBusy] = useState(false);

  const loadStatement = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<ContactStatementDto>(`/api/contacts/${id}/statement`);
      setStatementData(data);
      if (data.contact.kind === "vendor") {
        const accs = await apiFetch<AccountDto[]>("/api/accounts");
        setStatementAccounts(accs);
      } else {
        setStatementAccounts(null);
      }
      setSelectedPendingIds([]);
      setSettleAccountId("");
      setSettlePaidDate(new Date().toISOString().slice(0, 10));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setStatementData(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadStatement();
  }, [loadStatement]);

  const pendingVendorBillIds = useMemo(
    () =>
      statementData?.lines.filter((l) => l.kind === "expense" && l.pay_later).map((l) => l.id) ?? [],
    [statementData],
  );

  const selectionBillCurrency = useMemo(() => {
    if (!statementData || selectedPendingIds.length === 0) return null;
    const ccys = new Set<string>();
    for (const pid of selectedPendingIds) {
      const ln = statementData.lines.find((l) => l.id === pid && l.kind === "expense" && l.pay_later);
      if (ln?.currency) ccys.add(ln.currency.toUpperCase());
    }
    if (ccys.size !== 1) return null;
    return [...ccys][0]!;
  }, [statementData, selectedPendingIds]);

  const settleAccountOptions: DropdownOption[] = useMemo(() => {
    if (!statementAccounts?.length) return [];
    const ccy = selectionBillCurrency?.toUpperCase();
    const list = ccy ? statementAccounts.filter((a) => a.currency.toUpperCase() === ccy) : statementAccounts;
    return list.map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` }));
  }, [statementAccounts, selectionBillCurrency]);

  useEffect(() => {
    if (!settleAccountId) return;
    if (!settleAccountOptions.some((o) => o.value === settleAccountId)) {
      setSettleAccountId("");
    }
  }, [settleAccountId, settleAccountOptions]);

  async function settleSelectedVendorBills() {
    if (!id || !statementData || statementData.contact.kind !== "vendor") return;
    if (selectedPendingIds.length === 0) {
      setError("Select at least one unpaid bill.");
      return;
    }
    if (!selectionBillCurrency) {
      setError("Selected bills use different currencies. Settle one currency at a time.");
      return;
    }
    if (!settleAccountId) {
      setError("Choose the account you paid from.");
      return;
    }
    setSettleBusy(true);
    setError(null);
    try {
      await apiFetch<{ settled: number }>(`/api/contacts/${id}/settle-expenses`, {
        method: "POST",
        body: JSON.stringify({
          expense_ids: selectedPendingIds,
          account_id: settleAccountId,
          paid_date: settlePaidDate,
        }),
      });
      await loadStatement();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to settle");
    } finally {
      setSettleBusy(false);
    }
  }

  async function mergeSelectedPayLater() {
    if (!id || !statementData || statementData.contact.kind !== "vendor") return;
    if (selectedPendingIds.length < 2) {
      setError("Select at least two unpaid pay-later bills to merge into one.");
      return;
    }
    if (!selectionBillCurrency) {
      setError("Selected bills use different currencies.");
      return;
    }
    if (!window.confirm("Merge these bills into a single unpaid bill? The originals will be removed from the list.")) {
      return;
    }
    setMergeBusy(true);
    setError(null);
    try {
      await apiFetch<{ id: string }>(`/api/contacts/${id}/merge-pay-later-bills`, {
        method: "POST",
        body: JSON.stringify({ expense_ids: selectedPendingIds }),
      });
      await loadStatement();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to merge");
    } finally {
      setMergeBusy(false);
    }
  }

  if (!id) {
    return (
      <p className="text-sm text-red-600">
        Missing contact id. <Link to="/contacts" className="font-medium text-sky-700 underline">Back to contacts</Link>
      </p>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <Link to="/contacts" className="text-sm font-medium text-sky-700 hover:underline">
          ← Contacts
        </Link>
        <h2 className="mt-1 text-lg font-bold text-slate-900 md:text-xl">
          {loading ? "Loading…" : statementData ? statementData.contact.name : "Contact"}
        </h2>
        {statementData ? (
          <p className="text-sm capitalize text-slate-600">{statementData.contact.kind} · Statement</p>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-slate-600">Loading…</p>
      ) : statementData ? (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <p className="capitalize">
                <span className="font-medium text-slate-900">Type:</span> {statementData.contact.kind}
              </p>
              {statementData.contact.email ? (
                <p>
                  <span className="font-medium text-slate-900">Email:</span> {statementData.contact.email}
                </p>
              ) : null}
              {statementData.contact.phone ? (
                <p>
                  <span className="font-medium text-slate-900">Phone:</span> {statementData.contact.phone}
                </p>
              ) : null}
              {statementData.contact.tgst_number ? (
                <p>
                  <span className="font-medium text-slate-900">TGST:</span> {statementData.contact.tgst_number}
                </p>
              ) : null}
              {statementData.contact.notes ? (
                <p className="mt-1 text-xs text-slate-600">{statementData.contact.notes}</p>
              ) : null}
            </div>
          </Card>

          {statementData.contact.kind === "vendor" && pendingVendorBillIds.length > 0 ? (
            <Card className="border-amber-200 bg-amber-50/80 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-amber-950">Pending payments (unpaid bills)</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-xs"
                    onClick={() => setSelectedPendingIds([...pendingVendorBillIds])}
                  >
                    Select all
                  </Button>
                  <Button type="button" variant="ghost" className="text-xs" onClick={() => setSelectedPendingIds([])}>
                    Clear
                  </Button>
                </div>
              </div>
              <div className="max-h-48 overflow-auto rounded border border-amber-200/80 bg-white">
                <table className="min-w-full text-left text-xs">
                  <thead className="sticky top-0 bg-amber-100/90 text-amber-950">
                    <tr>
                      <th className="w-10 px-2 py-1.5" aria-label="Select" />
                      <th className="px-2 py-1.5">Bill date</th>
                      <th className="px-2 py-1.5">Description</th>
                      <th className="px-2 py-1.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statementData.lines
                      .filter((l) => l.kind === "expense" && l.pay_later)
                      .map((ln) => (
                        <tr key={ln.id} className="border-t border-amber-100">
                          <td className="px-2 py-1.5 align-middle">
                            <input
                              type="checkbox"
                              className="rounded border-slate-300"
                              checked={selectedPendingIds.includes(ln.id)}
                              onChange={() => {
                                setSelectedPendingIds((prev) =>
                                  prev.includes(ln.id) ? prev.filter((x) => x !== ln.id) : [...prev, ln.id],
                                );
                              }}
                              aria-label={`Select bill ${ln.description ?? ln.id}`}
                            />
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-slate-700">{ln.bill_date ?? ln.date}</td>
                          <td className="max-w-[12rem] truncate px-2 py-1.5 text-slate-800">{ln.description ?? "—"}</td>
                          <td className="px-2 py-1.5 text-right">
                            <DisplayAmountCell
                              amount={ln.amount}
                              nativeCurrency={ln.currency}
                              tone="negative"
                              className="font-medium"
                            />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Dropdown
                  label="Paid from"
                  value={settleAccountId}
                  onChange={setSettleAccountId}
                  options={settleAccountOptions}
                  disabled={settleAccountOptions.length === 0}
                  required={false}
                />
                <TextField
                  label="Payment date"
                  type="date"
                  value={settlePaidDate}
                  onChange={(e) => setSettlePaidDate(e.target.value)}
                />
              </div>
              {selectedPendingIds.length > 0 && !selectionBillCurrency ? (
                <p className="text-xs text-red-700">Unpaid bills in different currencies cannot be settled together.</p>
              ) : null}
              {selectedPendingIds.length > 0 && selectionBillCurrency && settleAccountOptions.length === 0 ? (
                <p className="text-xs text-amber-900">
                  No {selectionBillCurrency} account found. Add a bank or cash account in that currency to record
                  payment.
                </p>
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button
                  type="button"
                  disabled={
                    settleBusy ||
                    mergeBusy ||
                    selectedPendingIds.length === 0 ||
                    !selectionBillCurrency ||
                    !settleAccountId ||
                    settleAccountOptions.length === 0
                  }
                  onClick={() => void settleSelectedVendorBills()}
                >
                  {settleBusy
                    ? "Settling…"
                    : `Settle selected (${selectedPendingIds.length}${selectionBillCurrency ? ` · ${selectionBillCurrency}` : ""})`}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="border border-amber-300"
                  disabled={
                    mergeBusy ||
                    settleBusy ||
                    selectedPendingIds.length < 2 ||
                    !selectionBillCurrency
                  }
                  onClick={() => void mergeSelectedPayLater()}
                >
                  {mergeBusy ? "Merging…" : "Merge into one bill"}
                </Button>
              </div>
              <p className="text-[11px] text-amber-900/90">
                Merge combines several pay-later lines into one unpaid bill (same currency). Use after you receive a
                single invoice covering multiple entries.
              </p>
            </Card>
          ) : statementData.contact.kind === "vendor" &&
            statementData.lines.length > 0 &&
            pendingVendorBillIds.length === 0 ? (
            <p className="text-xs text-slate-500">No unpaid pay-later bills for this vendor.</p>
          ) : null}

          {!statementData.lines.length ? (
            <Card>
              <p className="p-4 text-center text-sm text-slate-500">
                No income or spend entries linked to this contact yet.
              </p>
            </Card>
          ) : (
            <Card className="overflow-hidden p-0">
              <div className="max-h-[min(70vh,560px)] overflow-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Category</th>
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2">Via</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statementData.lines.map((ln) => (
                      <tr key={`${ln.kind}-${ln.id}`} className="border-b border-slate-100">
                        <td className="px-3 py-2 capitalize">{ln.kind}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                          {ln.date}
                          {ln.kind === "expense" && ln.bill_date && ln.bill_date !== ln.date ? (
                            <span className="block text-[10px] font-normal normal-case text-slate-400">
                              Bill {ln.bill_date}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{ln.category_name ?? "—"}</td>
                        <td className="max-w-[12rem] px-3 py-2 text-slate-800">
                          <span className="truncate block">{ln.description ?? "—"}</span>
                          {ln.kind === "expense" && ln.pay_later ? (
                            <span className="mt-0.5 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                              Unpaid
                            </span>
                          ) : null}
                          {ln.kind === "income" && ln.pending_receivable ? (
                            <span className="mt-0.5 inline-block rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-900">
                              Pending receipt
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{ln.via}</td>
                        <td className="px-3 py-2 text-right">
                          <DisplayAmountCell
                            amount={ln.amount}
                            nativeCurrency={ln.currency}
                            tone={ln.kind === "income" ? "positive" : "negative"}
                            className="font-medium"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-500">Nothing to show.</p>
      )}
    </div>
  );
}
