import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "@/api/http";
import { Dropdown, type DropdownOption } from "@/components/Dropdown";
import { Modal } from "@/components/Modal";
import { Button, Card, TextField } from "@/components/ui";
import type { ContactDto, ContactKind, PagedContactsDto } from "../../../shared/types";

const PAGE_SIZE = 25;

const kindOpts: DropdownOption[] = [
  { value: "vendor", label: "Vendor" },
  { value: "customer", label: "Customer" },
  { value: "other", label: "Other" },
];

const filterKindOpts: DropdownOption[] = [
  { value: "", label: "All types" },
  ...kindOpts,
];

export function ContactsPage() {
  const [rows, setRows] = useState<ContactDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<"" | ContactKind>("");
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ContactDto | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    const q = new URLSearchParams();
    q.set("page", String(page));
    q.set("limit", String(PAGE_SIZE));
    if (debouncedSearch) q.set("search", debouncedSearch);
    if (kindFilter) q.set("kind", kindFilter);
    const data = await apiFetch<PagedContactsDto>(`/api/contacts?${q.toString()}`);
    setRows(data.items);
    setTotal(data.total);
  }, [page, debouncedSearch, kindFilter]);

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, kindFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 md:text-xl">Contacts</h2>
          <p className="text-sm text-slate-500">Search and open a contact for statement &amp; vendor tools.</p>
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

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField
            label="Search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Name…"
          />
          <Dropdown
            label="Type"
            value={kindFilter}
            onChange={(v) => setKindFilter(v as "" | ContactKind)}
            options={filterKindOpts}
            required={false}
            searchable={false}
          />
        </div>
      </Card>

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
            void load().catch(() => {});
          }}
          onError={setError}
        />
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
                <Link
                  to={`/contacts/${c.id}`}
                  className="inline-flex min-h-9 items-center justify-center rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50"
                >
                  Open
                </Link>
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
                      .then(() => load())
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
          <p className="p-4 text-center text-sm text-slate-500">No contacts match.</p>
        ) : null}
        {total > PAGE_SIZE ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
            <span>
              Page {page} of {totalPages} · {total} total
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
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
