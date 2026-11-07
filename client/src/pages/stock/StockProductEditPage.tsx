import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { apiFetch } from "@/api/http";
import { PageBackHeader } from "@/components/PageBackHeader";
import { Dropdown } from "@/components/Dropdown";
import { SavingBanner, SkeletonFormPage } from "@/components/Skeleton";
import { Button, TextField } from "@/components/ui";
import { fmtQty, toBase } from "@/lib/units";
import type { StockItemDto, StockProductDto } from "../../../../shared/types";

export function StockProductEditPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === "new";
  const [search] = useSearchParams();
  const navigate = useNavigate();

  const [items, setItems] = useState<StockItemDto[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [stockItemId, setStockItemId] = useState(search.get("stock_item_id") ?? "");
  const [qty, setQty] = useState("1");
  const [unitCode, setUnitCode] = useState("");
  const [defaultPrice, setDefaultPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const selected = items.find((i) => i.id === stockItemId) ?? null;
  const unitOpts = useMemo(
    () =>
      (selected?.units ?? []).map((u) => ({
        value: u.code,
        label: `${u.label} (= ${u.to_base} ${selected?.base_unit})`,
      })),
    [selected],
  );

  const basePreview = useMemo(() => {
    if (!selected) return null;
    const q = Number(qty);
    if (!(q > 0) || !unitCode) return null;
    return toBase(q, unitCode, selected.units, selected.base_unit);
  }, [selected, qty, unitCode]);

  const load = useCallback(async () => {
    const stock = await apiFetch<{ items: StockItemDto[] }>("/api/stock/items?kind=all");
    setItems(stock.items);
    if (!isNew && id) {
      const p = await apiFetch<StockProductDto>(`/api/stock/products/${id}`);
      setName(p.name);
      setDescription(p.description ?? "");
      setStockItemId(p.stock_item_id);
      setQty(String(p.qty));
      setUnitCode(p.unit_code);
      setDefaultPrice(p.default_price != null ? String(p.default_price) : "");
    } else {
      const sid = search.get("stock_item_id") || stock.items[0]?.id || "";
      setStockItemId(sid);
      const item = stock.items.find((i) => i.id === sid);
      if (item) setUnitCode(item.display_unit || item.base_unit);
    }
    setLoaded(true);
  }, [id, isNew, search]);

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    if (!unitOpts.some((u) => u.value === unitCode)) {
      setUnitCode(selected.display_unit || selected.base_unit);
    }
  }, [selected, unitOpts, unitCode]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !stockItemId) {
      setError("Name and stock item are required");
      return;
    }
    const q = Number(qty);
    if (!(q > 0)) {
      setError("Quantity must be greater than 0");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        stock_item_id: stockItemId,
        description: description.trim() || null,
        qty: q,
        unit_code: unitCode,
        default_price: defaultPrice.trim() === "" ? null : Number(defaultPrice),
      };
      if (isNew) {
        const created = await apiFetch<StockProductDto>("/api/stock/products", {
          method: "POST",
          body: JSON.stringify(body),
        });
        navigate(`/stock/products/${created.id}`, { replace: true });
      } else {
        await apiFetch(`/api/stock/products/${id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
        navigate(`/stock/items/${stockItemId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (isNew || !id) return;
    if (!confirm(`Delete product “${name}”?`)) return;
    try {
      await apiFetch(`/api/stock/products/${id}`, { method: "DELETE" });
      navigate(stockItemId ? `/stock/items/${stockItemId}` : "/stock/products");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  if (!loaded) return <SkeletonFormPage fields={5} />;

  return (
    <div className="flex flex-col gap-4">
      <PageBackHeader
        backTo={stockItemId ? `/stock/items/${stockItemId}` : "/stock/products"}
        title={isNew ? "Add product" : name || "Edit product"}
        caption="One product fills one stock item. A 1 kg bag and a 10 kg sack can both fill flour. Case description goes here."
      />
      <SavingBanner show={saving} />
      {error ? (
        <p className="rounded-[var(--radius)] border border-debit/30 bg-debit-bg px-3 py-2 text-sm text-debit-ink">
          {error}
        </p>
      ) : null}
      <form className={`space-y-3 ${saving ? "pointer-events-none opacity-70" : ""}`} onSubmit={(e) => void submit(e)}>
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Dropdown
          label="Fills stock item"
          value={stockItemId}
          onChange={setStockItemId}
          options={
            items.length
              ? items.map((i) => ({ value: i.id, label: `${i.name} (${i.unit})` }))
              : [{ value: "", label: "No stock items" }]
          }
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Qty per product"
            type="number"
            step="any"
            min="0"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            required
          />
          <Dropdown
            label="Unit"
            value={unitCode}
            onChange={setUnitCode}
            options={unitOpts.length ? unitOpts : [{ value: "pcs", label: "pcs" }]}
          />
        </div>
        {basePreview != null && selected ? (
          <p className="text-caption">
            Stores {fmtQty(basePreview)} {selected.base_unit} per product.
          </p>
        ) : null}
        <TextField
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Case of 48 cans. Each can is 170 g."
        />
        <TextField
          label="Default price (optional)"
          type="number"
          step="any"
          min="0"
          value={defaultPrice}
          onChange={(e) => setDefaultPrice(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving || !items.length}>
            {saving ? "Saving…" : isNew ? "Create product" : "Save changes"}
          </Button>
          {!isNew ? (
            <Button type="button" variant="secondary" onClick={() => void remove()}>
              Delete
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
