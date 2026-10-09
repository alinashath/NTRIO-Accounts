import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/api/http";
import { Dropdown, type DropdownOption } from "@/components/Dropdown";
import { Modal } from "@/components/Modal";
import { Button, Card, TextField } from "@/components/ui";
import { useDisplayCurrency } from "@/context/DisplayCurrencyContext";
import type { CategoryDto, SettingsUserDto } from "../../../shared/types";

export function SettingsPage() {
  const { refreshFx, globalUsdMvrRate, fxRates } = useDisplayCurrency();
  const [incomeCats, setIncomeCats] = useState<CategoryDto[]>([]);
  const [expenseCats, setExpenseCats] = useState<CategoryDto[]>([]);
  const [users, setUsers] = useState<SettingsUserDto[]>([]);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [fxInput, setFxInput] = useState("");
  const [fxDate, setFxDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [fxBusy, setFxBusy] = useState(false);

  const recentFxRates = useMemo(() => {
    const sorted = [...fxRates].sort((a, b) => b.rate_date.localeCompare(a.rate_date));
    return sorted.filter((r) => r.rate_date !== "1970-01-01").slice(0, 12);
  }, [fxRates]);

  const refresh = useCallback(async () => {
    const [inc, exp] = await Promise.all([
      apiFetch<CategoryDto[]>("/api/categories?type=income"),
      apiFetch<CategoryDto[]>("/api/categories?type=expense"),
    ]);
    setIncomeCats(inc);
    setExpenseCats(exp);
  }, []);

  const refreshUsers = useCallback(async () => {
    setUsersError(null);
    try {
      const list = await apiFetch<SettingsUserDto[]>("/api/settings/users");
      setUsers(list);
    } catch (e) {
      setUsers([]);
      setUsersError(e instanceof Error ? e.message : "Could not load users");
    }
  }, []);

  useEffect(() => {
    void refresh().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [refresh]);

  useEffect(() => {
    void refreshUsers();
  }, [refreshUsers]);

  useEffect(() => {
    setFxInput(String(globalUsdMvrRate));
  }, [globalUsdMvrRate]);

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 md:text-xl">Settings</h2>
        </div>
        <Button type="button" onClick={() => setModalOpen(true)}>
          Add category
        </Button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <Card>
        <h3 className="text-sm font-semibold text-slate-900">Global exchange rate</h3>
        <p className="mt-1 text-xs text-slate-500">
          Saving stores a daily rate for the chosen date. That rate applies forward until you save a
          newer one. Dates before any saved rate use 1 USD = 20 MVR.
        </p>
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const v = Number(fxInput);
            if (!v || v <= 0) {
              setError("Enter a positive rate (MVR per 1 USD).");
              return;
            }
            if (!/^\d{4}-\d{2}-\d{2}$/.test(fxDate)) {
              setError("Enter a valid rate date.");
              return;
            }
            setFxBusy(true);
            setError(null);
            void apiFetch("/api/settings", {
              method: "PATCH",
              body: JSON.stringify({ global_usd_mvr_rate: v, rate_date: fxDate }),
            })
              .then(() => refreshFx())
              .catch((err) => setError(err instanceof Error ? err.message : "Failed"))
              .finally(() => setFxBusy(false));
          }}
        >
          <div className="min-w-[10rem] flex-1">
            <TextField
              label="1 USD = ? MVR"
              type="number"
              inputMode="decimal"
              step="0.0001"
              min="0.0001"
              value={fxInput}
              onChange={(e) => setFxInput(e.target.value)}
            />
          </div>
          <div className="min-w-[10rem]">
            <TextField
              label="Effective date"
              type="date"
              value={fxDate}
              onChange={(e) => setFxDate(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={fxBusy}>
            {fxBusy ? "Saving…" : "Save rate"}
          </Button>
        </form>
        {recentFxRates.length ? (
          <div className="mt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Recent rates
            </h4>
            <ul className="mt-2 divide-y divide-slate-100 text-sm">
              {recentFxRates.map((r) => (
                <li key={r.rate_date} className="flex justify-between gap-2 py-1.5">
                  <span className="text-slate-600">{r.rate_date}</span>
                  <span className="tabular-nums text-slate-900">
                    1 USD = {r.usd_mvr_rate.toFixed(4)} MVR
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-slate-900">App users</h3>
        <p className="mt-1 text-xs text-slate-500">
          New accounts are active immediately (no email confirmation). Share the password with the
          person directly.
        </p>
        {usersError ? <p className="mt-2 text-sm text-red-600">{usersError}</p> : null}
        <AddUserForm
          onCreated={() => {
            void refreshUsers();
          }}
          onError={setUsersError}
        />
        <ul className="mt-4 divide-y divide-slate-100 text-sm">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
              <span className="font-medium text-slate-800">{u.email ?? u.id}</span>
              <span className="text-xs text-slate-500">
                {new Date(u.created_at).toLocaleString()}
              </span>
            </li>
          ))}
          {!users.length && !usersError ? (
            <li className="py-2 text-slate-500">No users loaded.</li>
          ) : null}
        </ul>
      </Card>

      <Modal open={modalOpen} title="Add category" onClose={() => setModalOpen(false)}>
        <CategoryForm
          onDone={() => {
            setModalOpen(false);
            void refresh().catch(() => {});
          }}
          onError={setError}
        />
      </Modal>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="text-sm font-semibold text-slate-900">Income categories</h3>
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {incomeCats.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 py-3">
                <span>{c.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  className="shrink-0 text-xs"
                  onClick={() => void removeCategory(c.id, refresh, setError)}
                >
                  Remove
                </Button>
              </li>
            ))}
            {!incomeCats.length ? <li className="py-3 text-slate-500">None yet.</li> : null}
          </ul>
        </Card>
        <Card>
          <h3 className="text-sm font-semibold text-slate-900">Expense categories</h3>
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {expenseCats.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{c.name}</p>
                  {c.budget_limit != null ? (
                    <p className="text-xs text-slate-500">
                      Budget{" "}
                      {c.budget_limit.toLocaleString(undefined, { style: "currency", currency: "USD" })}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="shrink-0 text-xs"
                  onClick={() => void removeCategory(c.id, refresh, setError)}
                >
                  Remove
                </Button>
              </li>
            ))}
            {!expenseCats.length ? <li className="py-3 text-slate-500">None yet.</li> : null}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function AddUserForm({
  onCreated,
  onError,
}: {
  onCreated: () => void;
  onError: (s: string | null) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    onError(null);
    setDoneMsg(null);
    try {
      await apiFetch<{ id: string; email: string }>("/api/settings/users", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });
      setEmail("");
      setPassword("");
      setDoneMsg("User created. They can sign in with this email and password.");
      onCreated();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(e) => void submit(e)}>
      <div className="min-w-[12rem] flex-1">
        <TextField
          label="Email"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="min-w-[10rem] flex-1">
        <TextField
          label="Initial password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? "Creating…" : "Add user"}
      </Button>
      {doneMsg ? <p className="w-full text-sm text-emerald-700">{doneMsg}</p> : null}
    </form>
  );
}

async function removeCategory(
  id: string,
  refresh: () => Promise<void>,
  onError: (s: string | null) => void,
) {
  onError(null);
  try {
    await apiFetch(`/api/categories/${id}`, { method: "DELETE" });
    await refresh();
  } catch (e) {
    onError(e instanceof Error ? e.message : "Failed");
  }
}

function CategoryForm({
  onDone,
  onError,
}: {
  onDone: () => void;
  onError: (s: string | null) => void;
}) {
  const kindOpts: DropdownOption[] = useMemo(
    () => [
      { value: "income", label: "Income" },
      { value: "expense", label: "Expense" },
    ],
    [],
  );
  const [name, setName] = useState("");
  const [kind, setKind] = useState("");
  const [budget, setBudget] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!kind) {
      onError("Select type.");
      return;
    }
    setBusy(true);
    onError(null);
    try {
      await apiFetch("/api/categories", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          type: kind,
          ...(kind === "expense" && budget.trim()
            ? { budget_limit: Number(budget) }
            : {}),
        }),
      });
      setName("");
      setKind("");
      setBudget("");
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
      <Dropdown label="Type" value={kind} onChange={setKind} options={kindOpts} />
      {kind === "expense" ? (
        <TextField
          label="Budget limit (optional)"
          type="number"
          step="0.01"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
        />
      ) : null}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Saving…" : "Add category"}
      </Button>
    </form>
  );
}
