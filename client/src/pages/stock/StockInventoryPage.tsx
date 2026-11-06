import { PackagePlus, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "@/api/http";
import { ChangeTag, ListRow, PanelCard, SegmentedControl } from "@/components/design";
import { Dropdown } from "@/components/Dropdown";
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

type StockLevelFilter = "all" | "low";

export function StockInventoryPage() {
  const [date, setDate] = useState(todayYmd);
  const [kind, setKind] = useState<"all" | "kitchen" | "other">("all");
  const [levelFilter, setLevelFilter] = useState<StockLevelFilter>("all");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<StockInventoryRowDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [edit, setEdit] = useState<StockInventoryRowDto | null>(null);
  const [refill, setRefill] = useState<StockInventoryRowDto | null | "pick">(null);
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

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...rows]
      .filter((r) => {
        if (levelFilter === "low" && !r.below_min) return false;
        if (!q) return true;
        return (
          r.name.toLowerCase().includes(q) ||
          (r.code ?? "").toLowerCase().includes(q) ||
          (r.use_notes ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [rows, search, levelFilter]);

  const lowCount = useMemo(() => rows.filter((r) => r.below_min).length, [rows]);

  function downloadInventory() {
    downloadText(
      `inventory-${date}.csv`,
      toCsv(
        [
          "Item",
          "Unit",
          "Opening",
          "Received",
          "Used",
          "Balance",
          "Min Stock",
          "Waste",
          "Unit price",
          "Expenditure",
          "Use",
          "Kind",
        ],
        visibleRows.map((r) => [
          r.name,
          r.unit,
          r.opening,
          r.received,
          r.used,
          r.balance,
          r.min_stock,
          r.waste,
          r.unit_cost,
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

      <SegmentedControl
        aria-label="Stock level"
        value={levelFilter}
        onChange={setLevelFilter}
        options={[
          { value: "all", label: "All levels" },
          {
            value: "low",
            label: lowCount > 0 ? `At / below min (${lowCount})` : "At / below min",
          },
        ]}
      />

      <TextField
        label="Search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name, code, or notes"
        autoComplete="off"
      />

      <div className="flex flex-wrap gap-2">
        <Button type="button" className="gap-2" onClick={() => setRefill("pick")}>
          <PackagePlus className="h-4 w-4" aria-hidden />
          Refill stock
        </Button>
        <Button type="button" variant="secondary" className="gap-2" onClick={() => setAddOpen(true)}>
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
        caption={`${visibleRows.length} shown · A–Z · ${date}${
          levelFilter === "low" ? " · low stock only" : ""
        } · Refill for unit price · Edit for details`}
        headerRight={
          <Link to="/kitchen/recipes" className="inline-flex min-h-11 items-center text-sm font-semibold text-action">
            Recipes
          </Link>
        }
      >
        {visibleRows.map((r) => (
          <ListRow
            key={r.stock_item_id}
            className={r.below_min ? "bg-debit-bg/60" : undefined}
            primary={
              <span className="inline-flex flex-wrap items-center gap-2">
                <span>{r.name}</span>
                {r.below_min ? <ChangeTag variant="negative">Low</ChangeTag> : null}
              </span>
            }
            secondary={`${r.unit} · Open ${fmt(r.opening)} · Rec ${fmt(r.received)} · Used ${fmt(r.used)}${
              r.unit_cost != null ? ` · @ ${fmt(r.unit_cost)}` : ""
            }${r.use_notes ? ` · ${r.use_notes}` : ""}${
              r.below_min ? ` · Min ${fmt(r.min_stock)}` : ""
            }`}
            right={
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-sm px-2 text-sm font-semibold text-action hover:bg-neutral-bg"
                    aria-label={`Refill ${r.name}`}
                    onClick={() => setRefill(r)}
                  >
                    <PackagePlus className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                    Refill
                  </button>
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-sm px-2 text-sm font-semibold text-ink hover:bg-neutral-bg"
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
                <span
                  className={`text-sm font-semibold tabular-nums ${
                    r.below_min ? "text-debit" : "text-ink"
                  }`}
                >
                  Bal {fmt(r.balance)}
                </span>
                {r.below_min ? (
                  <span className="text-caption text-debit">At / below min {fmt(r.min_stock)}</span>
                ) : (
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
        ) : !visibleRows.length ? (
          <p className="border-t border-border px-4 py-3 text-caption">
            No items match this search or filter.
          </p>
        ) : null}
      </PanelCard>

      <Modal
        open={refill != null}
        title={
          refill && refill !== "pick" ? `Refill — ${refill.name}` : "Refill stock"
        }
        onClose={() => setRefill(null)}
      >
        {refill != null ? (
          <RefillForm
            date={date}
            rows={rows}
            initial={refill === "pick" ? null : refill}
            onDone={(name, qty) => {
              setRefill(null);
              setMsg(
                name
                  ? `Refilled “${name}” (+${fmt(qty)})`
                  : "Refill saved",
              );
              void load().catch(() => {});
            }}
            onError={setError}
          />
        ) : null}
      </Modal>

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

function RefillForm({
  date,
  rows,
  initial,
  onDone,
  onError,
}: {
  date: string;
  rows: StockInventoryRowDto[];
  initial: StockInventoryRowDto | null;
  onDone: (name: string, qty: number) => void;
  onError: (s: string) => void;
}) {
  const [stockItemId, setStockItemId] = useState(initial?.stock_item_id ?? rows[0]?.stock_item_id ?? "");
  const selected = rows.find((r) => r.stock_item_id === stockItemId) ?? null;
  const [qty, setQty] = useState("");
  const [unitCost, setUnitCost] = useState(
    initial?.unit_cost != null
      ? String(initial.unit_cost)
      : initial?.last_unit_cost != null
        ? String(initial.last_unit_cost)
        : "",
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!selected) return;
    setUnitCost((prev) => {
      if (prev.trim() !== "") return prev;
      if (selected.unit_cost != null) return String(selected.unit_cost);
      if (selected.last_unit_cost != null) return String(selected.last_unit_cost);
      return "";
    });
  }, [selected]);

  const qtyN = Number(qty);
  const priceN = Number(unitCost);
  const total =
    qtyN > 0 && priceN >= 0 && Number.isFinite(qtyN) && Number.isFinite(priceN)
      ? Math.round(qtyN * priceN * 100) / 100
      : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) {
      onError("Choose a stock item");
      return;
    }
    if (!(qtyN > 0) || !Number.isFinite(qtyN)) {
      onError("Enter a quantity greater than 0");
      return;
    }
    if (!(priceN >= 0) || !Number.isFinite(priceN) || unitCost.trim() === "") {
      onError("Enter a unit price");
      return;
    }
    setSaving(true);
    try {
      const nextReceived = selected.received + qtyN;
      const nextExpenditure =
        Math.round((selected.expenditure + qtyN * priceN) * 100) / 100;
      await apiFetch("/api/stock/ledger", {
        method: "PUT",
        body: JSON.stringify({
          date,
          stock_item_id: selected.stock_item_id,
          received: nextReceived,
          unit_cost: priceN,
          expenditure: nextExpenditure,
          carry_opening: true,
        }),
      });
      onDone(selected.name, qtyN);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const itemOpts = rows.map((r) => ({
    value: r.stock_item_id,
    label:
      r.last_unit_cost != null || r.unit_cost != null
        ? `${r.name} (${r.unit}) · last @ ${fmt(r.unit_cost ?? r.last_unit_cost!)}`
        : `${r.name} (${r.unit})`,
  }));

  return (
    <form className="space-y-3" onSubmit={(e) => void submit(e)}>
      <p className="text-caption">
        Simple refill for {date}. Enter qty received and unit price — total spend is calculated. Price is
        saved for meal cost estimates.
      </p>
      {initial ? (
        <div className="rounded-[var(--radius)] border border-border bg-surface-elevated px-3 py-2">
          <p className="text-sm font-medium text-ink">{initial.name}</p>
          <p className="text-caption">
            Unit: {initial.unit} · On hand {fmt(initial.balance)}
            {initial.unit_cost != null || initial.last_unit_cost != null
              ? ` · Last @ ${fmt(initial.unit_cost ?? initial.last_unit_cost!)}`
              : ""}
          </p>
        </div>
      ) : (
        <Dropdown
          label="Stock item"
          value={stockItemId}
          onChange={setStockItemId}
          options={
            itemOpts.length
              ? itemOpts
              : [{ value: "", label: "No stock items yet" }]
          }
        />
      )}
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label={selected ? `Qty (${selected.unit})` : "Qty"}
          type="number"
          step="any"
          min="0"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder="0"
          required
          autoFocus
        />
        <TextField
          label={selected ? `Unit price / ${selected.unit}` : "Unit price"}
          type="number"
          step="any"
          min="0"
          value={unitCost}
          onChange={(e) => setUnitCost(e.target.value)}
          placeholder="0.00"
          required
        />
      </div>
      <div className="flex items-baseline justify-between gap-3 rounded-[var(--radius)] border border-border px-3 py-2">
        <p className="text-label">Total</p>
        <p className="text-sm font-semibold tabular-nums text-ink">
          {total != null ? total.toFixed(2) : "—"}
        </p>
      </div>
      <Button type="submit" disabled={saving || !rows.length}>
        {saving ? "Saving…" : "Save refill"}
      </Button>
    </form>
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
        Kind: {row.kind}. Balance = Opening + Received − Used. Use Refill for qty + unit price (meal costing).
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
