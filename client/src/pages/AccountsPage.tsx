import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "@/api/http";
import { Dropdown, type DropdownOption } from "@/components/Dropdown";
import { Modal } from "@/components/Modal";
import { Button, Card, TextField } from "@/components/ui";
import { DisplayAmountCell } from "@/components/DisplayAmountCell";
import { ACCOUNT_CURRENCIES, defaultTransferExchangeRate } from "@/lib/fx";
import type { AccountDto, AccountType } from "../../../shared/types";

export function AccountsPage() {
  const [rows, setRows] = useState<AccountDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [xferOpen, setXferOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<AccountDto | null>(null);

  const refresh = useCallback(async () => {
    const data = await apiFetch<AccountDto[]>("/api/accounts");
    setRows(data);
  }, []);

  useEffect(() => {
    void refresh().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [refresh]);

  const typeOptions: DropdownOption[] = useMemo(
    () => [
      { value: "bank", label: "Bank" },
      { value: "cash", label: "Cash" },
      { value: "wallet", label: "Wallet" },
    ],
    [],
  );

  const currencyOptions: DropdownOption[] = useMemo(
    () => ACCOUNT_CURRENCIES.map((c) => ({ value: c, label: c })),
    [],
  );

  const accountXferOptions: DropdownOption[] = useMemo(
    () => rows.map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` })),
    [rows],
  );

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 md:text-xl">Accounts</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => setXferOpen(true)} variant="ghost">
            Transfer
          </Button>
          <Button type="button" onClick={() => setAddOpen(true)}>
            Add account
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((a) => (
          <Card key={a.id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <Link to={`/accounts/${a.id}`} className="min-w-0 flex-1 rounded-lg outline-offset-2 hover:bg-slate-50/80">
                <p className="text-xs uppercase tracking-wide text-slate-500">{a.type}</p>
                <p className="text-lg font-semibold text-slate-900">{a.name}</p>
                <p className="mt-1 text-xs text-slate-500">{a.currency}</p>
                <p className="mt-2 text-2xl font-bold">
                  <DisplayAmountCell amount={a.balance} nativeCurrency={a.currency} className="text-slate-900" />
                </p>
              </Link>
              <Button type="button" variant="ghost" className="shrink-0 text-sm" onClick={() => setEditAccount(a)}>
                Edit
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={addOpen} title="New account" onClose={() => setAddOpen(false)}>
        <NewAccountForm
          typeOptions={typeOptions}
          currencyOptions={currencyOptions}
          onDone={() => {
            setAddOpen(false);
            void refresh().catch(() => {});
          }}
          onError={setError}
        />
      </Modal>

      <Modal open={xferOpen} title="Transfer between accounts" onClose={() => setXferOpen(false)} size="lg">
        <TransferForm
          accountOptions={accountXferOptions}
          accounts={rows}
          onDone={() => {
            setXferOpen(false);
            void refresh().catch(() => {});
          }}
          onError={setError}
        />
      </Modal>

      <Modal open={editAccount != null} title="Edit account" onClose={() => setEditAccount(null)}>
        {editAccount ? (
          <EditAccountForm
            account={editAccount}
            typeOptions={typeOptions}
            currencyOptions={currencyOptions}
            onDone={() => {
              setEditAccount(null);
              void refresh().catch(() => {});
            }}
            onError={setError}
          />
        ) : null}
      </Modal>
    </div>
  );
}

function EditAccountForm({
  account,
  typeOptions,
  currencyOptions,
  onDone,
  onError,
}: {
  account: AccountDto;
  typeOptions: DropdownOption[];
  currencyOptions: DropdownOption[];
  onDone: () => void;
  onError: (s: string | null) => void;
}) {
  const [name, setName] = useState(account.name);
  const [type, setType] = useState(account.type);
  const [currency, setCurrency] = useState(account.currency);
  const [busy, setBusy] = useState(false);

  const canChangeCurrency = account.can_change_currency === true;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !type) {
      onError("Name and type are required.");
      return;
    }
    if (canChangeCurrency && !currency) {
      onError("Choose a currency.");
      return;
    }
    setBusy(true);
    onError(null);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        type,
      };
      if (canChangeCurrency) {
        payload.currency = currency;
      }
      await apiFetch(`/api/accounts/${account.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
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
      <Dropdown
        label="Type"
        value={type}
        onChange={(v) => setType(v as AccountType)}
        options={typeOptions}
        required
      />
      <Dropdown
        label="Currency"
        value={currency}
        onChange={setCurrency}
        options={currencyOptions}
        disabled={!canChangeCurrency}
        required={canChangeCurrency}
      />
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}

function NewAccountForm({
  typeOptions,
  currencyOptions,
  onDone,
  onError,
}: {
  typeOptions: DropdownOption[];
  currencyOptions: DropdownOption[];
  onDone: () => void;
  onError: (s: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [currency, setCurrency] = useState("");
  const [opening, setOpening] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !type || !currency) {
      onError("Choose account type and currency.");
      return;
    }
    setBusy(true);
    onError(null);
    try {
      await apiFetch("/api/accounts", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          type,
          currency,
          opening_balance: Number(opening || "0"),
        }),
      });
      setName("");
      setType("");
      setCurrency("");
      setOpening("");
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
      <Dropdown label="Type" value={type} onChange={setType} options={typeOptions} required />
      <Dropdown
        label="Currency"
        value={currency}
        onChange={setCurrency}
        options={currencyOptions}
        required
      />
      <TextField
        label="Opening balance"
        type="number"
        inputMode="decimal"
        step="0.01"
        value={opening}
        onChange={(e) => setOpening(e.target.value)}
      />
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Saving…" : "Create account"}
      </Button>
    </form>
  );
}

function TransferForm({
  accountOptions,
  accounts,
  onDone,
  onError,
}: {
  accountOptions: DropdownOption[];
  accounts: AccountDto[];
  onDone: () => void;
  onError: (s: string | null) => void;
}) {
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [rate, setRate] = useState("");
  const [busy, setBusy] = useState(false);

  const fromAcc = accounts.find((a) => a.id === fromId);
  const toAcc = accounts.find((a) => a.id === toId);
  const cross = fromAcc && toAcc && fromAcc.currency !== toAcc.currency;

  useEffect(() => {
    if (!fromAcc || !toAcc) return;
    const d = defaultTransferExchangeRate(fromAcc.currency, toAcc.currency);
    if (d != null) setRate(String(d));
    else if (fromAcc.currency === toAcc.currency) setRate("");
    else setRate("");
  }, [fromAcc, toAcc]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!fromId || !toId) {
      onError("Select both accounts.");
      return;
    }
    if (fromId === toId) {
      onError("From and to must differ.");
      return;
    }
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      onError("Enter a valid amount.");
      return;
    }
    if (cross) {
      const r = Number(rate);
      if (!r || r <= 0) {
        onError("Enter exchange rate (to-currency per 1 from-currency).");
        return;
      }
    }
    setBusy(true);
    onError(null);
    try {
      await apiFetch("/api/accounts/transfer", {
        method: "POST",
        body: JSON.stringify({
          from_account_id: fromId,
          to_account_id: toId,
          amount: amt,
          date,
          notes: notes.trim() || undefined,
          ...(cross ? { exchange_rate: Number(rate) } : {}),
        }),
      });
      setFromId("");
      setToId("");
      setAmount("");
      setNotes("");
      setRate("");
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
        label="From"
        value={fromId}
        onChange={setFromId}
        options={accountOptions}
        disabled={accountOptions.length === 0}
      />
      <Dropdown
        label="To"
        value={toId}
        onChange={setToId}
        options={accountOptions}
        disabled={accountOptions.length === 0}
      />
      <TextField
        label={`Amount (${fromAcc?.currency ?? "from"})`}
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0.01"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        required
      />
      <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      {cross ? (
        <TextField
          label={`Exchange rate (1 ${fromAcc!.currency} = ? ${toAcc!.currency})`}
          type="number"
          inputMode="decimal"
          step="0.000001"
          min="0.000001"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          required
        />
      ) : null}
      <TextField label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button type="submit" className="w-full" disabled={busy || accountOptions.length < 2}>
        {busy ? "Saving…" : "Save transfer"}
      </Button>
    </form>
  );
}
