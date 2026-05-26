import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/api/http";
import { Dropdown, type DropdownOption } from "@/components/Dropdown";
import { DisplayAmountCell } from "@/components/DisplayAmountCell";
import { Modal } from "@/components/Modal";
import { Button, Card, TextField } from "@/components/ui";
import type { AccountDto, ContactDto, ContactKind, ContactStatementDto } from "../../../shared/types";

const kindOpts: DropdownOption[] = [
  { value: "vendor", label: "Vendor" },
  { value: "customer", label: "Customer" },
  { value: "other", label: "Other" },
];

export function ContactsPage() {
  const [rows, setRows] = useState<ContactDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ContactDto | null>(null);
  const [statementOpen, setStatementOpen] = useState(false);
  const [statementTitle, setStatementTitle] = useState("");
  const [statementContact, setStatementContact] = useState<ContactDto | null>(null);
  const [statementData, setStatementData] = useState<ContactStatementDto | null>(null);
  const [statementAccounts, setStatementAccounts] = useState<AccountDto[] | null>(null);
  const [statementLoading, setStatementLoading] = useState(false);
  const [selectedPendingIds, setSelectedPendingIds] = useState<string[]>([]);
  const [settleAccountId, setSettleAccountId] = useState("");
  const [settlePaidDate, setSettlePaidDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [settleBusy, setSettleBusy] = useState(false);

  const refresh = useCallback(async () => {
    const list = await apiFetch<ContactDto[]>("/api/contacts");
    setRows(list);
  }, []);

  useEffect(() => {
    void refresh().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [refresh]);

  async function openStatement(c: ContactDto) {
    setStatementContact(c);
    setStatementTitle(`Statement — ${c.name}`);
    setStatementOpen(true);
    setStatementData(null);
    setStatementAccounts(null);
    setSelectedPendingIds([]);
    setSettleAccountId("");
    setSettlePaidDate(new Date().toISOString().slice(0, 10));
    setStatementLoading(true);
    setError(null);
    try {
      const data = await apiFetch<ContactStatementDto>(`/api/contacts/${c.id}/statement`);
      setStatementData(data);
      if (c.kind === "vendor") {
        const accs = await apiFetch<AccountDto[]>("/api/accounts");
        setStatementAccounts(accs);
      } else {
        setStatementAccounts(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load statement");
    } finally {
      setStatementLoading(false);
    }
  }

  const pendingVendorBillIds = useMemo(
    () =>
      statementData?.lines.filter((l) => l.kind === "expense" && l.pay_later).map((l) => l.id) ?? [],
    [statementData],
  );

  const selectionBillCurrency = useMemo(() => {
    if (!statementData || selectedPendingIds.length === 0) return null;
    const ccys = new Set<string>();
    for (const id of selectedPendingIds) {
      const ln = statementData.lines.find((l) => l.id === id && l.kind === "expense" && l.pay_later);
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
    if (!statementContact || statementContact.kind !== "vendor") return;
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
      await apiFetch<{ settled: number }>(`/api/contacts/${statementContact.id}/settle-expenses`, {
        method: "POST",
        body: JSON.stringify({
          expense_ids: selectedPendingIds,
          account_id: settleAccountId,
          paid_date: settlePaidDate,
        }),
      });
      await openStatement(statementContact);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to settle");
    } finally {
      setSettleBusy(false);
    }
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 md:text-xl">Contacts</h2>
        </div>
        <Button
          type="button"
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          Add contact
        </Button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <Modal
        open={modalOpen}
        title={editing ? "Edit contact" : "New contact"}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
      >
        <ContactForm
          initial={editing}
          onDone={() => {
            setModalOpen(false);
            setEditing(null);
            void refresh().catch(() => {});
          }}
          onError={setError}
        />
      </Modal>

      <Modal
        open={statementOpen}
        title={statementTitle}
        size="lg"
        onClose={() => {
          setStatementOpen(false);
          setStatementData(null);
          setStatementContact(null);
          setStatementAccounts(null);
          setSelectedPendingIds([]);
          setSettleAccountId("");
        }}
      >
        {statementLoading ? (
          <p className="text-sm text-slate-600">Loading…</p>
        ) : statementData ? (
          <div className="space-y-4">
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

            {statementData.contact.kind === "vendor" && pendingVendorBillIds.length > 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 space-y-3">
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
                <div className="max-h-40 overflow-auto rounded border border-amber-200/80 bg-white">
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
                            <td className="max-w-[10rem] truncate px-2 py-1.5 text-slate-800">{ln.description ?? "—"}</td>
                            <td className="px-2 py-1.5 text-right">
                              <DisplayAmountCell
                                amount={ln.amount}
                                nativeCurrency={ln.currency}
                                className="font-medium text-orange-800"
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
                <Button
                  type="button"
                  className="w-full sm:w-auto"
                  disabled={
                    settleBusy ||
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
              </div>
            ) : statementData.contact.kind === "vendor" &&
              statementData.lines.length > 0 &&
              pendingVendorBillIds.length === 0 ? (
              <p className="text-xs text-slate-500">No unpaid pay-later bills for this vendor.</p>
            ) : null}

            {!statementData.lines.length ? (
              <p className="text-center text-sm text-slate-500">No income or spend entries linked to this contact yet.</p>
            ) : (
              <div className="max-h-[min(60vh,480px)] overflow-auto rounded-lg border border-slate-200">
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
                            className={
                              ln.kind === "income" ? "font-medium text-emerald-700" : "font-medium text-orange-700"
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No data.</p>
        )}
      </Modal>

      <Card className="overflow-hidden p-0">
        <ul className="divide-y divide-slate-100">
          {rows.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{c.name}</p>
                <p className="text-xs text-slate-500 capitalize">
                  {c.kind}
                  {c.email ? ` · ${c.email}` : ""}
                  {c.phone ? ` · ${c.phone}` : ""}
                  {c.tgst_number ? ` · TGST ${c.tgst_number}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="ghost" className="text-xs" onClick={() => void openStatement(c)}>
                  Statement
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-xs"
                  onClick={() => {
                    setEditing(c);
                    setModalOpen(true);
                  }}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-xs text-red-700"
                  onClick={() => {
                    if (!window.confirm(`Delete contact “${c.name}”? Links on transactions will be cleared.`)) {
                      return;
                    }
                    void apiFetch(`/api/contacts/${c.id}`, { method: "DELETE" })
                      .then(() => refresh())
                      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
                  }}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
        {!rows.length ? (
          <p className="p-4 text-center text-sm text-slate-500">No contacts yet.</p>
        ) : null}
      </Card>
    </div>
  );
}

function ContactForm({
  initial,
  onDone,
  onError,
}: {
  initial: ContactDto | null;
  onDone: () => void;
  onError: (s: string | null) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<ContactKind | "">(initial?.kind ?? "other");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [tgstNumber, setTgstNumber] = useState(initial?.tgst_number ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [busy, setBusy] = useState(false);

  const isEdit = Boolean(initial);

  useEffect(() => {
    setName(initial?.name ?? "");
    setKind(initial?.kind ?? "other");
    setEmail(initial?.email ?? "");
    setPhone(initial?.phone ?? "");
    setTgstNumber(initial?.tgst_number ?? "");
    setNotes(initial?.notes ?? "");
  }, [initial]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      onError("Name is required.");
      return;
    }
    if (!kind) {
      onError("Select a type.");
      return;
    }
    setBusy(true);
    onError(null);
    try {
      const body = {
        name: name.trim(),
        kind,
        email: email.trim() || null,
        phone: phone.trim() || null,
        tgst_number: tgstNumber.trim() || null,
        notes: notes.trim() || null,
      };
      if (isEdit && initial) {
        await apiFetch(`/api/contacts/${initial.id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch("/api/contacts", {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={(e) => void submit(e)}>
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
      <Dropdown label="Type" value={kind} onChange={(v) => setKind(v as ContactKind)} options={kindOpts} />
      <TextField label="Email (optional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <TextField label="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <TextField
        label="TGST number (optional)"
        value={tgstNumber}
        onChange={(e) => setTgstNumber(e.target.value)}
        placeholder="Tax registration"
      />
      <TextField label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Saving…" : isEdit ? "Save changes" : "Create contact"}
      </Button>
    </form>
  );
}
