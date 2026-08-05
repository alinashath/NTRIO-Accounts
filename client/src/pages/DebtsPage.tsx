import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/api/http";
import { Dropdown, type DropdownOption } from "@/components/Dropdown";
import { Modal } from "@/components/Modal";
import { ReceiptAttachmentField } from "@/components/ReceiptAttachmentField";
import { SkeletonCard, SkeletonLine, SkeletonTableRows } from "@/components/Skeleton";
import { Button, Card, TextField } from "@/components/ui";
import { useDisplayCurrency } from "@/context/DisplayCurrencyContext";
import { convertWithUsdMvrRate } from "@/lib/displayFx";
import { ACCOUNT_CURRENCIES } from "@/lib/fx";
import { useAuthStore } from "@/store/auth";
import type { AccountDto, ContactDto, DebtDetailDto, DebtDto, DebtPaymentDto } from "../../../shared/types";

export function DebtsPage() {
  const userId = useAuthStore((s) => s.session?.user.id ?? "");
  const { displayCurrency, globalUsdMvrRate } = useDisplayCurrency();
  const [debts, setDebts] = useState<DebtDto[]>([]);
  const [accounts, setAccounts] = useState<AccountDto[]>([]);
  const [contacts, setContacts] = useState<ContactDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [debtModal, setDebtModal] = useState(false);
  const [mergeModal, setMergeModal] = useState(false);
  const [payModal, setPayModal] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DebtDetailDto | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [d, accs, cont] = await Promise.all([
        apiFetch<DebtDto[]>("/api/debts"),
        apiFetch<AccountDto[]>("/api/accounts"),
        apiFetch<ContactDto[]>("/api/contacts"),
      ]);
      setDebts(d);
      setAccounts(accs);
      setContacts(cont);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [refresh]);

  useEffect(() => {
    if (!detailId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    void apiFetch<DebtDetailDto>(`/api/debts/${detailId}`)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed");
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detailId]);

  async function reloadDetail() {
    if (!detailId) return;
    const d = await apiFetch<DebtDetailDto>(`/api/debts/${detailId}`);
    setDetail(d);
  }

  const summary = useMemo(() => {
    let iOwe = 0;
    let owedToMe = 0;
    for (const d of debts) {
      if (d.status !== "open") continue;
      const conv = convertWithUsdMvrRate(d.outstanding, d.currency, displayCurrency, globalUsdMvrRate);
      if (d.direction === "i_owe") iOwe += conv;
      else owedToMe += conv;
    }
    return { iOwe, owedToMe, net: owedToMe - iOwe };
  }, [debts, displayCurrency, globalUsdMvrRate]);

  const accountOpts: DropdownOption[] = useMemo(
    () => accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` })),
    [accounts],
  );

  const contactOpts: DropdownOption[] = useMemo(
    () =>
      [...contacts]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => ({ value: c.id, label: `${c.name} (${c.kind})` })),
    [contacts],
  );

  const openDebtOpts: DropdownOption[] = useMemo(
    () =>
      debts
        .filter((d) => d.status === "open")
        .map((d) => ({
          value: d.id,
          label: `${d.contact_name} (${d.direction})`,
        })),
    [debts],
  );

  const openIOwe = debts.filter((d) => d.direction === "i_owe" && d.status === "open");
  const openOwed = debts.filter((d) => d.direction === "owed_to_me" && d.status === "open");
  const settled = debts.filter((d) => d.status === "settled");

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 md:text-xl">Debts</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" onClick={() => setPayModal(true)}>
            Record payment
          </Button>
          <Button type="button" variant="ghost" onClick={() => setMergeModal(true)}>
            Merge debts
          </Button>
          <Button type="button" onClick={() => setDebtModal(true)}>
            Add debt
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <Modal open={debtModal} title="New debt" onClose={() => setDebtModal(false)}>
        <NewDebtForm
          contactOptions={contactOpts}
          onDone={() => {
            setDebtModal(false);
            void refresh().catch(() => {});
          }}
          onError={setError}
        />
      </Modal>

      <Modal open={mergeModal} title="Merge debts" onClose={() => setMergeModal(false)}>
        <MergeDebtsForm
          debts={debts}
          onDone={() => {
            setMergeModal(false);
            void refresh().catch(() => {});
          }}
          onError={setError}
        />
      </Modal>

      <Modal open={payModal} title="Record payment" onClose={() => setPayModal(false)}>
        <PaymentForm
          userId={userId}
          debts={debts}
          accounts={accounts}
          debtOptions={openDebtOpts}
          accountOptions={accountOpts}
          onDone={() => {
            setPayModal(false);
            void refresh().catch(() => {});
          }}
          onError={setError}
        />
      </Modal>

      <Modal
        open={detailId !== null}
        title={detail ? `${detail.contact_name} — history` : "Debt"}
        onClose={() => {
          setDetailId(null);
          setDetail(null);
        }}
      >
        {detailLoading ? <p className="text-sm text-slate-600">Loading…</p> : null}
        {detail && !detailLoading ? (
          <DebtHistoryPanel
            detail={detail}
            userId={userId}
            onRefreshList={() => void refresh().catch(() => {})}
            onReloadDetail={() => void reloadDetail().catch(() => {})}
            onError={setError}
          />
        ) : null}
      </Modal>

      {loading ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <Card className="p-4">
            <SkeletonLine className="h-5 w-32" />
            <SkeletonTableRows rows={4} />
          </Card>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <p className="text-xs uppercase text-slate-500">I owe</p>
              <p className="mt-1 text-xl font-bold text-negative tabular-nums sm:text-2xl">
                {summary.iOwe.toLocaleString(undefined, { style: "currency", currency: displayCurrency })}
              </p>
            </Card>
            <Card>
              <p className="text-xs uppercase text-slate-500">Owed to me</p>
              <p className="mt-1 text-xl font-bold text-positive tabular-nums sm:text-2xl">
                {summary.owedToMe.toLocaleString(undefined, { style: "currency", currency: displayCurrency })}
              </p>
            </Card>
            <Card>
              <p className="text-xs uppercase text-slate-500">Net</p>
              <p
                className={`mt-1 text-xl font-bold tabular-nums sm:text-2xl ${
                  summary.net >= 0 ? "text-positive" : "text-negative"
                }`}
              >
                {summary.net.toLocaleString(undefined, { style: "currency", currency: displayCurrency })}
              </p>
            </Card>
          </div>

          <Card>
            <h3 className="text-sm font-semibold text-slate-900">I owe (open)</h3>
            <DebtList items={openIOwe} onSelect={(id) => setDetailId(id)} />
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-slate-900">Owed to me (open)</h3>
            <DebtList items={openOwed} onSelect={(id) => setDetailId(id)} />
          </Card>

          <details className="rounded-[var(--radius-md)] border border-border/80 bg-card p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">
              Settled debts ({settled.length})
            </summary>
            <div className="mt-3">
              <DebtList items={settled} onSelect={(id) => setDetailId(id)} />
            </div>
          </details>
        </>
      )}
    </div>
  );
}

function DebtList({ items, onSelect }: { items: DebtDto[]; onSelect: (id: string) => void }) {
  if (!items.length) {
    return <p className="mt-2 text-sm text-slate-500">No debts.</p>;
  }
  return (
    <ul className="mt-2 divide-y divide-slate-100 text-sm">
      {items.map((d) => (
        <li key={d.id}>
          <button
            type="button"
            className="flex w-full flex-wrap items-center justify-between gap-2 py-3 text-left hover:bg-slate-50"
            onClick={() => onSelect(d.id)}
          >
            <div className="min-w-0">
              <p className="font-semibold text-slate-900">{d.contact_name}</p>
              {d.linked_contact_name ? (
                <p className="text-[11px] text-sky-700">Linked: {d.linked_contact_name}</p>
              ) : null}
              <p className="text-xs text-slate-500">
                Principal{" "}
                {d.principal.toLocaleString(undefined, { style: "currency", currency: d.currency })} · Paid{" "}
                {d.total_paid.toLocaleString(undefined, { style: "currency", currency: d.currency })}
                {d.charges_from_expenses > 0 ? (
                  <span>
                    {" "}
                    · Spend charged{" "}
                    {d.charges_from_expenses.toLocaleString(undefined, {
                      style: "currency",
                      currency: d.currency,
                    })}
                  </span>
                ) : null}
              </p>
            </div>
            <div className="text-right">
              <p className="font-bold text-slate-900 tabular-nums">
                {d.outstanding.toLocaleString(undefined, { style: "currency", currency: d.currency })}
              </p>
              <p className="text-xs uppercase text-slate-500">{d.status}</p>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function NewDebtForm({
  contactOptions,
  onDone,
  onError,
}: {
  contactOptions: DropdownOption[];
  onDone: () => void;
  onError: (s: string | null) => void;
}) {
  const dirOpts: DropdownOption[] = useMemo(
    () => [
      { value: "i_owe", label: "I owe" },
      { value: "owed_to_me", label: "Owed to me" },
    ],
    [],
  );
  const [direction, setDirection] = useState("");
  const [contactId, setContactId] = useState("");
  const [contact, setContact] = useState("");
  const [principal, setPrincipal] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [busy, setBusy] = useState(false);

  const ccyOpts: DropdownOption[] = useMemo(
    () => ACCOUNT_CURRENCIES.map((c) => ({ value: c, label: c })),
    [],
  );

  const contactSelectOpts: DropdownOption[] = useMemo(
    () => [{ value: "", label: "None — type name only" }, ...contactOptions],
    [contactOptions],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!direction) {
      onError("Select direction.");
      return;
    }
    if (!contact.trim() && !contactId) {
      onError("Enter a contact name or pick a linked contact.");
      return;
    }
    setBusy(true);
    onError(null);
    try {
      await apiFetch("/api/debts", {
        method: "POST",
        body: JSON.stringify({
          direction,
          contact_name: contact.trim() || undefined,
          contact_id: contactId || undefined,
          principal: Number(principal),
          currency,
        }),
      });
      setContact("");
      setContactId("");
      setPrincipal("");
      setDirection("");
      setCurrency("USD");
      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={(e) => void submit(e)}>
      <Dropdown label="Direction" value={direction} onChange={setDirection} options={dirOpts} />
      <Dropdown
        label="Link contact (optional)"
        value={contactId}
        onChange={(v) => {
          setContactId(v);
          const row = contactOptions.find((o) => o.value === v);
          if (row && v) setContact(row.label.replace(/\s*\([^)]+\)\s*$/, ""));
        }}
        options={contactSelectOpts}
        disabled={contactOptions.length === 0}
        hint="Picks a row from your Contacts page; you can still edit the display name."
      />
      <TextField
        label="Counterparty name"
        value={contact}
        onChange={(e) => setContact(e.target.value)}
        hint="Shown on statements; prefilled when you link a contact."
      />
      <Dropdown label="Debt currency" value={currency} onChange={setCurrency} options={ccyOpts} />
      <TextField
        label={`Principal (${currency})`}
        type="number"
        step="0.01"
        min="0.01"
        value={principal}
        onChange={(e) => setPrincipal(e.target.value)}
        required
      />
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Saving…" : "Save debt"}
      </Button>
    </form>
  );
}

function MergeDebtsForm({
  debts,
  onDone,
  onError,
}: {
  debts: DebtDto[];
  onDone: () => void;
  onError: (s: string | null) => void;
}) {
  const [keepId, setKeepId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const keepDebt = debts.find((d) => d.id === keepId);
  const candidates = useMemo(() => {
    if (!keepDebt) return [];
    return debts.filter(
      (d) =>
        d.id !== keepId &&
        d.status === "open" &&
        d.direction === keepDebt.direction &&
        d.currency.toUpperCase() === keepDebt.currency.toUpperCase(),
    );
  }, [debts, keepId, keepDebt]);

  useEffect(() => {
    setSelected(new Set());
  }, [keepId]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const keeperOpts: DropdownOption[] = useMemo(
    () =>
      debts
        .filter((d) => d.status === "open")
        .map((d) => ({
          value: d.id,
          label: `${d.contact_name} — ${d.principal.toLocaleString(undefined, { style: "currency", currency: d.currency })} (${d.direction})`,
        })),
    [debts],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!keepId) {
      onError("Select the debt to keep.");
      return;
    }
    const mergeIds = [...selected];
    if (!mergeIds.length) {
      onError("Select at least one other debt to merge.");
      return;
    }
    if (
      !window.confirm(
        `Merge ${mergeIds.length} debt(s) into "${keepDebt?.contact_name ?? "this debt"}"? Payments and spend charges will move to the kept debt; the other debt rows are removed. This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    onError(null);
    try {
      await apiFetch("/api/debts/merge", {
        method: "POST",
        body: JSON.stringify({ keep_debt_id: keepId, merge_debt_ids: mergeIds }),
      });
      setKeepId("");
      setSelected(new Set());
      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={(e) => void submit(e)}>
      <Dropdown
        label="Debt to keep"
        value={keepId}
        onChange={setKeepId}
        options={keeperOpts}
        disabled={keeperOpts.length === 0}
        required={false}
        placeholder={keeperOpts.length ? "Select…" : "No open debts"}
      />
      {keepDebt ? (
        <fieldset className="max-h-52 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">
          <legend className="text-xs font-medium text-slate-700">Merge these into it</legend>
          {!candidates.length ? (
            <p className="text-xs text-slate-500">No other open debts with the same direction and currency.</p>
          ) : (
            candidates.map((d) => (
              <label key={d.id} className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  className="mt-1 rounded border-slate-300"
                  checked={selected.has(d.id)}
                  onChange={() => toggle(d.id)}
                />
                <span>
                  <span className="font-medium">{d.contact_name}</span>
                  <span className="block text-xs text-slate-500">
                    Outstanding{" "}
                    {d.outstanding.toLocaleString(undefined, { style: "currency", currency: d.currency })}
                  </span>
                </span>
              </label>
            ))
          )}
        </fieldset>
      ) : null}
      <Button type="submit" className="w-full" disabled={busy || !keepId || selected.size === 0}>
        {busy ? "Merging…" : "Merge into kept debt"}
      </Button>
    </form>
  );
}

function PaymentForm({
  userId,
  debts,
  accounts,
  debtOptions,
  accountOptions,
  onDone,
  onError,
}: {
  userId: string;
  debts: DebtDto[];
  accounts: AccountDto[];
  debtOptions: DropdownOption[];
  accountOptions: DropdownOption[];
  onDone: () => void;
  onError: (s: string | null) => void;
}) {
  const [payDebtId, setPayDebtId] = useState("");
  const [payAccountId, setPayAccountId] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payAccountAmount, setPayAccountAmount] = useState("");
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payNotes, setPayNotes] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const debt = debts.find((d) => d.id === payDebtId);
  const acct = accounts.find((a) => a.id === payAccountId);
  const cross = Boolean(debt && acct && debt.currency.toUpperCase() !== acct.currency.toUpperCase());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) {
      onError("You must be signed in.");
      return;
    }
    if (!payDebtId || !payAccountId) {
      onError("Select debt and account.");
      return;
    }
    const amt = Number(payAmount);
    if (!amt || amt <= 0) {
      onError("Enter a valid amount.");
      return;
    }
    if (cross) {
      const bank = Number(payAccountAmount);
      if (!bank || bank <= 0) {
        onError(`Enter cash debited from the account (${acct?.currency ?? "account currency"}).`);
        return;
      }
    }
    setBusy(true);
    onError(null);
    try {
      const body: Record<string, unknown> = {
        account_id: payAccountId,
        amount: amt,
        date: payDate,
        notes: payNotes.trim() || undefined,
        attachment_url: attachmentUrl.trim() || undefined,
      };
      if (cross) {
        body.account_amount = Number(payAccountAmount);
      }
      await apiFetch(`/api/debts/${payDebtId}/payments`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setPayDebtId("");
      setPayAccountId("");
      setPayAmount("");
      setPayAccountAmount("");
      setPayNotes("");
      setAttachmentUrl("");
      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={(e) => void submit(e)}>
      <Dropdown
        label="Debt"
        value={payDebtId}
        onChange={setPayDebtId}
        options={debtOptions}
        disabled={debtOptions.length === 0}
      />
      <Dropdown
        label="Pay from account"
        value={payAccountId}
        onChange={setPayAccountId}
        options={accountOptions}
        disabled={accountOptions.length === 0}
      />
      <TextField
        label={debt ? `Debt reduction (${debt.currency})` : "Debt reduction amount"}
        type="number"
        step="0.01"
        min="0.01"
        value={payAmount}
        onChange={(e) => setPayAmount(e.target.value)}
        required
      />
      {cross ? (
        <TextField
          label={`Cash from account (${acct?.currency ?? "?"})`}
          type="number"
          step="0.01"
          min="0.01"
          value={payAccountAmount}
          onChange={(e) => setPayAccountAmount(e.target.value)}
          hint="Required when account currency differs from the debt. Bank movement is in the account currency; debt reduction is in the debt currency."
          required
        />
      ) : null}
      <TextField label="Date" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} required />
      <TextField label="Notes (optional)" value={payNotes} onChange={(e) => setPayNotes(e.target.value)} />
      <ReceiptAttachmentField
        attachmentUrl={attachmentUrl}
        onAttachmentUrlChange={setAttachmentUrl}
        userId={userId}
      />
      <Button type="submit" className="w-full" disabled={busy || debtOptions.length === 0}>
        {busy ? "Saving…" : "Record payment"}
      </Button>
    </form>
  );
}

function DebtHistoryPanel({
  detail,
  userId,
  onRefreshList,
  onReloadDetail,
  onError,
}: {
  detail: DebtDetailDto;
  userId: string;
  onRefreshList: () => void;
  onReloadDetail: () => void;
  onError: (s: string | null) => void;
}) {
  const ccy = detail.currency;
  return (
    <div className="space-y-4">
      <div className="text-sm text-slate-600">
        <p>
          <span className="font-medium text-slate-800">Outstanding:</span>{" "}
          {detail.outstanding.toLocaleString(undefined, { style: "currency", currency: ccy })}
        </p>
        <p>
          <span className="font-medium text-slate-800">Principal:</span>{" "}
          {detail.principal.toLocaleString(undefined, { style: "currency", currency: ccy })}
        </p>
        <p>
          <span className="font-medium text-slate-800">Spend charged to debt:</span>{" "}
          {detail.charges_from_expenses.toLocaleString(undefined, { style: "currency", currency: ccy })}
        </p>
      </div>

      <AddPrincipalSection
        debtId={detail.id}
        currency={ccy}
        onSuccess={() => {
          onReloadDetail();
          onRefreshList();
        }}
        onError={onError}
      />

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Incurred (spend on tab)</h4>
        <div className="mt-1 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Description</th>
                <th className="px-2 py-2 text-right">Amount ({ccy})</th>
              </tr>
            </thead>
            <tbody>
              {(detail.expense_charges ?? []).map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="whitespace-nowrap px-2 py-2">
                    {c.date.includes("T") ? c.date.slice(0, 10) : c.date.slice(0, 10)}
                  </td>
                  <td className="px-2 py-2">{c.description ?? c.merchant ?? c.category_name ?? "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-orange-800">
                    +
                    {c.amount.toLocaleString(undefined, { style: "currency", currency: ccy })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!detail.expense_charges?.length ? (
            <p className="p-3 text-center text-sm text-slate-500">No spend charges on this debt yet.</p>
          ) : null}
        </div>
      </div>

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Reduced (cash payments)</h4>
        <div className="mt-1 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Account</th>
                <th className="px-2 py-2 text-right">Debt −</th>
                <th className="px-2 py-2 text-right">Bank −</th>
                <th className="px-2 py-2">FX</th>
                <th className="px-2 py-2">Receipt</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {detail.payments.map((p) => (
                <DebtPaymentRow
                  key={p.id}
                  debtId={detail.id}
                  debtCurrency={ccy}
                  payment={p}
                  userId={userId}
                  onRefreshList={onRefreshList}
                  onReloadDetail={onReloadDetail}
                  onError={onError}
                />
              ))}
            </tbody>
          </table>
          {!detail.payments.length ? (
            <p className="p-3 text-center text-sm text-slate-500">No payments yet.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AddPrincipalSection({
  debtId,
  currency,
  onSuccess,
  onError,
}: {
  debtId: string;
  currency: string;
  onSuccess: () => void;
  onError: (s: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      onError("Enter a positive amount.");
      return;
    }
    setBusy(true);
    onError(null);
    try {
      await apiFetch(`/api/debts/${debtId}/add-principal`, {
        method: "POST",
        body: JSON.stringify({ amount: amt, note: note.trim() || undefined }),
      });
      setAmount("");
      setNote("");
      setExpanded(false);
      onSuccess();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
      <button
        type="button"
        className="text-left text-sm font-medium text-sky-800 underline decoration-sky-600/40 hover:decoration-sky-700"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? "Hide" : "Add to principal"} (increase amount owed / recorded loan)
      </button>
      {expanded ? (
        <form className="mt-3 space-y-3 border-t border-slate-200 pt-3" onSubmit={(e) => void submit(e)}>
          <TextField
            label={`Amount to add (${currency})`}
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
          <TextField
            label="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            hint="Appended to the debt notes for audit."
          />
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Saving…" : "Add to principal"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function DebtPaymentRow({
  debtId,
  debtCurrency,
  payment,
  userId,
  onRefreshList,
  onReloadDetail,
  onError,
}: {
  debtId: string;
  debtCurrency: string;
  payment: DebtPaymentDto;
  userId: string;
  onRefreshList: () => void;
  onReloadDetail: () => void;
  onError: (s: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [attachmentUrl, setAttachmentUrl] = useState(payment.attachment_url ?? "");
  const [notes, setNotes] = useState(payment.notes ?? "");
  const [busy, setBusy] = useState(false);
  const voided = Boolean(payment.voided_at);
  const dateStr = payment.date.includes("T") ? payment.date.slice(0, 10) : payment.date.slice(0, 10);

  async function saveAttachment() {
    setBusy(true);
    onError(null);
    try {
      await apiFetch(`/api/debts/${debtId}/payments/${payment.id}`, {
        method: "PUT",
        body: JSON.stringify({
          attachment_url: attachmentUrl.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      setEditing(false);
      onReloadDetail();
      onRefreshList();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function doVoid() {
    if (!window.confirm("Void this payment? The linked account will be reconciled.")) return;
    setBusy(true);
    onError(null);
    try {
      await apiFetch(`/api/debts/${debtId}/payments/${payment.id}/void`, {
        method: "POST",
        body: "{}",
      });
      onReloadDetail();
      onRefreshList();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function doUnvoid() {
    setBusy(true);
    onError(null);
    try {
      await apiFetch(`/api/debts/${debtId}/payments/${payment.id}/unvoid`, { method: "POST", body: "{}" });
      onReloadDetail();
      onRefreshList();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <tr className="border-t border-slate-100 bg-slate-50">
        <td colSpan={7} className="space-y-3 p-3">
          <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <ReceiptAttachmentField
            attachmentUrl={attachmentUrl}
            onAttachmentUrlChange={setAttachmentUrl}
            userId={userId}
          />
          <div className="flex gap-2">
            <Button type="button" disabled={busy} className="min-h-9 px-3 py-2 text-xs" onClick={() => void saveAttachment()}>
              Save
            </Button>
            <Button type="button" variant="ghost" className="min-h-9 px-3 py-2 text-xs" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className={`border-t border-slate-100 ${voided ? "opacity-60" : ""}`}>
      <td className="whitespace-nowrap px-2 py-2">
        {dateStr}
        {voided ? (
          <span className="ml-1 block text-[10px] font-semibold text-amber-800">VOID</span>
        ) : null}
      </td>
      <td className="px-2 py-2">{payment.account_name}</td>
      <td className="px-2 py-2 text-right tabular-nums">
        −
        {payment.amount.toLocaleString(undefined, { style: "currency", currency: debtCurrency })}
      </td>
      <td className="px-2 py-2 text-right tabular-nums text-slate-700">
        {payment.account_amount != null
          ? `−${payment.account_amount.toLocaleString(undefined, {
              style: "currency",
              currency: payment.account_currency,
            })}`
          : "—"}
      </td>
      <td className="px-2 py-2 text-slate-600">
        {payment.exchange_rate != null ? payment.exchange_rate.toFixed(6) : "—"}
      </td>
      <td className="px-2 py-2">
        {payment.attachment_url ? (
          <a
            href={payment.attachment_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-700 underline"
          >
            Open
          </a>
        ) : (
          "—"
        )}
      </td>
      <td className="px-2 py-2">
        {!voided ? (
          <div className="flex flex-col gap-1">
            <Button type="button" variant="ghost" className="h-7 px-2 text-[11px]" disabled={busy} onClick={() => setEditing(true)}>
              Edit / receipt
            </Button>
            <Button type="button" variant="ghost" className="h-7 px-2 text-[11px] text-amber-900" disabled={busy} onClick={() => void doVoid()}>
              Void
            </Button>
          </div>
        ) : (
          <Button type="button" variant="ghost" className="h-7 px-2 text-[11px]" disabled={busy} onClick={() => void doUnvoid()}>
            Unvoid
          </Button>
        )}
      </td>
    </tr>
  );
}
