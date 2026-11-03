import { Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "@/api/http";
import { ChangeTag, ListRow, PanelCard, SegmentedControl } from "@/components/design";
import { Modal } from "@/components/Modal";
import { Button, TextField } from "@/components/ui";
import { downloadText, toCsv } from "@/lib/download";
import type { StockInventoryRowDto, StockItemDto } from "../../../../shared/types";

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, "");
}

export function StockInventoryPage() {
  const [date, setDate] = useState(todayYmd);
  const [kind, setKind] = useState<"all" | "kitchen" | "other">("all");
  const [rows, setRows] = useState<StockInventoryRowDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [edit, setEdit] = useState<StockInventoryRowDto | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [applying, setApplying] = useState(false);

  const load = useCallback(async () => {
    const q = new URLSearchParams({ date, kind });
    const data = await apiFetch<{ date: string; items: StockInventoryRowDto[] }>(
      `/api/stock/inventory?${q}`,
    );
    setRows(data.items);
  }, [date, kind]);

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [load]);

  function downloadInventory() {
    downloadText(
      `inventory-${date}.csv`,
      toCsv(
        ["Item", "Unit", "Opening", "Received", "Used", "Balance", "Min Stock", "Waste", "Expenditure", "Use", "Kind"],
        rows.map((r) => [
          r.name,
          r.unit,
          r.opening,
          r.received,
          r.used,
          r.balance,
          r.min_stock,
          r.waste,
          r.expenditure,
          r.use_notes,
          r.kind,
        ]),
      ),
      "text/csv;charset=utf-8",
    );
  }

  async function applyKitchenUsage() {
    setApplying(true);
    try {
      await apiFetch("/api/kitchen/apply-usage", {
        method: "POST",
        body: JSON.stringify({ date }),
      });
      setMsg("Breakfast usage re-synced to Used");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setApplying(false);
    }
  }

  async function deleteItem(row: StockInventoryRowDto) {
    if (!confirm(`Delete stock item “${row.name}”?`)) return;
    try {
      await apiFetch(`/api/stock/items/${row.stock_item_id}`, { method: "DELETE" });
      setMsg(`Deleted “${row.name}”`);
      setEdit(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page-title text-ink">Inventory</h1>
          <p className="mt-1 text-caption">
            Add, edit, or delete stock items. Opening + Received − Used = Balance. Set Min stock for shopping.
            Kitchen Used follows breakfast recipes when orders are saved.
          </p>
        </div>
        <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <SegmentedControl
        aria-label="Stock kind"
        value={kind}
        onChange={setKind}
        options={[
          { value: "all", label: "All" },
          { value: "kitchen", label: "Kitchen" },
          { value: "other", label: "Other" },
        ]}
      />

      <div className="flex flex-wrap gap-2">
        <Button type="button" className="gap-2" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          Add stock item
        </Button>
        <Button type="button" variant="secondary" onClick={downloadInventory}>
          Download inventory
        </Button>
        <Button type="button" variant="secondary" disabled={applying} onClick={() => void applyKitchenUsage()}>
          {applying ? "Applying…" : "Re-sync breakfast usage"}
        </Button>
      </div>

      {error ? <p className="text-sm font-medium text-debit">{error}</p> : null}
      {msg ? <p className="text-sm font-medium text-credit">{msg}</p> : null}

      <PanelCard
        title="Stock items"
        caption={`${rows.length} items · ${date} · Edit name, quantities, or delete`}
        headerRight={
          <Link to="/kitchen/recipes" className="inline-flex min-h-11 items-center text-sm font-semibold text-action">
            Recipes
          </Link>
        }
      >
        {rows.map((r) => (
          <ListRow
            key={r.stock_item_id}
            primary={r.name}
            secondary={`${r.unit} · Open ${fmt(r.opening)} · Rec ${fmt(r.received)} · Used ${fmt(r.used)}${
              r.use_notes ? ` · ${r.use_notes}` : ""
            }`}
            right={
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-sm px-2 text-sm font-semibold text-action hover:bg-neutral-bg"
                    aria-label={`Edit ${r.name}`}
                    onClick={() => setEdit(r)}
                  >
                    <Pencil className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                    Edit
                  </button>
                  <button
                    type="button"
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm text-debit hover:bg-debit-bg"
                    aria-label={`Delete ${r.name}`}
                    onClick={() => void deleteItem(r)}
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                  </button>
                </div>
                <span className="text-sm font-semibold tabular-nums text-ink">Bal {fmt(r.balance)}</span>
                {r.below_min ? <ChangeTag variant="negative">Low</ChangeTag> : (
                  <span className="text-caption">Min {fmt(r.min_stock)}</span>
                )}
              </div>
            }
          />
        ))}
        {!rows.length ? (
          <div className="border-t border-border px-4 py-3 space-y-3">
            <p className="text-caption">No items yet. Add kitchen ingredients or other supplies.</p>
            <Button type="button" className="gap-2" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              Add first stock item
            </Button>
          </div>
        ) : null}
      </PanelCard>

      <Modal open={!!edit} title={edit ? `Edit — ${edit.name}` : ""} onClose={() => setEdit(null)} size="lg">
        {edit ? (
          <ItemEditForm
            date={date}
            row={edit}
            onDone={(name) => {
              setEdit(null);
              setMsg(name ? `Saved “${name}”` : "Saved");
              void load().catch(() => {});
            }}
            onDelete={() => void deleteItem(edit)}
            onError={setError}
          />
        ) : null}
      </Modal>

      <Modal open={addOpen} title="Add stock item" onClose={() => setAddOpen(false)}>
        <AddItemForm
          onDone={(name) => {
            setAddOpen(false);
            setMsg(name ? `Added “${name}”` : "Item added");
            void load().catch(() => {});
          }}
          onError={setError}
        />
      </Modal>
    </div>
  );
}

function ItemEditForm({
  date,
  row,
  onDone,
  onDelete,
  onError,
}: {
  date: string;
  row: StockInventoryRowDto;
  onDone: (name?: string) => void;
  onDelete: () => void;
  onError: (s: string) => void;
}) {
  const [name, setName] = useState(row.name);
  const [unit, setUnit] = useState(row.unit);
  const [useNotes, setUseNotes] = useState(row.use_notes ?? "");
  const [packInfo, setPackInfo] = useState(row.pack_info ?? "");
  const [opening, setOpening] = useState(String(row.opening));
  const [received, setReceived] = useState(String(row.received));
  const [used, setUsed] = useState(String(row.used));
  const [waste, setWaste] = useState(String(row.waste));
  const [expenditure, setExpenditure] = useState(String(row.expenditure));
  const [minStock, setMinStock] = useState(String(row.min_stock));
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !unit.trim()) {
      onError("Name and unit are required");
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/api/stock/items/${row.stock_item_id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          unit: unit.trim(),
          min_stock: Number(minStock),
          use_notes: useNotes.trim() || null,
          pack_info: packInfo.trim() || null,
        }),
      });
      await apiFetch("/api/stock/ledger", {
        method: "PUT",
        body: JSON.stringify({
          date,
          stock_item_id: row.stock_item_id,
          opening: Number(opening),
          received: Number(received),
          used: Number(used),
          waste: Number(waste),
          expenditure: Number(expenditure),
        }),
      });
      onDone(name.trim());
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={(e) => void submit(e)}>
      <p className="text-caption">
        Kind: {row.kind}. Balance = Opening + Received − Used.
        {row.code ? ` Catalog code: ${row.code}.` : ""}
      </p>
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
      <TextField label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} required />
      <TextField
        label="Use / recipe notes"
        value={useNotes}
        onChange={(e) => setUseNotes(e.target.value)}
        placeholder="How this item is consumed"
      />
      <TextField label="Pack info" value={packInfo} onChange={(e) => setPackInfo(e.target.value)} />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Opening" type="number" step="any" value={opening} onChange={(e) => setOpening(e.target.value)} />
        <TextField label="Received" type="number" step="any" value={received} onChange={(e) => setReceived(e.target.value)} />
        <TextField label="Used" type="number" step="any" value={used} onChange={(e) => setUsed(e.target.value)} />
        <TextField label="Waste" type="number" step="any" value={waste} onChange={(e) => setWaste(e.target.value)} />
        <TextField
          label="Expenditure"
          type="number"
          step="any"
          value={expenditure}
          onChange={(e) => setExpenditure(e.target.value)}
        />
        <TextField label="Min stock" type="number" step="any" value={minStock} onChange={(e) => setMinStock(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
        <Button type="button" variant="secondary" disabled={saving} onClick={onDelete}>
          Delete item
        </Button>
      </div>
    </form>
  );
}

function AddItemForm({
  onDone,
  onError,
}: {
  onDone: (name?: string) => void;
  onError: (s: string) => void;
}) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("Number");
  const [kind, setKind] = useState<"kitchen" | "other">("kitchen");
  const [minStock, setMinStock] = useState("0");
  const [useNotes, setUseNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !unit.trim()) {
      onError("Name and unit are required");
      return;
    }
    setSaving(true);
    try {
      await apiFetch<StockItemDto>("/api/stock/items", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          unit: unit.trim(),
          kind,
          min_stock: Number(minStock) || 0,
          use_notes: useNotes.trim() || null,
        }),
      });
      onDone(name.trim());
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={(e) => void submit(e)}>
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
      <TextField label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} required />
      <SegmentedControl
        aria-label="Item kind"
        value={kind}
        onChange={setKind}
        options={[
          { value: "kitchen", label: "Kitchen" },
          { value: "other", label: "Other" },
        ]}
      />
      <TextField label="Min stock" type="number" value={minStock} onChange={(e) => setMinStock(e.target.value)} />
      <TextField
        label="Use / recipe notes"
        value={useNotes}
        onChange={(e) => setUseNotes(e.target.value)}
        placeholder="How this item is consumed"
      />
      <p className="text-caption">
        After adding, open Kitchen → Recipes and use “Add item” on Maldivian or Continental to include it in
        breakfasts.
      </p>
      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Add item"}
      </Button>
    </form>
  );
}
