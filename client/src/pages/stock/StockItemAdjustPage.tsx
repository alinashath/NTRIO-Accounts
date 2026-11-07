import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "@/api/http";
import { PageBackHeader } from "@/components/PageBackHeader";
import { SavingBanner, SkeletonFormPage } from "@/components/Skeleton";
import { Button, TextField } from "@/components/ui";
import { displayQty, fromBase } from "@/lib/units";
import type { StockInventoryRowDto } from "../../../../shared/types";

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function StockItemAdjustPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [date, setDate] = useState(todayYmd);
  const [row, setRow] = useState<StockInventoryRowDto | null>(null);
  const [opening, setOpening] = useState("");
  const [received, setReceived] = useState("");
  const [used, setUsed] = useState("");
  const [waste, setWaste] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await apiFetch<{ items: StockInventoryRowDto[] }>(
        `/api/stock/inventory?date=${date}&kind=all`,
      );
      const found = data.items.find((r) => r.stock_item_id === id) ?? null;
      setRow(found);
      if (found) {
        const u = found.display_unit;
        setOpening(String(fromBase(found.opening, u, found.units, found.base_unit)));
        setReceived(String(fromBase(found.received, u, found.units, found.base_unit)));
        setUsed(String(fromBase(found.used, u, found.units, found.base_unit)));
        setWaste(String(fromBase(found.waste, u, found.units, found.base_unit)));
      }
    } finally {
      setLoading(false);
    }
  }, [id, date]);

  useEffect(() => {
    void load().catch((e) => {
      setError(e instanceof Error ? e.message : "Failed");
      setLoading(false);
    });
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!row) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/stock/ledger", {
        method: "PUT",
        body: JSON.stringify({
          date,
          stock_item_id: row.stock_item_id,
          qty_unit: row.display_unit,
          opening: Number(opening),
          received: Number(received),
          used: Number(used),
          waste: Number(waste),
        }),
      });
      navigate(`/stock/items/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const unit = row?.display_unit ?? "";
  const bal =
    row != null
      ? displayQty(
          Number(opening || 0) *
            (row.units.find((u) => u.code === row.display_unit)?.to_base ?? 1) +
            Number(received || 0) *
              (row.units.find((u) => u.code === row.display_unit)?.to_base ?? 1) -
            Number(used || 0) *
              (row.units.find((u) => u.code === row.display_unit)?.to_base ?? 1),
          row.display_unit,
          row.units,
          row.base_unit,
        )
      : null;

  if (loading) return <SkeletonFormPage fields={5} />;

  return (
    <div className="flex flex-col gap-4">
      <PageBackHeader
        backTo={id ? `/stock/items/${id}` : "/stock"}
        title={row ? `Adjust — ${row.name}` : "Adjust ledger"}
        caption="Balance = Opening + Received − Used. Enter quantities in the display unit. Prefer Refill for purchases with a product price."
      />
      <SavingBanner show={saving} />
      {error ? (
        <p className="rounded-[var(--radius)] border border-debit/30 bg-debit-bg px-3 py-2 text-sm text-debit-ink">
          {error}
        </p>
      ) : null}
      <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      {row ? (
        <form className={`space-y-3 ${saving ? "pointer-events-none opacity-70" : ""}`} onSubmit={(e) => void submit(e)}>
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label={`Opening (${unit})`}
              type="number"
              step="any"
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
            />
            <TextField
              label={`Received (${unit})`}
              type="number"
              step="any"
              value={received}
              onChange={(e) => setReceived(e.target.value)}
            />
            <TextField
              label={`Used (${unit})`}
              type="number"
              step="any"
              value={used}
              onChange={(e) => setUsed(e.target.value)}
            />
            <TextField
              label={`Waste (${unit})`}
              type="number"
              step="any"
              value={waste}
              onChange={(e) => setWaste(e.target.value)}
            />
          </div>
          <p className="text-caption">Preview balance: {bal?.text ?? "—"}</p>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save adjustment"}
          </Button>
        </form>
      ) : (
        <p className="text-caption">Stock item not found.</p>
      )}
    </div>
  );
}
