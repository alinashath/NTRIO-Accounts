import { useCallback, useEffect, useState } from "react";
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
            Opening + Received − Used = Balance. Kitchen Used syncs when breakfast orders are saved. Set Min stock so
            shopping list replenishes.
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
        <Button type="button" variant="secondary" onClick={downloadInventory}>
          Download inventory
        </Button>
        <Button type="button" variant="secondary" disabled={applying} onClick={() => void applyKitchenUsage()}>
          {applying ? "Applying…" : "Re-sync breakfast usage"}
        </Button>
        <Button type="button" onClick={() => setAddOpen(true)}>
          Add stock item
        </Button>
      </div>

      {error ? <p className="text-sm font-medium text-debit">{error}</p> : null}

      <PanelCard title="Stock ledger" caption={`${rows.length} items · ${date}`}>
        {rows.map((r) => (
          <ListRow
            key={r.stock_item_id}
            primary={r.name}
            secondary={`${r.unit} · Open ${fmt(r.opening)} · Rec ${fmt(r.received)} · Used ${fmt(r.used)}${
              r.use_notes ? ` · ${r.use_notes}` : ""
            }`}
            right={
              <div className="flex flex-col items-end gap-1">
                <span className="text-sm font-semibold tabular-nums text-ink">{fmt(r.balance)}</span>
                {r.below_min ? <ChangeTag variant="negative">Low</ChangeTag> : null}
              </div>
            }
            rightSecondary={r.below_min ? undefined : `Min ${fmt(r.min_stock)}`}
            onClick={() => setEdit(r)}
          />
        ))}
        {!rows.length ? <p className="border-t border-border px-4 py-3 text-caption">No items.</p> : null}
      </PanelCard>

      <Modal open={!!edit} title={edit ? `Ledger — ${edit.name}` : ""} onClose={() => setEdit(null)}>
        {edit ? (
          <LedgerForm
            date={date}
            row={edit}
            onDone={() => {
              setEdit(null);
              void load().catch(() => {});
            }}
            onDelete={() => {
              const row = edit;
              setEdit(null);
              void deleteItem(row);
            }}
            onError={setError}
          />
        ) : null}
      </Modal>

      <Modal open={addOpen} title="Add stock item" onClose={() => setAddOpen(false)}>
        <AddItemForm
          onDone={() => {
            setAddOpen(false);
            void load().catch(() => {});
          }}
          onError={setError}
        />
      </Modal>
    </div>
  );
}

function LedgerForm({
  date,
  row,
  onDone,
  onDelete,
  onError,
}: {
  date: string;
  row: StockInventoryRowDto;
  onDone: () => void;
  onDelete: () => void;
  onError: (s: string) => void;
}) {
  const [opening, setOpening] = useState(String(row.opening));
  const [received, setReceived] = useState(String(row.received));
  const [used, setUsed] = useState(String(row.used));
  const [waste, setWaste] = useState(String(row.waste));
  const [expenditure, setExpenditure] = useState(String(row.expenditure));
  const [minStock, setMinStock] = useState(String(row.min_stock));
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
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
      await apiFetch(`/api/stock/items/${row.stock_item_id}`, {
        method: "PATCH",
        body: JSON.stringify({ min_stock: Number(minStock) }),
      });
      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={(e) => void submit(e)}>
      <p className="text-caption">
        Balance = Opening + Received − Used.
        {row.pack_info ? ` Pack: ${row.pack_info}` : ""}
      </p>
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
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="secondary" disabled={saving} onClick={onDelete}>
          Delete item
        </Button>
      </div>
    </form>
  );
}

function AddItemForm({ onDone, onError }: { onDone: () => void; onError: (s: string) => void }) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("Number");
  const [kind, setKind] = useState<"kitchen" | "other">("other");
  const [minStock, setMinStock] = useState("0");
  const [useNotes, setUseNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch<StockItemDto>("/api/stock/items", {
        method: "POST",
        body: JSON.stringify({
          name,
          unit,
          kind,
          min_stock: Number(minStock) || 0,
          use_notes: useNotes.trim() || null,
        }),
      });
      onDone();
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
          { value: "other", label: "Other" },
          { value: "kitchen", label: "Kitchen" },
        ]}
      />
      <TextField label="Min stock" type="number" value={minStock} onChange={(e) => setMinStock(e.target.value)} />
      <TextField
        label="Use / recipe notes"
        value={useNotes}
        onChange={(e) => setUseNotes(e.target.value)}
        placeholder="How this item is consumed"
      />
      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Add item"}
      </Button>
    </form>
  );
}
