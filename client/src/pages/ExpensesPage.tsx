import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Filter } from "lucide-react";
import { apiFetch } from "@/api/http";
import { Dropdown, type DropdownOption } from "@/components/Dropdown";
import { Modal } from "@/components/Modal";
import {
  emptyGstInvoiceState,
  emptyGstWithDefaultRate,
  GstInvoiceFields,
  gstBreakdownTotal,
  gstStateFromEntry,
  gstStateToPayload,
  hasGstData,
  validateGstBreakdown,
  type GstInvoiceState,
} from "@/components/GstInvoiceFields";
import { ReceiptAttachmentField } from "@/components/ReceiptAttachmentField";
import { SkeletonLine, SkeletonTableRows } from "@/components/Skeleton";
import { DisplayAmountCell } from "@/components/DisplayAmountCell";
import { ReceiptPreviewIcon } from "@/components/ReceiptPreviewIcon";
import { ProjectFilter } from "@/components/ProjectFilter";
import { Button, Card, ChoiceList, FormActions, FormStepHeader, TextField } from "@/components/ui";
import { appendProjectFilter, useProjects } from "@/context/ProjectsContext";
import { ACCOUNT_CURRENCIES } from "@/lib/fx";
import { useAuthStore } from "@/store/auth";
import type {
  AccountDto,
  CategoryDto,
  ContactDto,
  DebtDto,
  ExpenseEntryDto,
  PagedExpenseListDto,
} from "../../../shared/types";

const PAGE_SIZE = 25;

function compareExpenseListOrder(a: ExpenseEntryDto, b: ExpenseEntryDto) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

function sortExpenseRows(list: ExpenseEntryDto[]) {
  return [...list].sort(compareExpenseListOrder);
}

function dateInputValue(d: string) {
  return d.includes("T") ? d.slice(0, 10) : d.slice(0, 10);
}

export function ExpensesPage() {
  const userId = useAuthStore((s) => s.session?.user.id ?? "");
  const { projectsEnabled, projects, createProject, refresh: refreshProjects } = useProjects();
  const [rows, setRows] = useState<ExpenseEntryDto[]>([]);
  const [total, setTotal] = useState(0);
  const [accounts, setAccounts] = useState<AccountDto[]>([]);
  const [debts, setDebts] = useState<DebtDto[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [contacts, setContacts] = useState<ContactDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [detail, setDetail] = useState<ExpenseEntryDto | null>(null);
  const [showVoided, setShowVoided] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterCategoryId, setFilterCategoryId] = useState("");
  const [filterProjectId, setFilterProjectId] = useState("");
  const [filterAccountId, setFilterAccountId] = useState("");
  const [settlement, setSettlement] = useState<"all" | "account" | "debt" | "pay_later">("all");
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
        filterProjectId,
        settlement,
        showVoided ? "1" : "0",
      ].join("\u0001"),
    [debouncedSearch, dateFrom, dateTo, filterCategoryId, filterAccountId, filterProjectId, settlement, showVoided],
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
          filterProjectId ||
          settlement !== "all",
      ),
    [searchInput, debouncedSearch, dateFrom, dateTo, filterCategoryId, filterAccountId, filterProjectId, settlement],
  );

  const clearListFilters = useCallback(() => {
    setSearchInput("");
    setDebouncedSearch("");
    setDateFrom("");
    setDateTo("");
    setFilterCategoryId("");
    setFilterAccountId("");
    setFilterProjectId("");
    setSettlement("all");
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
      appendProjectFilter(q, filterProjectId);
      if (filterAccountId) q.set("account_id", filterAccountId);
      if (settlement !== "all") q.set("settlement", settlement);
      return `/api/expenses?${q.toString()}`;
    },
    [
      showVoided,
      debouncedSearch,
      dateFrom,
      dateTo,
      filterCategoryId,
      filterAccountId,
      filterProjectId,
      settlement,
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
        const res = await apiFetch<PagedExpenseListDto>(buildListUrl(effectivePage));
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

  const mergeExpenseListRow = useCallback(
    (row: ExpenseEntryDto) => {
      setRows((prev) => {
        if (!showVoided && row.voided_at) {
          return prev.filter((r) => r.id !== row.id);
        }
        const idx = prev.findIndex((r) => r.id === row.id);
        const merged = idx === -1 ? [...prev, row] : prev.map((r) => (r.id === row.id ? row : r));
        return sortExpenseRows(merged);
      });
      if (!showVoided && row.voided_at) {
        setTotal((t) => Math.max(0, t - 1));
      }
    },
    [showVoided],
  );

  const removeExpenseListRow = useCallback((id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setTotal((t) => Math.max(0, t - 1));
  }, []);

  const loadMeta = useCallback(async () => {
    try {
      const [accs, debtList, cats, cont] = await Promise.all([
        apiFetch<AccountDto[]>("/api/accounts"),
        apiFetch<DebtDto[]>("/api/debts?status=open"),
        apiFetch<CategoryDto[]>("/api/categories?type=expense"),
        apiFetch<ContactDto[]>("/api/contacts"),
      ]);
      setAccounts(accs);
      setDebts(debtList);
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
      apiFetch<CategoryDto[]>("/api/categories?type=expense"),
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

  const debtChargeOpts: DropdownOption[] = useMemo(
    () =>
      debts
        .filter((d) => d.direction === "i_owe")
        .map((d) => ({
          value: d.id,
          label: `${d.contact_name} (${d.currency})`,
        })),
    [debts],
  );

  const catDropdownOpts: DropdownOption[] = useMemo(() => (catOpts.length > 0 ? catOpts : []), [catOpts]);

  const filterCategoryOpts: DropdownOption[] = useMemo(
    () => [{ value: "", label: "Any category" }, ...catOpts],
    [catOpts],
  );
  const filterAccountOpts: DropdownOption[] = useMemo(
    () => [{ value: "", label: "Any account" }, ...accountOpts],
    [accountOpts],
  );
  const settlementOpts: DropdownOption[] = useMemo(
    () => [
      { value: "all", label: "All types" },
      { value: "account", label: "Bank / cash / wallet" },
      { value: "debt", label: "Charged to debt" },
      { value: "pay_later", label: "Pay later" },
    ],
    [],
  );

  const hasMore = rows.length < total;

  const createExpenseCategory = useCallback(async (name: string) => {
    const row = await apiFetch<CategoryDto>("/api/categories", {
      method: "POST",
      body: JSON.stringify({ name: name.trim(), type: "expense" }),
    });
    setCategories((prev) => {
      const rest = prev.filter((c) => c.id !== row.id);
      return [...rest, row].sort((a, b) => a.name.localeCompare(b.name));
    });
    return row.id;
  }, []);

  const createExpenseProject = useCallback(
    async (name: string) => {
      const id = await createProject(name.trim());
      await refreshProjects();
      return id;
    },
    [createProject, refreshProjects],
  );

  const projectOpts: DropdownOption[] = useMemo(
    () => projects.map((p) => ({ value: p.id, label: p.name })),
    [projects],
  );


  const createVendorContact = useCallback(async (name: string) => {
    const row = await apiFetch<{ id: string }>("/api/contacts", {
      method: "POST",
      body: JSON.stringify({ name: name.trim(), kind: "vendor" }),
    });
    const newContact: ContactDto = {
      id: row.id,
      name: name.trim(),
      kind: "vendor",
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-page-title text-ink">Spend</h2>
          {!loading ? (
            <p className="mt-0.5 text-caption">
              {total} entr{total === 1 ? "y" : "ies"}
              {filtersActive ? " · filtered" : ""}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-caption">
            <input
              type="checkbox"
              checked={showVoided}
              onChange={(e) => setShowVoided(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Voided
          </label>
          <Button
            type="button"
            variant="ghost"
            className="relative gap-1.5"
            aria-label="Search and filters"
            title="Search and filters"
            onClick={() => setFilterModalOpen(true)}
          >
            <Filter className="h-4 w-4" aria-hidden />
            Filters
            {filtersActive ? (
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-action" aria-hidden />
            ) : null}
          </Button>
          <Button type="button" disabled={loading} onClick={() => setModalOpen(true)}>
            Add
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-debit">{error}</p> : null}

      <Modal
        open={filterModalOpen}
        title="Search & filters"
        size="md"
        onClose={() => setFilterModalOpen(false)}
      >
        <div className="space-y-3">
          <TextField
            label="Search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Description, notes, merchant, category…"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="From" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <TextField label="To" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            <Dropdown
              label="Category"
              value={filterCategoryId}
              onChange={setFilterCategoryId}
              options={filterCategoryOpts}
              required={false}
              placeholder="Any category"
            />
            <ProjectFilter value={filterProjectId} onChange={setFilterProjectId} />
            <Dropdown
              label="Account"
              value={filterAccountId}
              onChange={setFilterAccountId}
              options={filterAccountOpts}
              required={false}
              placeholder="Any account"
            />
            <Dropdown
              label="Settlement"
              value={settlement}
              onChange={(v) =>
                setSettlement(
                  v === "account" || v === "debt" || v === "pay_later" ? v : "all",
                )
              }
              options={settlementOpts}
              required={false}
              searchable={false}
            />
          </div>
          <div className="flex flex-wrap justify-end gap-1.5 border-t border-border pt-3">
            <Button type="button" variant="ghost" onClick={clearListFilters}>
              Clear
            </Button>
            <Button type="button" onClick={() => setFilterModalOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={modalOpen}
        title="New expense"
        size="lg"
        variant="form"
        closeOnDismiss={false}
        onClose={() => setModalOpen(false)}
      >
        <ExpenseForm
          userId={userId}
          accounts={accounts}
          debts={debts}
          accountOptions={accountOpts}
          debtOptions={debtChargeOpts}
          categoryOptions={catDropdownOpts}
          contactOptions={contactOpts}
          createExpenseCategory={createExpenseCategory}
          projectOptions={projectOpts}
          projectsEnabled={projectsEnabled}
          createExpenseProject={createExpenseProject}
          createVendorContact={createVendorContact}
          onDone={() => {
            setModalOpen(false);
            reload();
          }}
          onCancel={() => setModalOpen(false)}
          onError={setError}
        />
      </Modal>

      <Modal
        open={detail !== null}
        title="Edit expense"
        size="lg"
        variant="form"
        closeOnDismiss={false}
        onClose={() => setDetail(null)}
      >
        {detail ? (
          <ExpenseDetailPanel
            key={detail.id}
            row={detail}
            userId={userId}
            accounts={accounts}
            debts={debts}
            accountOptions={accountOpts}
            debtOptions={debtChargeOpts}
            categoryOptions={catDropdownOpts}
            contactOptions={contactOpts}
            createExpenseCategory={createExpenseCategory}
          projectOptions={projectOpts}
          projectsEnabled={projectsEnabled}
          createExpenseProject={createExpenseProject}
            createVendorContact={createVendorContact}
            onClose={() => setDetail(null)}
            onListChange={(e) => {
              if (e.kind === "delete") {
                removeExpenseListRow(e.id);
                return;
              }
              mergeExpenseListRow(e.row);
            }}
            onError={setError}
          />
        ) : null}
      </Modal>

      <Card className="overflow-hidden p-0">
        {loading ? (
          <div className="space-y-2 p-3">
            <SkeletonLine className="h-8 w-full" />
            <SkeletonTableRows rows={6} />
          </div>
        ) : rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            No expenses{filtersActive ? " match these filters" : " yet"}.
          </p>
        ) : (
          <ul className="divide-y divide-border/70">
            {rows.map((r) => (
              <li
                key={r.id}
                className={`flex min-h-11 items-start gap-2 px-3 py-2.5 transition hover:bg-neutral-bg/60 ${
                  r.voided_at ? "opacity-60" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => setDetail(r)}
                  className="flex min-w-0 flex-1 items-start gap-2 text-left"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-negative" aria-hidden />
                  <span className="w-[3.75rem] shrink-0 pt-0.5 text-[11px] tabular-nums text-muted-foreground">
                    {dateInputValue(r.bill_date).slice(5)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-medium text-foreground">
                        {r.description ?? r.merchant ?? r.category_name ?? "Expense"}
                      </span>
                      {r.voided_at ? (
                        <span className="shrink-0 rounded bg-muted px-1 text-[10px] font-semibold text-muted-foreground">
                          VOID
                        </span>
                      ) : null}
                      {r.pay_later ? (
                        <span className="shrink-0 rounded bg-neutral-bg px-1 text-[10px] font-semibold text-action">
                          Unpaid
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                      {[r.contact_name ?? r.merchant, r.category_name, r.account_name]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                      {r.paid_date ? ` · paid ${dateInputValue(r.paid_date).slice(5)}` : ""}
                    </span>
                  </span>
                  <DisplayAmountCell
                    amount={r.amount}
                    nativeCurrency={
                      r.pay_later
                        ? r.bill_currency || r.account_currency || "USD"
                        : r.account_currency || "USD"
                    }
                    asOfDate={dateInputValue(r.bill_date ?? r.date)}
                    tone="negative"
                    className="shrink-0 pt-0.5 text-xs font-medium"
                  />
                </button>
                {r.attachment_url ? (
                  <ReceiptPreviewIcon
                    url={r.attachment_url}
                    className="mt-0.5 !rounded-[var(--radius-md)] !border-border !bg-transparent !p-0.5 !shadow-none"
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {!loading && rows.length > 0 ? (
          <div className="flex items-center justify-between gap-2 border-t border-border px-2.5 py-1.5">
            <p className="text-[11px] text-muted-foreground">
              {rows.length} of {total}
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
              <span className="text-[11px] text-muted-foreground">End</span>
            )}
          </div>
        ) : null}
      </Card>
    </div>
  );
}


function ExpenseForm({
  userId,
  accounts,
  debts,
  accountOptions,
  debtOptions,
  categoryOptions,
  contactOptions,
  projectOptions,
  projectsEnabled,
  createExpenseCategory,
  createExpenseProject,
  createVendorContact,
  onDone,
  onCancel,
  onError,
}: {
  userId: string;
  accounts: AccountDto[];
  debts: DebtDto[];
  accountOptions: DropdownOption[];
  debtOptions: DropdownOption[];
  categoryOptions: DropdownOption[];
  contactOptions: DropdownOption[];
  projectOptions: DropdownOption[];
  projectsEnabled: boolean;
  createExpenseCategory: (name: string) => Promise<string>;
  createExpenseProject: (name: string) => Promise<string>;
  createVendorContact: (name: string) => Promise<string>;
  onDone: () => void;
  onCancel: () => void;
  onError: (s: string | null) => void;
}) {
  const [step, setStep] = useState(0);
  const [settlement, setSettlement] = useState<"account" | "debt" | "pay_later">("account");
  const [amount, setAmount] = useState("");
  const [billDate, setBillDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paidDate, setPaidDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [merchant, setMerchant] = useState("");
  const [accountId, setAccountId] = useState("");
  const [debtId, setDebtId] = useState("");
  const [billCcy, setBillCcy] = useState("USD");
  const [categoryId, setCategoryId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [contactId, setContactId] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [taxMode, setTaxMode] = useState<"total" | "gst">("total");
  const [gst, setGst] = useState<GstInvoiceState>(() => emptyGstInvoiceState());
  const [amountFollowsGst, setAmountFollowsGst] = useState(true);
  const [busy, setBusy] = useState(false);

  const selectedAcc = accounts.find((a) => a.id === accountId);
  const selectedDebt = debts.find((d) => d.id === debtId);
  const billCcyOpts: DropdownOption[] = useMemo(
    () => ACCOUNT_CURRENCIES.map((c) => ({ value: c, label: c })),
    [],
  );
  const amountCcy =
    settlement === "account"
      ? selectedAcc?.currency ?? "…"
      : settlement === "debt"
        ? selectedDebt?.currency ?? "…"
        : billCcy;

  const stepTitles = useMemo(
    () =>
      taxMode === "gst"
        ? ([
            "Settlement",
            "Vendor & category",
            "Tax",
            "GST breakdown",
            "Total & dates",
            "Details",
            "Receipt & save",
          ] as const)
        : ([
            "Settlement",
            "Vendor & category",
            "Tax",
            "Total & dates",
            "Details",
            "Receipt & save",
          ] as const),
    [taxMode],
  );
  const lastStep = stepTitles.length - 1;
  const classifyStep = 1;
  const taxStep = 2;
  const gstStep = taxMode === "gst" ? 3 : -1;
  const amountStep = taxMode === "gst" ? 4 : 3;
  const detailsStep = taxMode === "gst" ? 5 : 4;
  const receiptStep = taxMode === "gst" ? 6 : 5;

  function validateSettlement(): string | null {
    if (settlement === "account" && !accountId) return "Select an account to pay from.";
    if (settlement === "debt" && !debtId) return "Select a debt to charge.";
    return null;
  }

  function validateAmountDates(): string | null {
    const amt = Number(amount);
    if (!amt || amt <= 0) return "Enter a valid total.";
    if (!billDate) return "Pick a bill date.";
    if (settlement !== "pay_later" && !paidDate) return "Pick a paid date.";
    return null;
  }

  function applyGst(next: GstInvoiceState) {
    setGst(next);
    if (!amountFollowsGst) return;
    const total = gstBreakdownTotal(next);
    if (total != null && total > 0) setAmount(String(total));
  }

  function goNext() {
    onError(null);
    if (step === 0) {
      const err = validateSettlement();
      if (err) {
        onError(err);
        return;
      }
    }
    if (step === gstStep) {
      const err = validateGstBreakdown(gst);
      if (err) {
        onError(err);
        return;
      }
      if (amountFollowsGst) {
        const total = gstBreakdownTotal(gst);
        if (total != null && total > 0) setAmount(String(total));
      }
    }
    if (step === amountStep) {
      const err = validateAmountDates();
      if (err) {
        onError(err);
        return;
      }
    }
    setStep((s) => Math.min(s + 1, lastStep));
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
    if (settlement === "account" && !accountId) {
      onError("Select an account to pay from.");
      return;
    }
    if (settlement === "debt" && !debtId) {
      onError("Select a debt to charge.");
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
      const base: Record<string, unknown> = {
        amount: amt,
        bill_date: billDate,
        paid_date: settlement === "pay_later" ? null : paidDate,
        date: billDate,
        description: description.trim() || undefined,
        merchant: merchant.trim() || undefined,
        category_id: categoryId || undefined,
          project_id: projectId || undefined,
        contact_id: contactId || undefined,
        attachment_url: attachmentUrl.trim() || undefined,
        ...gstStateToPayload(taxMode === "gst" ? gst : emptyGstInvoiceState()),
      };
      if (settlement === "account") {
        base.account_id = accountId;
      } else if (settlement === "debt") {
        base.debt_id = debtId;
      } else {
        base.pay_later = true;
        base.bill_currency = billCcy;
      }
      await apiFetch("/api/expenses", {
        method: "POST",
        body: JSON.stringify(base),
      });
      setAmount("");
      setDescription("");
      setMerchant("");
      setAccountId("");
      setDebtId("");
      setCategoryId("");
      setContactId("");
      setAttachmentUrl("");
      setTaxMode("total");
      setGst(emptyGstInvoiceState());
      setAmountFollowsGst(true);
      setBillCcy("USD");
      setSettlement("account");
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
      className="flex min-h-0 flex-1 flex-col gap-form"
      onSubmit={(e) => {
        e.preventDefault();
      }}
    >
      <FormStepHeader step={step} total={stepTitles.length} titles={[...stepTitles]} />

      <div className="flex min-h-0 flex-1 flex-col gap-form overflow-y-auto overscroll-contain pb-2">
        {step === 0 ? (
          <>
            <ChoiceList
              name="settle"
              label="Settlement"
              value={settlement}
              onChange={(next) => {
                setSettlement(next);
                if (next === "account") setDebtId("");
                if (next === "debt") setAccountId("");
                if (next === "pay_later") {
                  setAccountId("");
                  setDebtId("");
                }
              }}
              options={[
                { value: "account", label: "Pay from account", hint: "Deduct from cash, bank, or wallet" },
                { value: "debt", label: "Charge to debt", hint: "Add to an open debt balance" },
                { value: "pay_later", label: "Pay later", hint: "Track unpaid — settle later" },
              ]}
            />

            {settlement === "account" ? (
              <Dropdown
                label="Paid from (choose first)"
                value={accountId}
                onChange={setAccountId}
                options={accountOptions}
                disabled={accountOptions.length === 0}
              />
            ) : settlement === "debt" ? (
              <Dropdown
                label="Debt to charge"
                value={debtId}
                onChange={setDebtId}
                options={debtOptions}
                disabled={debtOptions.length === 0}
              />
            ) : (
              <Dropdown label="Bill currency" value={billCcy} onChange={setBillCcy} options={billCcyOpts} />
            )}
          </>
        ) : null}

        {step === classifyStep ? (
          <>
            <Dropdown
              label="Vendor / contact (optional)"
              value={contactId}
              onChange={setContactId}
              options={contactOptions}
              required={false}
              placeholder="None — search or add vendor"
              onAddNotFound={createVendorContact}
              addNotFoundLabel="Add vendor"
            />
            <Dropdown
              label="Category (optional)"
              value={categoryId}
              onChange={setCategoryId}
              options={categoryOptions}
              required={false}
              placeholder="None"
              onAddNotFound={createExpenseCategory}
            />
            {projectsEnabled ? (
              <Dropdown
                label="Project (optional)"
                value={projectId}
                onChange={setProjectId}
                options={projectOptions}
                required={false}
                placeholder="None"
                onAddNotFound={createExpenseProject}
                addNotFoundLabel="Add project"
              />
            ) : null}
          </>
        ) : null}

        {step === taxStep ? (
          <ChoiceList
            name="tax_mode"
            label="How do you want to enter the amount?"
            value={taxMode}
            onChange={(next) => {
              setTaxMode(next);
              if (next === "gst") {
                setGst((g) => (g.gstRate == null ? emptyGstWithDefaultRate() : g));
                setAmountFollowsGst(true);
              } else {
                setGst(emptyGstInvoiceState());
              }
            }}
            options={[
              { value: "total", label: "Total only", hint: "Enter the invoice total — no GST breakdown" },
              { value: "gst", label: "With GST", hint: "Rate, subtotal, GST amount, then total" },
            ]}
          />
        ) : null}

        {step === gstStep ? (
          <GstInvoiceFields
            value={gst}
            onChange={applyGst}
            totalAmount={amount}
            currencyLabel={amountCcy === "…" ? undefined : amountCcy}
            defaultOpen
          />
        ) : null}

        {step === amountStep ? (
          <>
            <TextField
              label={`Total (${amountCcy})`}
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => {
                setAmountFollowsGst(false);
                setAmount(e.target.value);
              }}
              required
              hint={
                taxMode === "gst"
                  ? "Prefilled from GST breakdown — you can change it"
                  : undefined
              }
            />
            <div className="grid gap-form sm:grid-cols-2">
              <TextField
                label="Bill date"
                type="date"
                value={billDate}
                onChange={(e) => {
                  const v = e.target.value;
                  setBillDate(v);
                  setPaidDate(v);
                }}
                required
              />
              {settlement !== "pay_later" ? (
                <TextField
                  label="Paid date"
                  type="date"
                  value={paidDate}
                  onChange={(e) => setPaidDate(e.target.value)}
                  required
                />
              ) : null}
            </div>
          </>
        ) : null}

        {step === detailsStep ? (
          <>
            <TextField
              label="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <TextField label="Merchant text (optional)" value={merchant} onChange={(e) => setMerchant(e.target.value)} />
          </>
        ) : null}

        {step === receiptStep ? (
          <ReceiptAttachmentField
            attachmentUrl={attachmentUrl}
            onAttachmentUrlChange={setAttachmentUrl}
            userId={userId}
          />
        ) : null}
      </div>

      <FormActions>
        {step < lastStep ? (
          <Button type="button" className="w-full sm:flex-1" onClick={() => goNext()}>
            Next
          </Button>
        ) : (
          <Button
            type="button"
            className="w-full sm:flex-1"
            disabled={busy}
            onClick={() => void submitSave()}
          >
            {busy ? "Saving…" : "Save expense"}
          </Button>
        )}
        <Button type="button" variant="ghost" className="w-full sm:flex-1" onClick={onCancel}>
          Cancel
        </Button>
        {step > 0 ? (
          <Button type="button" variant="ghost" className="w-full sm:flex-1" onClick={goBack}>
            Back
          </Button>
        ) : null}
      </FormActions>
    </form>
  );
}

function ExpenseDetailPanel({
  row,
  userId,
  accounts,
  debts,
  accountOptions,
  debtOptions,
  categoryOptions,
  contactOptions,
  projectOptions,
  projectsEnabled,
  createExpenseCategory,
  createExpenseProject,
  createVendorContact,
  onClose,
  onListChange,
  onError,
}: {
  row: ExpenseEntryDto;
  userId: string;
  accounts: AccountDto[];
  debts: DebtDto[];
  accountOptions: DropdownOption[];
  debtOptions: DropdownOption[];
  categoryOptions: DropdownOption[];
  contactOptions: DropdownOption[];
  projectOptions: DropdownOption[];
  projectsEnabled: boolean;
  createExpenseCategory: (name: string) => Promise<string>;
  createExpenseProject: (name: string) => Promise<string>;
  createVendorContact: (name: string) => Promise<string>;
  onClose: () => void;
  onListChange: (e: { kind: "upsert"; row: ExpenseEntryDto } | { kind: "delete"; id: string }) => void;
  onError: (s: string | null) => void;
}) {
  const [settlement, setSettlement] = useState<"account" | "debt" | "pay_later">(
    row.pay_later ? "pay_later" : row.debt_id ? "debt" : "account",
  );
  const [amount, setAmount] = useState(String(row.amount));
  const [billDate, setBillDate] = useState(dateInputValue(row.bill_date));
  const [paidDate, setPaidDate] = useState(
    row.paid_date ? dateInputValue(row.paid_date) : dateInputValue(row.bill_date),
  );
  const [description, setDescription] = useState(row.description ?? "");
  const [merchant, setMerchant] = useState(row.merchant ?? "");
  const [accountId, setAccountId] = useState(row.account_id ?? "");
  const [debtId, setDebtId] = useState(row.debt_id ?? "");
  const [billCcy, setBillCcy] = useState(row.bill_currency ?? "USD");
  const [categoryId, setCategoryId] = useState(row.category_id ?? "");
  const [projectId, setProjectId] = useState(row.project_id ?? "");
  const [contactId, setContactId] = useState(row.contact_id ?? "");
  const [notes, setNotes] = useState(row.notes ?? "");
  const [attachmentUrl, setAttachmentUrl] = useState(row.attachment_url ?? "");
  const initialGst = gstStateFromEntry(row);
  const [taxMode, setTaxMode] = useState<"total" | "gst">(hasGstData(initialGst) ? "gst" : "total");
  const [gst, setGst] = useState<GstInvoiceState>(() => initialGst);
  const [amountFollowsGst, setAmountFollowsGst] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const voided = Boolean(row.voided_at);
  const stepTitles = useMemo(
    () =>
      taxMode === "gst"
        ? ([
            "Settlement",
            "Vendor & category",
            "Tax",
            "GST breakdown",
            "Total & dates",
            "Details",
            "Receipt & manage",
          ] as const)
        : ([
            "Settlement",
            "Vendor & category",
            "Tax",
            "Total & dates",
            "Details",
            "Receipt & manage",
          ] as const),
    [taxMode],
  );
  const lastStep = stepTitles.length - 1;
  const classifyStep = 1;
  const taxStep = 2;
  const gstStep = taxMode === "gst" ? 3 : -1;
  const amountStep = taxMode === "gst" ? 4 : 3;
  const detailsStep = taxMode === "gst" ? 5 : 4;
  const receiptStep = taxMode === "gst" ? 6 : 5;

  const selectedAcc = accounts.find((a) => a.id === accountId);
  const selectedDebt = debts.find((d) => d.id === debtId);
  const billCcyOpts: DropdownOption[] = useMemo(
    () => ACCOUNT_CURRENCIES.map((c) => ({ value: c, label: c })),
    [],
  );
  const amountCcy =
    settlement === "account"
      ? selectedAcc?.currency ?? row.account_currency ?? "USD"
      : settlement === "debt"
        ? selectedDebt?.currency ?? row.account_currency ?? "USD"
        : billCcy;

  function validateSettlement(): string | null {
    if (voided) return null;
    if (settlement === "account" && !accountId) return "Select an account.";
    if (settlement === "debt" && !debtId) return "Select a debt.";
    return null;
  }

  function validateAmountDates(): string | null {
    if (voided) return null;
    const amt = Number(amount);
    if (!amt || amt <= 0) return "Enter a valid total.";
    if (!billDate) return "Pick a bill date.";
    if (settlement !== "pay_later" && !paidDate) return "Pick a paid date.";
    return null;
  }

  function applyGst(next: GstInvoiceState) {
    setGst(next);
    if (!amountFollowsGst) return;
    const total = gstBreakdownTotal(next);
    if (total != null && total > 0) setAmount(String(total));
  }

  function goNext() {
    onError(null);
    if (step === 0) {
      const err = validateSettlement();
      if (err) {
        onError(err);
        return;
      }
    }
    if (step === gstStep) {
      const err = validateGstBreakdown(gst);
      if (err) {
        onError(err);
        return;
      }
      if (amountFollowsGst) {
        const total = gstBreakdownTotal(gst);
        if (total != null && total > 0) setAmount(String(total));
      }
    }
    if (step === amountStep) {
      const err = validateAmountDates();
      if (err) {
        onError(err);
        return;
      }
    }
    setStep((s) => Math.min(s + 1, lastStep));
  }

  function goBack() {
    onError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function save() {
    if (voided) return;
    const settleErr = validateSettlement();
    if (settleErr) {
      onError(settleErr);
      setStep(0);
      return;
    }
    if (taxMode === "gst") {
      const gstErr = validateGstBreakdown(gst);
      if (gstErr) {
        onError(gstErr);
        setStep(gstStep);
        return;
      }
    }
    const amtErr = validateAmountDates();
    if (amtErr) {
      onError(amtErr);
      setStep(amountStep);
      return;
    }
    const amt = Number(amount);
    setBusy(true);
    onError(null);
    try {
      const data = await apiFetch<{ row: ExpenseEntryDto }>(`/api/expenses/${row.id}`, {
        method: "PUT",
        body: JSON.stringify({
          amount: amt,
          bill_date: billDate,
          paid_date: settlement === "pay_later" ? null : paidDate,
          date: billDate,
          description: description.trim() || undefined,
          merchant: merchant.trim() || undefined,
          account_id: settlement === "account" ? accountId : null,
          debt_id: settlement === "debt" ? debtId : null,
          pay_later: settlement === "pay_later",
          bill_currency: settlement === "pay_later" ? billCcy : undefined,
          category_id: categoryId || null,
          project_id: projectId || null,
          contact_id: contactId || null,
          notes: notes.trim() || undefined,
          attachment_url: attachmentUrl.trim() || null,
          ...gstStateToPayload(taxMode === "gst" ? gst : emptyGstInvoiceState()),
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
    if (!window.confirm("Void this expense? Balances and debt totals will be reconciled.")) return;
    setBusy(true);
    onError(null);
    try {
      const data = await apiFetch<{ row: ExpenseEntryDto }>(`/api/expenses/${row.id}/void`, {
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
      const data = await apiFetch<{ row: ExpenseEntryDto }>(`/api/expenses/${row.id}/unvoid`, {
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
    if (!window.confirm("Delete this expense? This cannot be undone.")) return;
    setBusy(true);
    onError(null);
    try {
      await apiFetch(`/api/expenses/${row.id}`, { method: "DELETE" });
      onListChange({ kind: "delete", id: row.id });
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col gap-form"
      onSubmit={(e) => {
        e.preventDefault();
      }}
    >
      <FormStepHeader step={step} total={stepTitles.length} titles={[...stepTitles]} />

      <div className="flex min-h-0 flex-1 flex-col gap-form overflow-y-auto overscroll-contain pb-2">
        {voided ? (
          <div className="rounded-sm border border-border bg-neutral-bg px-3 py-2 text-sm text-ink">
            <p className="font-semibold">Voided</p>
            {row.void_reason ? <p className="mt-1 text-caption">Reason: {row.void_reason}</p> : null}
          </div>
        ) : null}

        {step === 0 ? (
          <>
            <fieldset disabled={voided} className="disabled:opacity-60">
              <ChoiceList
                name="settle_e"
                label="Settlement"
                value={settlement}
                onChange={(next) => {
                  setSettlement(next);
                  if (next === "account") setDebtId("");
                  if (next === "debt") setAccountId("");
                  if (next === "pay_later") {
                    setAccountId("");
                    setDebtId("");
                  }
                }}
                options={[
                  { value: "account", label: "Paid from account", hint: "Deduct from cash, bank, or wallet" },
                  { value: "debt", label: "Charged to debt", hint: "Add to an open debt balance" },
                  { value: "pay_later", label: "Pay later", hint: "Track unpaid — settle later" },
                ]}
              />
            </fieldset>
            {settlement === "account" ? (
              <Dropdown
                label="Account"
                value={accountId}
                onChange={setAccountId}
                options={accountOptions}
                disabled={voided}
              />
            ) : settlement === "debt" ? (
              <Dropdown
                label="Debt"
                value={debtId}
                onChange={setDebtId}
                options={debtOptions}
                disabled={voided || debtOptions.length === 0}
              />
            ) : (
              <Dropdown
                label="Bill currency"
                value={billCcy}
                onChange={setBillCcy}
                options={billCcyOpts}
                disabled={voided}
              />
            )}
          </>
        ) : null}

        {step === classifyStep ? (
          <>
            <Dropdown
              label="Vendor / contact (optional)"
              value={contactId}
              onChange={setContactId}
              options={contactOptions}
              required={false}
              placeholder="None — search or add vendor"
              disabled={voided}
              onAddNotFound={voided ? undefined : createVendorContact}
              addNotFoundLabel="Add vendor"
            />
            <Dropdown
              label="Category (optional)"
              value={categoryId}
              onChange={setCategoryId}
              options={categoryOptions}
              required={false}
              placeholder="None"
              disabled={voided}
              onAddNotFound={voided ? undefined : createExpenseCategory}
            />
            {projectsEnabled ? (
              <Dropdown
                label="Project (optional)"
                value={projectId}
                onChange={setProjectId}
                options={projectOptions}
                required={false}
                placeholder="None"
                disabled={voided}
                onAddNotFound={voided ? undefined : createExpenseProject}
                addNotFoundLabel="Add project"
              />
            ) : null}
          </>
        ) : null}

        {step === taxStep ? (
          <fieldset disabled={voided} className="disabled:opacity-60">
            <ChoiceList
              name="tax_mode_e"
              label="How do you want to enter the amount?"
              value={taxMode}
              onChange={(next) => {
                setTaxMode(next);
                if (next === "gst") {
                  setGst((g) => (g.gstRate == null ? emptyGstWithDefaultRate() : g));
                  setAmountFollowsGst(true);
                } else {
                  setGst(emptyGstInvoiceState());
                }
              }}
              options={[
                { value: "total", label: "Total only", hint: "Enter the invoice total — no GST breakdown" },
                { value: "gst", label: "With GST", hint: "Rate, subtotal, GST amount, then total" },
              ]}
            />
          </fieldset>
        ) : null}

        {step === gstStep ? (
          <GstInvoiceFields
            value={gst}
            onChange={applyGst}
            totalAmount={amount}
            currencyLabel={amountCcy}
            disabled={voided}
            defaultOpen
          />
        ) : null}

        {step === amountStep ? (
          <>
            <TextField
              label={`Total (${amountCcy})`}
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => {
                setAmountFollowsGst(false);
                setAmount(e.target.value);
              }}
              disabled={voided}
              hint={taxMode === "gst" ? "Prefilled from GST breakdown — you can change it" : undefined}
            />
            <div className="grid gap-form sm:grid-cols-2">
              <TextField
                label="Bill date"
                type="date"
                value={billDate}
                onChange={(e) => setBillDate(e.target.value)}
                disabled={voided}
              />
              {settlement !== "pay_later" ? (
                <TextField
                  label="Paid date"
                  type="date"
                  value={paidDate}
                  onChange={(e) => setPaidDate(e.target.value)}
                  disabled={voided}
                />
              ) : null}
            </div>
          </>
        ) : null}

        {step === detailsStep ? (
          <>
            <TextField
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={voided}
            />
            <TextField
              label="Merchant text"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              disabled={voided}
            />
            <TextField
              label="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={voided}
            />
            {row.splits.length ? (
              <div className="rounded-sm border border-border px-3 py-2">
                <p className="text-sm font-medium text-ink">Splits</p>
                <ul className="mt-1 space-y-1 text-caption">
                  {row.splits.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{s.category_id.slice(0, 8)}…</span>
                      <DisplayAmountCell
                        amount={s.amount}
                        nativeCurrency={row.account_currency || "USD"}
                        asOfDate={dateInputValue(row.bill_date ?? row.date)}
                        className="text-caption text-ink"
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : null}

        {step === receiptStep ? (
          <>
            {row.attachment_url || attachmentUrl ? (
              <div className="flex items-center gap-2 rounded-sm border border-border px-3 py-2">
                <ReceiptPreviewIcon url={attachmentUrl || row.attachment_url || ""} />
                <span className="text-sm text-ink">Receipt</span>
              </div>
            ) : (
              <p className="text-caption">No receipt attached yet.</p>
            )}
            {!voided && userId ? (
              <ReceiptAttachmentField
                attachmentUrl={attachmentUrl}
                onAttachmentUrlChange={setAttachmentUrl}
                userId={userId}
              />
            ) : null}

            {!voided ? (
              <div className="space-y-3 border-t border-border pt-3">
                <TextField
                  label="Void reason (optional)"
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-warning"
                  disabled={busy}
                  onClick={() => void doVoid()}
                >
                  Void transaction
                </Button>
              </div>
            ) : (
              <Button type="button" className="w-full" variant="ghost" disabled={busy} onClick={() => void doUnvoid()}>
                Restore (unvoid)
              </Button>
            )}

            <Button
              type="button"
              variant="ghost"
              className="w-full text-debit"
              disabled={busy}
              onClick={() => void doDelete()}
            >
              Delete (soft)
            </Button>
          </>
        ) : null}
      </div>

      <FormActions>
        {step < lastStep ? (
          <Button type="button" className="w-full sm:flex-1" onClick={() => goNext()}>
            Next
          </Button>
        ) : !voided ? (
          <Button
            type="button"
            className="w-full sm:flex-1"
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? "Saving…" : "Save changes"}
          </Button>
        ) : (
          <Button type="button" className="w-full sm:flex-1" onClick={onClose}>
            Done
          </Button>
        )}
        {step < lastStep || !voided ? (
          <Button type="button" variant="ghost" className="w-full sm:flex-1" onClick={onClose}>
            Cancel
          </Button>
        ) : null}
        {step > 0 ? (
          <Button type="button" variant="ghost" className="w-full sm:flex-1" onClick={goBack}>
            Back
          </Button>
        ) : null}
      </FormActions>
    </form>
  );
}
