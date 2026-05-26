import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Filter } from "lucide-react";
import { apiFetch } from "@/api/http";
import { Dropdown, type DropdownOption } from "@/components/Dropdown";
import { Modal } from "@/components/Modal";
import { ReceiptAttachmentField } from "@/components/ReceiptAttachmentField";
import { SkeletonLine, SkeletonTableRows } from "@/components/Skeleton";
import { DisplayAmountCell } from "@/components/DisplayAmountCell";
import { ReceiptPreviewIcon } from "@/components/ReceiptPreviewIcon";
import { Button, Card, TextField } from "@/components/ui";
import { ACCOUNT_CURRENCIES } from "@/lib/fx";
import { useAuthStore } from "@/store/auth";
import type {
  AccountDto,
  CategoryDto,
  ContactDto,
  IncomeEntryDto,
  PagedIncomeListDto,
} from "../../../shared/types";

const PAGE_SIZE = 25;
const PENDING_ACCOUNT_FILTER = "__pending__";

function compareIncomeListOrder(a: IncomeEntryDto, b: IncomeEntryDto) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

function sortIncomeRows(list: IncomeEntryDto[]) {
  return [...list].sort(compareIncomeListOrder);
}

function dateInputValue(d: string) {
  return d.includes("T") ? d.slice(0, 10) : d.slice(0, 10);
}

export function IncomePage() {
  const userId = useAuthStore((s) => s.session?.user.id ?? "");
  const [rows, setRows] = useState<IncomeEntryDto[]>([]);
  const [total, setTotal] = useState(0);
  const [accounts, setAccounts] = useState<AccountDto[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [contacts, setContacts] = useState<ContactDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [detail, setDetail] = useState<IncomeEntryDto | null>(null);
  const [showVoided, setShowVoided] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterCategoryId, setFilterCategoryId] = useState("");
  const [filterAccountId, setFilterAccountId] = useState("");
  const [incomeType, setIncomeType] = useState<"all" | "uncategorized">("all");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  const filterKey = useMemo(
    () =>
      [
        debouncedSearch,
        dateFrom,
        dateTo,
        filterCategoryId,
        filterAccountId,
        incomeType,
        showVoided ? "1" : "0",
      ].join("\u0001"),
    [
      debouncedSearch,
      dateFrom,
      dateTo,
      filterCategoryId,
      filterAccountId,
      incomeType,
      showVoided,
    ],
  );

  const prevFilterKey = useRef(filterKey);

  const filtersActive = useMemo(
    () =>
      Boolean(
        searchInput.trim() ||
          debouncedSearch ||
          dateFrom ||
          dateTo ||
          filterCategoryId ||
          filterAccountId ||
          incomeType !== "all",
      ),
    [
      searchInput,
      debouncedSearch,
      dateFrom,
      dateTo,
      filterCategoryId,
      filterAccountId,
      incomeType,
    ],
  );

  const clearListFilters = useCallback(() => {
    setSearchInput("");
    setDebouncedSearch("");
    setDateFrom("");
    setDateTo("");
    setFilterCategoryId("");
    setFilterAccountId("");
    setIncomeType("all");
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const buildListUrl = useCallback(
    (p: number) => {
      const q = new URLSearchParams();
      q.set("limit", String(PAGE_SIZE));
      q.set("page", String(p));
      q.set("status", showVoided ? "all" : "active");
      if (debouncedSearch) q.set("search", debouncedSearch);
      if (dateFrom) q.set("from", dateFrom);
      if (dateTo) q.set("to", dateTo);
      if (filterCategoryId) q.set("category_id", filterCategoryId);
      if (filterAccountId === PENDING_ACCOUNT_FILTER) q.set("pending_receivable", "true");
      else if (filterAccountId) q.set("account_id", filterAccountId);
      if (incomeType === "uncategorized") q.set("income_type", "uncategorized");
      return `/api/income?${q.toString()}`;
    },
    [
      showVoided,
      debouncedSearch,
      dateFrom,
      dateTo,
      filterCategoryId,
      filterAccountId,
      incomeType,
    ],
  );

  useEffect(() => {
    let cancelled = false;
    const fkChanged = prevFilterKey.current !== filterKey;
    if (fkChanged) prevFilterKey.current = filterKey;

    const effectivePage = fkChanged ? 1 : page;
    if (fkChanged && page !== 1) {
      setPage(1);
    }

    async function run() {
      if (effectivePage === 1) setLoading(true);
      else setLoadingMore(true);
      try {
        const res = await apiFetch<PagedIncomeListDto>(buildListUrl(effectivePage));
        if (cancelled) return;
        setTotal(res.total);
        if (effectivePage === 1) setRows(res.items);
        else setRows((prev) => [...prev, ...res.items]);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed");
      } finally {
        if (!cancelled) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [page, filterKey, refreshKey, buildListUrl]);

  const reload = useCallback(() => {
    setPage(1);
    setRefreshKey((k) => k + 1);
  }, []);

  const mergeIncomeListRow = useCallback(
    (row: IncomeEntryDto) => {
      setRows((prev) => {
        if (!showVoided && row.voided_at) {
          return prev.filter((r) => r.id !== row.id);
        }
        const idx = prev.findIndex((r) => r.id === row.id);
        const merged = idx === -1 ? [...prev, row] : prev.map((r) => (r.id === row.id ? row : r));
        return sortIncomeRows(merged);
      });
      if (!showVoided && row.voided_at) {
        setTotal((t) => Math.max(0, t - 1));
      }
    },
    [showVoided],
  );

  const removeIncomeListRow = useCallback((id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setTotal((t) => Math.max(0, t - 1));
  }, []);

  const loadMeta = useCallback(async () => {
    try {
      const [accs, cats, cont] = await Promise.all([
        apiFetch<AccountDto[]>("/api/accounts"),
        apiFetch<CategoryDto[]>("/api/categories?type=income"),
        apiFetch<ContactDto[]>("/api/contacts"),
      ]);
      setAccounts(accs);
      setCategories(cats);
      setContacts(cont);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }, []);

  useEffect(() => {
    void loadMeta().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [loadMeta]);

  useEffect(() => {
    if (!modalOpen) return;
    void Promise.all([
      apiFetch<CategoryDto[]>("/api/categories?type=income"),
      apiFetch<ContactDto[]>("/api/contacts"),
    ])
      .then(([cats, cont]) => {
        setCategories(cats);
        setContacts(cont);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [modalOpen]);

  const accountOpts: DropdownOption[] = useMemo(
    () => accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` })),
    [accounts],
  );
  const catOpts: DropdownOption[] = useMemo(
    () => categories.map((c) => ({ value: c.id, label: c.name })),
    [categories],
  );
  const contactOpts: DropdownOption[] = useMemo(
    () =>
      [...contacts].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({
        value: c.id,
        label: `${c.name} (${c.kind})`,
      })),
    [contacts],
  );

  const catDropdownOpts: DropdownOption[] = useMemo(() => (catOpts.length > 0 ? catOpts : []), [catOpts]);

  const filterCategoryOpts: DropdownOption[] = useMemo(
    () => [{ value: "", label: "Any category" }, ...catOpts],
    [catOpts],
  );
  const filterAccountOpts: DropdownOption[] = useMemo(
    () => [
      { value: "", label: "Any account" },
      { value: PENDING_ACCOUNT_FILTER, label: "Receivable (pending)" },
      ...accountOpts,
    ],
    [accountOpts],
  );
  const incomeTypeOpts: DropdownOption[] = useMemo(
    () => [
      { value: "all", label: "All categories" },
      { value: "uncategorized", label: "Uncategorized only" },
    ],
    [],
  );

  const hasMore = rows.length < total;

  const createIncomeCategory = useCallback(async (name: string) => {
    const row = await apiFetch<CategoryDto>("/api/categories", {
      method: "POST",
      body: JSON.stringify({ name: name.trim(), type: "income" }),
    });
    setCategories((prev) => {
      const rest = prev.filter((c) => c.id !== row.id);
      return [...rest, row].sort((a, b) => a.name.localeCompare(b.name));
    });
    return row.id;
  }, []);

  const createCustomerContact = useCallback(async (name: string) => {
    const row = await apiFetch<{ id: string }>("/api/contacts", {
      method: "POST",
      body: JSON.stringify({ name: name.trim(), kind: "customer" }),
    });
    const newContact: ContactDto = {
      id: row.id,
      name: name.trim(),
      kind: "customer",
      email: null,
      phone: null,
      tgst_number: null,
      notes: null,
      created_at: new Date().toISOString(),
    };
    setContacts((prev) =>
      [...prev.filter((c) => c.id !== row.id), newContact].sort((a, b) => a.name.localeCompare(b.name)),
    );
    return row.id;
  }, []);

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 md:text-xl">Income</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            className="relative min-w-11 px-3"
            aria-label="Search and filters"
            title="Search and filters"
            onClick={() => setFilterModalOpen(true)}
          >
            <Filter className="h-5 w-5 text-slate-700" aria-hidden />
            {filtersActive ? (
              <span
                className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-slate-900"
                aria-hidden
              />
            ) : null}
          </Button>
          <Button type="button" disabled={loading} onClick={() => setModalOpen(true)}>
            Add income
          </Button>
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={showVoided}
          onChange={(e) => setShowVoided(e.target.checked)}
          className="rounded border-slate-300"
        />
        Show voided in list
      </label>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <Modal
        open={filterModalOpen}
        title="Search & filters"
        size="lg"
        onClose={() => setFilterModalOpen(false)}
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Description, notes, source, category, customer…"
            />
            <TextField label="From date" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <TextField label="To date" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            <Dropdown
              label="Category"
              value={filterCategoryId}
              onChange={setFilterCategoryId}
              options={filterCategoryOpts}
              required={false}
              placeholder="Any category"
            />
            <Dropdown
              label="Account"
              value={filterAccountId}
              onChange={setFilterAccountId}
              options={filterAccountOpts}
              required={false}
              placeholder="Any account"
            />
            <Dropdown
              label="Type"
              value={incomeType}
              onChange={(v) => setIncomeType(v === "uncategorized" ? "uncategorized" : "all")}
              options={incomeTypeOpts}
              required={false}
              searchable={false}
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
            <Button type="button" variant="ghost" onClick={clearListFilters}>
              Clear filters
            </Button>
            <Button type="button" onClick={() => setFilterModalOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={modalOpen} title="New income" size="lg" onClose={() => setModalOpen(false)}>
        <IncomeForm
          userId={userId}
          accounts={accounts}
          accountOptions={accountOpts}
          categoryOptions={catDropdownOpts}
          contactOptions={contactOpts}
          createIncomeCategory={createIncomeCategory}
          createCustomerContact={createCustomerContact}
          onDone={() => {
            setModalOpen(false);
            reload();
          }}
          onError={setError}
        />
      </Modal>

      <Modal open={detail !== null} title="Income details" onClose={() => setDetail(null)}>
        {detail ? (
          <IncomeDetailPanel
            row={detail}
            userId={userId}
            accounts={accounts}
            accountOptions={accountOpts}
            categoryOptions={catDropdownOpts}
            contactOptions={contactOpts}
            createIncomeCategory={createIncomeCategory}
            createCustomerContact={createCustomerContact}
            onClose={() => setDetail(null)}
            onListChange={(e) => {
              if (e.kind === "delete") {
                removeIncomeListRow(e.id);
                return;
              }
              mergeIncomeListRow(e.row);
            }}
            onError={setError}
          />
        ) : null}
      </Modal>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-4">
              <SkeletonLine className="mb-3 h-8 w-full" />
              <SkeletonTableRows rows={8} />
            </div>
          ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="w-10 px-2 py-3 text-center" aria-label="Receipt" />
                <th className="px-3 py-3">Dates</th>
                <th className="px-3 py-3">Description</th>
                <th className="px-3 py-3">Customer</th>
                <th className="px-3 py-3">Category</th>
                <th className="px-3 py-3">Account</th>
                <th className="px-3 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={`cursor-pointer border-b border-slate-100 hover:bg-slate-50 ${r.voided_at ? "opacity-60" : ""}`}
                  onClick={() => setDetail(r)}
                >
                  <td className="px-2 py-3 align-top text-center" onClick={(e) => e.stopPropagation()}>
                    {r.attachment_url ? <ReceiptPreviewIcon url={r.attachment_url} /> : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 align-top">
                    <div className="text-slate-900">{dateInputValue(r.date)}</div>
                    {r.received_date ? (
                      <div className="text-[11px] text-slate-500">In {dateInputValue(r.received_date)}</div>
                    ) : r.pending_receivable ? (
                      <div className="text-[11px] text-amber-700">Pending</div>
                    ) : null}
                  </td>
                  <td className="max-w-[10rem] truncate px-3 py-3">
                    {r.description ?? "—"}
                    {r.voided_at ? (
                      <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-900">
                        VOID
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">{r.contact_name ?? "—"}</td>
                  <td className="px-3 py-3">{r.category_name ?? "—"}</td>
                  <td className="px-3 py-3">{r.account_name}</td>
                  <td className="px-3 py-3 text-right">
                    <DisplayAmountCell
                      amount={r.amount}
                      nativeCurrency={r.account_currency || "USD"}
                      className="font-medium text-emerald-700"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
        {!loading && rows.length > 0 ? (
          <div className="flex flex-col items-center gap-2 border-t border-slate-100 px-4 py-3 sm:flex-row sm:justify-between">
            <p className="text-xs text-slate-600">
              Showing {rows.length} of {total} (newest first)
            </p>
            {hasMore ? (
              <Button
                type="button"
                variant="ghost"
                disabled={loadingMore}
                onClick={() => setPage((p) => p + 1)}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            ) : (
              <span className="text-xs text-slate-400">End of list</span>
            )}
          </div>
        ) : null}
        {!loading && !rows.length ? (
          <p className="p-4 text-center text-sm text-slate-500">No income matches these filters.</p>
        ) : null}
      </Card>
    </div>
  );
}

function IncomeForm({
  userId,
  accounts,
  accountOptions,
  categoryOptions,
  contactOptions,
  createIncomeCategory,
  createCustomerContact,
  onDone,
  onError,
}: {
  userId: string;
  accounts: AccountDto[];
  accountOptions: DropdownOption[];
  categoryOptions: DropdownOption[];
  contactOptions: DropdownOption[];
  createIncomeCategory: (name: string) => Promise<string>;
  createCustomerContact: (name: string) => Promise<string>;
  onDone: () => void;
  onError: (s: string | null) => void;
}) {
  const [step, setStep] = useState(0);
  const [receivable, setReceivable] = useState(false);
  const [incomeCurrency, setIncomeCurrency] = useState("USD");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [receivedDate, setReceivedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [contactId, setContactId] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedAcc = accounts.find((a) => a.id === accountId);
  const amountCcy = receivable ? incomeCurrency : selectedAcc?.currency ?? "…";
  const currencyOpts: DropdownOption[] = useMemo(
    () => ACCOUNT_CURRENCIES.map((c) => ({ value: c, label: c })),
    [],
  );

  const stepTitles = ["Account & amount", "Details", "Receipt & save"] as const;

  function validateStep0(): string | null {
    if (!receivable && !accountId) return "Select an account.";
    const amt = Number(amount);
    if (!amt || amt <= 0) return "Enter a valid amount.";
    if (!date) return "Pick an earned date.";
    if (!receivable && !receivedDate) return "Pick a received / deposit date.";
    return null;
  }

  function goNext() {
    onError(null);
    if (step === 0) {
      const err = validateStep0();
      if (err) {
        onError(err);
        return;
      }
    }
    setStep((s) => Math.min(s + 1, 2));
  }

  function goBack() {
    onError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function submitSave() {
    if (!userId) {
      onError("You must be signed in.");
      return;
    }
    if (!receivable && !accountId) {
      onError("Select an account.");
      return;
    }
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      onError("Enter a valid amount.");
      return;
    }
    setBusy(true);
    onError(null);
    try {
      await apiFetch("/api/income", {
        method: "POST",
        body: JSON.stringify({
          amount: amt,
          date,
          pending_receivable: receivable,
          currency: receivable ? incomeCurrency : undefined,
          received_date: receivable ? undefined : receivedDate,
          description: description.trim() || undefined,
          account_id: receivable ? undefined : accountId,
          category_id: categoryId || undefined,
          contact_id: contactId || undefined,
          attachment_url: attachmentUrl.trim() || undefined,
        }),
      });
      setAmount("");
      setDescription("");
      setAccountId("");
      setCategoryId("");
      setContactId("");
      setAttachmentUrl("");
      setReceivable(false);
      setIncomeCurrency("USD");
      setReceivedDate(new Date().toISOString().slice(0, 10));
      setStep(0);
      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (step === 2) void submitSave();
      }}
    >
      <p className="text-xs font-medium text-slate-500">
        Step {step + 1} of 3 — {stepTitles[step]}
      </p>

      {step === 0 ? (
        <>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="rounded border-slate-300"
              checked={receivable}
              onChange={(e) => {
                setReceivable(e.target.checked);
                if (e.target.checked) setAccountId("");
              }}
            />
            Receivable (not deposited yet)
          </label>
          {receivable ? (
            <Dropdown
              label="Amount currency"
              value={incomeCurrency}
              onChange={setIncomeCurrency}
              options={currencyOpts}
              required
            />
          ) : (
            <Dropdown
              label="Deposit to (set account first)"
              value={accountId}
              onChange={setAccountId}
              options={accountOptions}
              disabled={accountOptions.length === 0}
            />
          )}
          <TextField
            label={`Amount (${amountCcy})`}
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
          <TextField label="Earned date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          {!receivable ? (
            <TextField
              label="Received / deposit date"
              type="date"
              value={receivedDate}
              onChange={(e) => setReceivedDate(e.target.value)}
              required
            />
          ) : null}
        </>
      ) : null}

      {step === 1 ? (
        <>
          <TextField
            label="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Dropdown
            label="Category (optional)"
            value={categoryId}
            onChange={setCategoryId}
            options={categoryOptions}
            required={false}
            placeholder="None"
            onAddNotFound={createIncomeCategory}
          />
          <Dropdown
            label="Customer / contact (optional)"
            value={contactId}
            onChange={setContactId}
            options={contactOptions}
            required={false}
            placeholder="None — search or add customer"
            onAddNotFound={createCustomerContact}
            addNotFoundLabel="Add customer"
          />
        </>
      ) : null}

      {step === 2 ? (
        <ReceiptAttachmentField
          attachmentUrl={attachmentUrl}
          onAttachmentUrlChange={setAttachmentUrl}
          userId={userId}
        />
      ) : null}

      <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:flex-row-reverse">
        {step < 2 ? (
          <Button type="button" className="w-full sm:flex-1" onClick={() => goNext()}>
            Next
          </Button>
        ) : (
          <Button type="submit" className="w-full sm:flex-1" disabled={busy}>
            {busy ? "Saving…" : "Save income"}
          </Button>
        )}
        {step > 0 ? (
          <Button type="button" variant="ghost" className="w-full sm:flex-1" onClick={goBack}>
            Back
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function IncomeDetailPanel({
  row,
  userId,
  accounts,
  accountOptions,
  categoryOptions,
  contactOptions,
  createIncomeCategory,
  createCustomerContact,
  onClose,
  onListChange,
  onError,
}: {
  row: IncomeEntryDto;
  userId: string;
  accounts: AccountDto[];
  accountOptions: DropdownOption[];
  categoryOptions: DropdownOption[];
  contactOptions: DropdownOption[];
  createIncomeCategory: (name: string) => Promise<string>;
  createCustomerContact: (name: string) => Promise<string>;
  onClose: () => void;
  onListChange: (e: { kind: "upsert"; row: IncomeEntryDto } | { kind: "delete"; id: string }) => void;
  onError: (s: string | null) => void;
}) {
  const pending = Boolean(row.pending_receivable);
  const [amount, setAmount] = useState(String(row.amount));
  const [earnedDate, setEarnedDate] = useState(dateInputValue(row.date));
  const [receivedDate, setReceivedDate] = useState(dateInputValue(row.received_date ?? row.date));
  const [description, setDescription] = useState(row.description ?? "");
  const [accountId, setAccountId] = useState(row.account_id ?? "");
  const [receiveAccountId, setReceiveAccountId] = useState("");
  const [receiveDate, setReceiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState(row.category_id ?? "");
  const [contactId, setContactId] = useState(row.contact_id ?? "");
  const [source, setSource] = useState(row.source ?? "");
  const [notes, setNotes] = useState(row.notes ?? "");
  const [attachmentUrl, setAttachmentUrl] = useState(row.attachment_url ?? "");
  const [voidReason, setVoidReason] = useState("");
  const [busy, setBusy] = useState(false);
  const voided = Boolean(row.voided_at);
  const selectedAcc = accounts.find((a) => a.id === accountId);
  const amountCcy = pending ? row.currency : selectedAcc?.currency ?? row.currency ?? "USD";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (voided) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      onError("Enter a valid amount.");
      return;
    }
    if (!pending && !accountId) {
      onError("Select an account.");
      return;
    }
    setBusy(true);
    onError(null);
    try {
      const body: Record<string, unknown> = {
        amount: amt,
        date: earnedDate,
        description: description.trim() || undefined,
        category_id: categoryId || null,
        contact_id: contactId || null,
        source: source.trim() || undefined,
        notes: notes.trim() || undefined,
        attachment_url: attachmentUrl.trim() || null,
      };
      if (!pending) {
        body.account_id = accountId;
        body.received_date = receivedDate;
      }
      const data = await apiFetch<{ row: IncomeEntryDto }>(`/api/income/${row.id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      onListChange({ kind: "upsert", row: data.row });
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function markReceived() {
    if (!receiveAccountId) {
      onError("Select an account to deposit into.");
      return;
    }
    setBusy(true);
    onError(null);
    try {
      const data = await apiFetch<{ row: IncomeEntryDto }>(`/api/income/${row.id}`, {
        method: "PUT",
        body: JSON.stringify({
          account_id: receiveAccountId,
          received_date: receiveDate,
        }),
      });
      onListChange({ kind: "upsert", row: data.row });
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function doVoid() {
    if (!window.confirm("Void this income? The account balance will be reconciled.")) return;
    setBusy(true);
    onError(null);
    try {
      const data = await apiFetch<{ row: IncomeEntryDto }>(`/api/income/${row.id}/void`, {
        method: "POST",
        body: JSON.stringify({ reason: voidReason.trim() || undefined }),
      });
      onListChange({ kind: "upsert", row: data.row });
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function doUnvoid() {
    setBusy(true);
    onError(null);
    try {
      const data = await apiFetch<{ row: IncomeEntryDto }>(`/api/income/${row.id}/unvoid`, {
        method: "POST",
        body: "{}",
      });
      onListChange({ kind: "upsert", row: data.row });
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (!window.confirm("Delete this income? This cannot be undone.")) return;
    setBusy(true);
    onError(null);
    try {
      await apiFetch(`/api/income/${row.id}`, { method: "DELETE" });
      onListChange({ kind: "delete", id: row.id });
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {voided ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p className="font-semibold">Voided</p>
          {row.void_reason ? <p className="mt-1 text-xs">Reason: {row.void_reason}</p> : null}
        </div>
      ) : null}

      <div className="grid gap-2 text-sm text-slate-600">
        <p>
          <span className="font-medium text-slate-800">Account:</span> {row.account_name}
        </p>
        <p>
          <span className="font-medium text-slate-800">Currency:</span> {row.currency}
        </p>
        {row.attachment_url ? (
          <div className="flex items-center gap-2">
            <ReceiptPreviewIcon url={row.attachment_url} />
            <span>Receipt attached</span>
          </div>
        ) : (
          <p className="text-slate-500">No receipt attached.</p>
        )}
      </div>

      {!voided && pending ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
          <p className="text-sm font-semibold text-slate-900">Mark as received</p>
          <Dropdown
            label="Deposit to"
            value={receiveAccountId}
            onChange={setReceiveAccountId}
            options={accountOptions}
            disabled={accountOptions.length === 0}
          />
          <TextField label="Received date" type="date" value={receiveDate} onChange={(e) => setReceiveDate(e.target.value)} />
          <Button type="button" className="w-full" disabled={busy} onClick={() => void markReceived()}>
            {busy ? "Saving…" : "Deposit to account"}
          </Button>
        </div>
      ) : null}

      <form className="space-y-3 border-t border-slate-100 pt-3" onSubmit={(e) => void save(e)}>
        {!pending ? (
          <Dropdown
            label="Account"
            value={accountId}
            onChange={setAccountId}
            options={accountOptions}
            disabled={voided}
          />
        ) : null}
        <TextField
          label={`Amount (${amountCcy})`}
          type="number"
          step="0.01"
          min="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={voided}
        />
        <TextField
          label="Earned date"
          type="date"
          value={earnedDate}
          onChange={(e) => setEarnedDate(e.target.value)}
          disabled={voided}
        />
        {!pending ? (
          <TextField
            label="Received / deposit date"
            type="date"
            value={receivedDate}
            onChange={(e) => setReceivedDate(e.target.value)}
            disabled={voided}
          />
        ) : null}
        <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} disabled={voided} />
        <Dropdown
          label="Category (optional)"
          value={categoryId}
          onChange={setCategoryId}
          options={categoryOptions}
          required={false}
          placeholder="None"
          disabled={voided}
          onAddNotFound={voided ? undefined : createIncomeCategory}
        />
        <Dropdown
          label="Customer / contact (optional)"
          value={contactId}
          onChange={setContactId}
          options={contactOptions}
          required={false}
          placeholder="None — search or add customer"
          disabled={voided}
          onAddNotFound={voided ? undefined : createCustomerContact}
          addNotFoundLabel="Add customer"
        />
        <TextField label="Source (optional)" value={source} onChange={(e) => setSource(e.target.value)} disabled={voided} />
        <TextField label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={voided} />
        {!voided && userId ? (
          <ReceiptAttachmentField
            attachmentUrl={attachmentUrl}
            onAttachmentUrlChange={setAttachmentUrl}
            userId={userId}
          />
        ) : null}
        {!voided ? (
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        ) : null}
      </form>

      {!voided ? (
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <TextField
            label="Void reason (optional)"
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
          />
          <Button type="button" variant="ghost" className="w-full text-amber-900" disabled={busy} onClick={() => void doVoid()}>
            Void transaction
          </Button>
        </div>
      ) : (
        <Button type="button" className="w-full" variant="ghost" disabled={busy} onClick={() => void doUnvoid()}>
          Restore (unvoid)
        </Button>
      )}

      <Button type="button" variant="ghost" className="w-full text-red-700" disabled={busy} onClick={() => void doDelete()}>
        Delete (soft)
      </Button>
    </div>
  );
}
