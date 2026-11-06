import clsx from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Filter } from "lucide-react";
import { apiFetch } from "@/api/http";
import { Dropdown, type DropdownOption } from "@/components/Dropdown";
import { Modal } from "@/components/Modal";
import {
  emptyGstInvoiceState,
  emptyGstWithDefaultRate,
  GstInvoiceFields,
  gstStateFromEntry,
  gstStateToPayload,
  hasGstData,
  invoiceBreakdownTotal,
  validateGstBreakdown,
  type GstInvoiceState,
} from "@/components/GstInvoiceFields";
import {
  emptyGreenTaxState,
  GreenTaxFields,
  greenTaxStateFromEntry,
  greenTaxStateToPayload,
  validateGreenTax,
  type GreenTaxState,
} from "@/components/GreenTaxFields";
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
  IncomeEntryDto,
  PagedIncomeListDto,
  SettingsDto,
} from "../../../shared/types";

function incomeGstStepTitles(taxMode: "total" | "gst", greenTaxOrg: boolean) {
  if (taxMode !== "gst") {
    return ["Account", "Customer & category", "Tax", "Total & dates", "Details", "Receipt & save"] as const;
  }
  if (greenTaxOrg) {
    return [
      "Account",
      "Customer & category",
      "Tax",
      "GST breakdown",
      "Green Tax",
      "Total & dates",
      "Details",
      "Receipt & save",
    ] as const;
  }
  return [
    "Account",
    "Customer & category",
    "Tax",
    "GST breakdown",
    "Total & dates",
    "Details",
    "Receipt & save",
  ] as const;
}

function incomeEditStepTitles(taxMode: "total" | "gst", greenTaxOrg: boolean) {
  if (taxMode !== "gst") {
    return ["Account", "Customer & category", "Tax", "Total & dates", "Details", "Receipt & manage"] as const;
  }
  if (greenTaxOrg) {
    return [
      "Account",
      "Customer & category",
      "Tax",
      "GST breakdown",
      "Green Tax",
      "Total & dates",
      "Details",
      "Receipt & manage",
    ] as const;
  }
  return [
    "Account",
    "Customer & category",
    "Tax",
    "GST breakdown",
    "Total & dates",
    "Details",
    "Receipt & manage",
  ] as const;
}

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
  const { projectsEnabled, projects, createProject, refresh: refreshProjects } = useProjects();
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
  const [filterProjectId, setFilterProjectId] = useState("");
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
        filterProjectId,
        incomeType,
        showVoided ? "1" : "0",
      ].join("\u0001"),
    [
      debouncedSearch,
      dateFrom,
      dateTo,
      filterCategoryId,
      filterAccountId,
      filterProjectId,
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
          filterProjectId ||
          incomeType !== "all",
      ),
    [
      searchInput,
      debouncedSearch,
      dateFrom,
      dateTo,
      filterCategoryId,
      filterAccountId,
      filterProjectId,
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
    setFilterProjectId("");
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
      appendProjectFilter(q, filterProjectId);
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
      filterProjectId,
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

  const createIncomeProject = useCallback(
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-page-title text-ink">Income</h2>
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
            placeholder="Description, notes, source, category…"
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
            <ProjectFilter value={filterProjectId} onChange={setFilterProjectId} />
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

      <Modal open={modalOpen} title="New income" size="lg" variant="form" onClose={() => setModalOpen(false)}>
        <IncomeForm
          userId={userId}
          accounts={accounts}
          accountOptions={accountOpts}
          categoryOptions={catDropdownOpts}
          contactOptions={contactOpts}
          projectOptions={projectOpts}
          projectsEnabled={projectsEnabled}
          createIncomeCategory={createIncomeCategory}
          createIncomeProject={createIncomeProject}
          createCustomerContact={createCustomerContact}
          onDone={() => {
            setModalOpen(false);
            reload();
          }}
          onError={setError}
        />
      </Modal>

      <Modal
        open={detail !== null}
        title="Edit income"
        size="lg"
        variant="form"
        onClose={() => setDetail(null)}
      >
        {detail ? (
          <IncomeDetailForm
            key={detail.id}
            row={detail}
            userId={userId}
            accounts={accounts}
            accountOptions={accountOpts}
            categoryOptions={catDropdownOpts}
            contactOptions={contactOpts}
            projectOptions={projectOpts}
            projectsEnabled={projectsEnabled}
            createIncomeCategory={createIncomeCategory}
            createIncomeProject={createIncomeProject}
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
        {loading ? (
          <div className="space-y-2 p-3">
            <SkeletonLine className="h-8 w-full" />
            <SkeletonTableRows rows={6} />
          </div>
        ) : rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            No income entries{filtersActive ? " match these filters" : " yet"}.
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
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-positive" aria-hidden />
                  <span className="w-[3.75rem] shrink-0 pt-0.5 text-[11px] tabular-nums text-muted-foreground">
                    {dateInputValue(r.date).slice(5)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-medium text-foreground">
                        {r.description ?? r.category_name ?? "Income"}
                      </span>
                      {r.voided_at ? (
                        <span className="shrink-0 rounded bg-muted px-1 text-[10px] font-semibold text-muted-foreground">
                          VOID
                        </span>
                      ) : null}
                      {r.pending_receivable ? (
                        <span className="shrink-0 rounded bg-neutral-bg px-1 text-[10px] font-semibold text-action">
                          Pending
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                      {[r.contact_name, r.category_name, r.account_name].filter(Boolean).join(" · ") || "—"}
                      {r.received_date && r.received_date !== r.date
                        ? ` · in ${dateInputValue(r.received_date).slice(5)}`
                        : ""}
                    </span>
                  </span>
                  <DisplayAmountCell
                    amount={r.amount}
                    nativeCurrency={r.account_currency || r.currency || "USD"}
                    asOfDate={dateInputValue(r.date)}
                    tone="positive"
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


function IncomeForm({
  userId,
  accounts,
  accountOptions,
  categoryOptions,
  contactOptions,
  projectOptions,
  projectsEnabled,
  createIncomeCategory,
  createIncomeProject,
  createCustomerContact,
  onDone,
  onError,
}: {
  userId: string;
  accounts: AccountDto[];
  accountOptions: DropdownOption[];
  categoryOptions: DropdownOption[];
  contactOptions: DropdownOption[];
  projectOptions: DropdownOption[];
  projectsEnabled: boolean;
  createIncomeCategory: (name: string) => Promise<string>;
  createIncomeProject: (name: string) => Promise<string>;
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
  const [projectId, setProjectId] = useState("");
  const [contactId, setContactId] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [taxMode, setTaxMode] = useState<"total" | "gst">("total");
  const [gst, setGst] = useState<GstInvoiceState>(() => emptyGstInvoiceState());
  const [greenTax, setGreenTax] = useState<GreenTaxState>(() => emptyGreenTaxState());
  const [greenTaxOrgEnabled, setGreenTaxOrgEnabled] = useState(false);
  const [amountFollowsGst, setAmountFollowsGst] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void apiFetch<SettingsDto>("/api/settings")
      .then((s) => setGreenTaxOrgEnabled(Boolean(s.green_tax_enabled)))
      .catch(() => setGreenTaxOrgEnabled(false));
  }, []);

  const selectedAcc = accounts.find((a) => a.id === accountId);
  const amountCcy = receivable ? incomeCurrency : selectedAcc?.currency ?? "…";
  const currencyOpts: DropdownOption[] = useMemo(
    () => ACCOUNT_CURRENCIES.map((c) => ({ value: c, label: c })),
    [],
  );

  const stepTitles = useMemo(
    () => incomeGstStepTitles(taxMode, greenTaxOrgEnabled),
    [taxMode, greenTaxOrgEnabled],
  );
  const lastStep = stepTitles.length - 1;
  const classifyStep = 1;
  const taxStep = 2;
  const gstStep = taxMode === "gst" ? 3 : -1;
  const greenTaxStep = taxMode === "gst" && greenTaxOrgEnabled ? 4 : -1;
  const amountStep = taxMode === "gst" ? (greenTaxOrgEnabled ? 5 : 4) : 3;
  const detailsStep = taxMode === "gst" ? (greenTaxOrgEnabled ? 6 : 5) : 4;
  const receiptStep = taxMode === "gst" ? (greenTaxOrgEnabled ? 7 : 6) : 5;

  function syncAmountFromTax(nextGst: GstInvoiceState, nextGreen: GreenTaxState) {
    if (!amountFollowsGst) return;
    const total = invoiceBreakdownTotal(
      nextGst,
      nextGreen.include ? nextGreen.amount : null,
    );
    if (total != null && total > 0) setAmount(String(total));
  }

  function validateAccount(): string | null {
    if (!receivable && !accountId) return "Select an account.";
    return null;
  }

  function validateAmountDates(): string | null {
    const amt = Number(amount);
    if (!amt || amt <= 0) return "Enter a valid total.";
    if (!date) return "Pick an earned date.";
    if (!receivable && !receivedDate) return "Pick a received / deposit date.";
    return null;
  }

  function applyGst(next: GstInvoiceState) {
    setGst(next);
    syncAmountFromTax(next, greenTax);
  }

  function applyGreenTax(next: GreenTaxState) {
    setGreenTax(next);
    syncAmountFromTax(gst, next);
  }

  function goNext() {
    onError(null);
    if (step === 0) {
      const err = validateAccount();
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
      syncAmountFromTax(gst, greenTax);
    }
    if (step === greenTaxStep) {
      const err = validateGreenTax(greenTax);
      if (err) {
        onError(err);
        return;
      }
      syncAmountFromTax(gst, greenTax);
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
          project_id: projectId || undefined,
          contact_id: contactId || undefined,
          attachment_url: attachmentUrl.trim() || undefined,
          ...gstStateToPayload(taxMode === "gst" ? gst : emptyGstInvoiceState()),
          ...(taxMode === "gst" && greenTaxOrgEnabled
            ? greenTaxStateToPayload(greenTax)
            : greenTaxStateToPayload(emptyGreenTaxState())),
        }),
      });
      setAmount("");
      setDescription("");
      setAccountId("");
      setCategoryId("");
      setProjectId("");
      setContactId("");
      setAttachmentUrl("");
      setTaxMode("total");
      setGst(emptyGstInvoiceState());
      setGreenTax(emptyGreenTaxState());
      setAmountFollowsGst(true);
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
      className="flex min-h-0 flex-1 flex-col gap-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (step === lastStep) void submitSave();
      }}
    >
      <FormStepHeader step={step} total={stepTitles.length} titles={[...stepTitles]} />

      <div className="flex min-h-0 flex-1 flex-col gap-form overflow-y-auto overscroll-contain pb-2">
        {step === 0 ? (
          <>
            <label
              className={clsx(
                "flex min-h-11 cursor-pointer touch-manipulation items-center gap-3 rounded-sm border px-3 py-2",
                receivable ? "border-ink bg-neutral-bg" : "border-border bg-surface",
              )}
            >
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border accent-ink"
                checked={receivable}
                onChange={(e) => {
                  setReceivable(e.target.checked);
                  if (e.target.checked) setAccountId("");
                }}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink">Receivable</span>
                <span className="mt-0.5 block text-caption">Not deposited yet — track as owed</span>
              </span>
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
          </>
        ) : null}

        {step === classifyStep ? (
          <>
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
            <Dropdown
              label="Category (optional)"
              value={categoryId}
              onChange={setCategoryId}
              options={categoryOptions}
              required={false}
              placeholder="None"
              onAddNotFound={createIncomeCategory}
            />
            {projectsEnabled ? (
              <Dropdown
                label="Project (optional)"
                value={projectId}
                onChange={setProjectId}
                options={projectOptions}
                required={false}
                placeholder="None"
                onAddNotFound={createIncomeProject}
                addNotFoundLabel="Add project"
              />
            ) : null}
          </>
        ) : null}

        {step === taxStep ? (
          <ChoiceList
            name="tax_mode_i"
            label="How do you want to enter the amount?"
            value={taxMode}
            onChange={(next) => {
              setTaxMode(next);
              if (next === "gst") {
                setGst((g) => (g.gstRate == null ? emptyGstWithDefaultRate() : g));
                setAmountFollowsGst(true);
              } else {
                setGst(emptyGstInvoiceState());
                setGreenTax(emptyGreenTaxState());
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

        {step === greenTaxStep ? (
          <div className="space-y-3">
            <GreenTaxFields
              value={greenTax}
              onChange={applyGreenTax}
              userId={userId}
              currencyLabel={amountCcy === "…" ? undefined : amountCcy}
            />
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => {
                applyGreenTax(emptyGreenTaxState());
                setStep((s) => Math.min(s + 1, lastStep));
              }}
            >
              Skip Green Tax
            </Button>
          </div>
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
                  ? greenTax.include
                    ? "Prefilled from GST + Green Tax — you can change it"
                    : "Prefilled from GST breakdown — you can change it"
                  : undefined
              }
            />
            <div className="grid gap-form sm:grid-cols-2">
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
            </div>
          </>
        ) : null}

        {step === detailsStep ? (
          <TextField
            label="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
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
          <Button type="submit" className="w-full sm:flex-1" disabled={busy}>
            {busy ? "Saving…" : "Save income"}
          </Button>
        )}
        {step > 0 ? (
          <Button type="button" variant="ghost" className="w-full sm:flex-1" onClick={goBack}>
            Back
          </Button>
        ) : null}
      </FormActions>
    </form>
  );
}

function IncomeDetailForm({
  row,
  userId,
  accounts,
  accountOptions,
  categoryOptions,
  contactOptions,
  projectOptions,
  projectsEnabled,
  createIncomeCategory,
  createIncomeProject,
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
  projectOptions: DropdownOption[];
  projectsEnabled: boolean;
  createIncomeCategory: (name: string) => Promise<string>;
  createIncomeProject: (name: string) => Promise<string>;
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
  const [projectId, setProjectId] = useState(row.project_id ?? "");
  const [contactId, setContactId] = useState(row.contact_id ?? "");
  const [source, setSource] = useState(row.source ?? "");
  const [notes, setNotes] = useState(row.notes ?? "");
  const [attachmentUrl, setAttachmentUrl] = useState(row.attachment_url ?? "");
  const initialGst = gstStateFromEntry(row);
  const initialGreen = greenTaxStateFromEntry(row);
  const [taxMode, setTaxMode] = useState<"total" | "gst">(
    hasGstData(initialGst) || initialGreen.include ? "gst" : "total",
  );
  const [gst, setGst] = useState<GstInvoiceState>(() => initialGst);
  const [greenTax, setGreenTax] = useState<GreenTaxState>(() => initialGreen);
  const [greenTaxOrgEnabled, setGreenTaxOrgEnabled] = useState(false);
  const [amountFollowsGst, setAmountFollowsGst] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const voided = Boolean(row.voided_at);

  useEffect(() => {
    void apiFetch<SettingsDto>("/api/settings")
      .then((s) => setGreenTaxOrgEnabled(Boolean(s.green_tax_enabled)))
      .catch(() => setGreenTaxOrgEnabled(false));
  }, []);

  const stepTitles = useMemo(
    () => incomeEditStepTitles(taxMode, greenTaxOrgEnabled),
    [taxMode, greenTaxOrgEnabled],
  );
  const lastStep = stepTitles.length - 1;
  const classifyStep = 1;
  const taxStep = 2;
  const gstStep = taxMode === "gst" ? 3 : -1;
  const greenTaxStep = taxMode === "gst" && greenTaxOrgEnabled ? 4 : -1;
  const amountStep = taxMode === "gst" ? (greenTaxOrgEnabled ? 5 : 4) : 3;
  const detailsStep = taxMode === "gst" ? (greenTaxOrgEnabled ? 6 : 5) : 4;
  const receiptStep = taxMode === "gst" ? (greenTaxOrgEnabled ? 7 : 6) : 5;
  const selectedAcc = accounts.find((a) => a.id === accountId);
  const amountCcy = pending ? row.currency : selectedAcc?.currency ?? row.currency ?? "USD";

  function syncAmountFromTax(nextGst: GstInvoiceState, nextGreen: GreenTaxState) {
    if (!amountFollowsGst) return;
    const total = invoiceBreakdownTotal(
      nextGst,
      nextGreen.include ? nextGreen.amount : null,
    );
    if (total != null && total > 0) setAmount(String(total));
  }

  function validateAccount(): string | null {
    if (voided) return null;
    if (!pending && !accountId) return "Select an account.";
    return null;
  }

  function validateAmountDates(): string | null {
    if (voided) return null;
    const amt = Number(amount);
    if (!amt || amt <= 0) return "Enter a valid total.";
    if (!earnedDate) return "Pick an earned date.";
    if (!pending && !receivedDate) return "Pick a received / deposit date.";
    return null;
  }

  function applyGst(next: GstInvoiceState) {
    setGst(next);
    syncAmountFromTax(next, greenTax);
  }

  function applyGreenTax(next: GreenTaxState) {
    setGreenTax(next);
    syncAmountFromTax(gst, next);
  }

  function goNext() {
    onError(null);
    if (step === 0) {
      const err = validateAccount();
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
      syncAmountFromTax(gst, greenTax);
    }
    if (step === greenTaxStep) {
      const err = validateGreenTax(greenTax);
      if (err) {
        onError(err);
        return;
      }
      syncAmountFromTax(gst, greenTax);
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
    const accErr = validateAccount();
    if (accErr) {
      onError(accErr);
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
      if (greenTaxOrgEnabled) {
        const gErr = validateGreenTax(greenTax);
        if (gErr) {
          onError(gErr);
          setStep(greenTaxStep);
          return;
        }
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
      const body: Record<string, unknown> = {
        amount: amt,
        date: earnedDate,
        description: description.trim() || undefined,
        category_id: categoryId || null,
        project_id: projectId || null,
        contact_id: contactId || null,
        source: source.trim() || undefined,
        notes: notes.trim() || undefined,
        attachment_url: attachmentUrl.trim() || null,
        ...gstStateToPayload(taxMode === "gst" ? gst : emptyGstInvoiceState()),
        ...(taxMode === "gst" && greenTaxOrgEnabled
          ? greenTaxStateToPayload(greenTax)
          : greenTaxStateToPayload(emptyGreenTaxState())),
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
    <form
      className="flex min-h-0 flex-1 flex-col gap-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (step === lastStep && !voided) void save();
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
            <p className="text-caption">
              {pending ? "Receivable" : "Account"} · {row.account_name || "—"} · {row.currency}
            </p>

            {!voided && pending ? (
              <div className="space-y-3 rounded-sm border border-border bg-neutral-bg/50 p-3">
                <p className="text-sm font-semibold text-ink">Mark as received</p>
                <Dropdown
                  label="Deposit to"
                  value={receiveAccountId}
                  onChange={setReceiveAccountId}
                  options={accountOptions}
                  disabled={accountOptions.length === 0}
                />
                <TextField
                  label="Received date"
                  type="date"
                  value={receiveDate}
                  onChange={(e) => setReceiveDate(e.target.value)}
                />
                <Button type="button" className="w-full" disabled={busy} onClick={() => void markReceived()}>
                  {busy ? "Saving…" : "Deposit to account"}
                </Button>
              </div>
            ) : null}

            {!pending ? (
              <Dropdown
                label="Account"
                value={accountId}
                onChange={setAccountId}
                options={accountOptions}
                disabled={voided}
              />
            ) : null}
          </>
        ) : null}

        {step === classifyStep ? (
          <>
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
            {projectsEnabled ? (
              <Dropdown
                label="Project (optional)"
                value={projectId}
                onChange={setProjectId}
                options={projectOptions}
                required={false}
                placeholder="None"
                disabled={voided}
                onAddNotFound={voided ? undefined : createIncomeProject}
                addNotFoundLabel="Add project"
              />
            ) : null}
          </>
        ) : null}

        {step === taxStep ? (
          <fieldset disabled={voided} className="disabled:opacity-60">
            <ChoiceList
              name="tax_mode_ie"
              label="How do you want to enter the amount?"
              value={taxMode}
              onChange={(next) => {
                setTaxMode(next);
                if (next === "gst") {
                  setGst((g) => (g.gstRate == null ? emptyGstWithDefaultRate() : g));
                  setAmountFollowsGst(true);
                } else {
                  setGst(emptyGstInvoiceState());
                  setGreenTax(emptyGreenTaxState());
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

        {step === greenTaxStep ? (
          <div className="space-y-3">
            <GreenTaxFields
              value={greenTax}
              onChange={applyGreenTax}
              userId={userId}
              currencyLabel={amountCcy}
              disabled={voided}
            />
            {!voided ? (
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => {
                  applyGreenTax(emptyGreenTaxState());
                  setStep((s) => Math.min(s + 1, lastStep));
                }}
              >
                Skip Green Tax
              </Button>
            ) : null}
          </div>
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
              hint={
                taxMode === "gst"
                  ? greenTax.include
                    ? "Prefilled from GST + Green Tax — you can change it"
                    : "Prefilled from GST breakdown — you can change it"
                  : undefined
              }
            />
            <div className="grid gap-form sm:grid-cols-2">
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
              label="Source (optional)"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              disabled={voided}
            />
            <TextField
              label="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={voided}
            />
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
          <Button type="submit" className="w-full sm:flex-1" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        ) : (
          <Button type="button" className="w-full sm:flex-1" onClick={onClose}>
            Done
          </Button>
        )}
        {step > 0 ? (
          <Button type="button" variant="ghost" className="w-full sm:flex-1" onClick={goBack}>
            Back
          </Button>
        ) : null}
      </FormActions>
    </form>
  );
}
