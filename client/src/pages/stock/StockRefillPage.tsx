import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { apiFetch } from "@/api/http";
import { PageBackHeader } from "@/components/PageBackHeader";
import { Dropdown } from "@/components/Dropdown";
import { SavingBanner, SkeletonFormPage } from "@/components/Skeleton";
import { Button, TextField } from "@/components/ui";
import { displayQty, fmtQty, labelForUnit, productRefillToBase, toBase } from "@/lib/units";
import type { StockInventoryRowDto, StockItemDto, StockProductDto } from "../../../../shared/types";

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type ProductDraft = {
  name: string;
  qty: string;
  unitCode: string;
  defaultPrice: string;
};

type RefillItem = Pick<
  StockInventoryRowDto,
  "stock_item_id" | "name" | "unit" | "base_unit" | "display_unit" | "units"
>;

function itemToRefillRow(item: StockItemDto): RefillItem {
  return {
    stock_item_id: item.id,
    name: item.name,
    unit: item.unit,
    base_unit: item.base_unit,
    display_unit: item.display_unit,
    units: item.units,
  };
}

export function StockRefillPage() {
  const { id: itemIdParam } = useParams<{ id: string }>();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const [date, setDate] = useState(todayYmd);
  const [rows, setRows] = useState<RefillItem[]>([]);
  const [products, setProducts] = useState<StockProductDto[]>([]);
  const [stockItemId, setStockItemId] = useState(itemIdParam ?? search.get("stock_item_id") ?? "");
  const [productId, setProductId] = useState("");
  const [count, setCount] = useState("1");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<ProductDraft | null>(null);

  const selected = rows.find((r) => r.stock_item_id === stockItemId) ?? null;
  const product = products.find((p) => p.id === productId) ?? null;
  const unitOpts = useMemo(
    () =>
      (selected?.units ?? []).map((u) => ({
        value: u.code,
        label: `${u.label} (= ${u.to_base} ${selected?.base_unit})`,
      })),
    [selected],
  );
  const draftBasePreview = useMemo(() => {
    if (!selected || !draft) return null;
    const q = Number(draft.qty);
    if (!(q > 0) || !draft.unitCode) return null;
    return toBase(q, draft.unitCode, selected.units, selected.base_unit);
  }, [selected, draft]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Prefer item GET (no seed) when refilling a known stock item.
      if (itemIdParam) {
        const item = await apiFetch<StockItemDto>(`/api/stock/items/${itemIdParam}`);
        setRows([itemToRefillRow(item)]);
        setStockItemId(item.id);
        return;
      }
      const list = await apiFetch<{ items: StockItemDto[] }>("/api/stock/items?kind=all");
      setRows(list.items.map(itemToRefillRow));
      setStockItemId((prev) => prev || list.items[0]?.id || "");
    } finally {
      setLoading(false);
    }
  }, [itemIdParam]);

  useEffect(() => {
    void load().catch((e) => {
      setError(e instanceof Error ? e.message : "Failed");
      setLoading(false);
    });
  }, [load]);

  useEffect(() => {
    setDraft(null);
    if (!stockItemId) {
      setProducts([]);
      return;
    }
    void apiFetch<{ items: StockProductDto[] }>(`/api/stock/products?stock_item_id=${stockItemId}`)
      .then((d) => {
        setProducts(d.items);
        setProductId((prev) =>
          d.items.some((p) => p.id === prev) ? prev : d.items[0]?.id ?? "",
        );
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [stockItemId]);

  useEffect(() => {
    if (!product) return;
    if (product.default_price != null) {
      setPrice((prev) => (prev.trim() === "" ? String(product.default_price) : prev));
    }
  }, [product]);

  const preview = useMemo(() => {
    if (!selected || !product) return null;
    const c = Number(count);
    const p = Number(price);
    if (!(c > 0) || !(p >= 0) || !Number.isFinite(p)) return null;
    return productRefillToBase({
      count: c,
      productQty: product.qty,
      productUnit: product.unit_code,
      pricePerProduct: p,
      units: selected.units,
      baseUnit: selected.base_unit,
    });
  }, [selected, product, count, price]);

  function openProductDraft(name: string) {
    if (!selected) {
      setError("Choose a stock item first");
      return;
    }
    setError(null);
    setDraft({
      name: name.trim(),
      qty: "1",
      unitCode: selected.display_unit || selected.base_unit,
      defaultPrice: "",
    });
  }

  async function saveProductDraft() {
    if (!selected || !draft) return;
    const name = draft.name.trim();
    if (!name) {
      setError("Product name is required");
      return;
    }
    const q = Number(draft.qty);
    if (!(q > 0)) {
      setError("Qty per product must be greater than 0");
      return;
    }
    if (!draft.unitCode) {
      setError("Choose a unit");
      return;
    }
    setSavingProduct(true);
    setError(null);
    try {
      const created = await apiFetch<StockProductDto>("/api/stock/products", {
        method: "POST",
        body: JSON.stringify({
          name,
          stock_item_id: selected.stock_item_id,
          qty: q,
          unit_code: draft.unitCode,
          default_price:
            draft.defaultPrice.trim() === "" ? null : Number(draft.defaultPrice),
        }),
      });
      setProducts((prev) => [...prev, created].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)));
      setProductId(created.id);
      if (created.default_price != null && price.trim() === "") {
        setPrice(String(created.default_price));
      }
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save product");
    } finally {
      setSavingProduct(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (draft) {
      setError("Save the new product first, or cancel it");
      return;
    }
    if (!selected || !product) {
      setError("Choose a stock item and a product");
      return;
    }
    const c = Number(count);
    const p = Number(price);
    if (!(c > 0)) {
      setError("Enter how many products you received");
      return;
    }
    if (!(p >= 0) || price.trim() === "") {
      setError("Enter the price per product");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/stock/ledger", {
        method: "PUT",
        body: JSON.stringify({
          date,
          stock_item_id: selected.stock_item_id,
          product_id: product.id,
          product_count: c,
          product_unit_price: p,
          carry_opening: true,
        }),
      });
      navigate(itemIdParam ? `/stock/items/${itemIdParam}` : "/stock");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const backTo = itemIdParam ? `/stock/items/${itemIdParam}` : "/stock";
  const busy = saving || savingProduct;

  if (loading) return <SkeletonFormPage fields={4} />;

  return (
    <div className="flex flex-col gap-4">
      <PageBackHeader
        backTo={backTo}
        title={selected ? `Refill — ${selected.name}` : "Refill stock"}
        caption="Example: buy 1 kg flour for 25. We store 1,000 g at 0.025 per gram. Pick the product you bought — or type a new name in search to add one."
      />

      <SavingBanner show={saving} label="Saving refill…" />
      <SavingBanner show={savingProduct} label="Saving product…" />

      {error ? (
        <p className="rounded-[var(--radius)] border border-debit/30 bg-debit-bg px-3 py-2 text-sm text-debit-ink">
          {error}
        </p>
      ) : null}

      <form className={`space-y-3 ${busy ? "pointer-events-none opacity-70" : ""}`} onSubmit={(e) => void submit(e)}>
        <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        {!itemIdParam ? (
          <Dropdown
            label="Stock item"
            value={stockItemId}
            onChange={(v) => {
              setStockItemId(v);
              setDraft(null);
            }}
            options={
              rows.length
                ? rows.map((r) => ({ value: r.stock_item_id, label: `${r.name} (${r.unit})` }))
                : [{ value: "", label: "No stock items" }]
            }
          />
        ) : null}

        {selected ? (
          <Dropdown
            label="Product"
            value={productId}
            onChange={(v) => {
              setProductId(v);
              setDraft(null);
            }}
            placeholder={products.length ? "Select…" : "Search to add a product…"}
            options={products.map((p) => ({
              value: p.id,
              label: `${p.name} · ${p.qty} ${p.unit_code}`,
            }))}
            onAddNotFound={(name) => {
              openProductDraft(name);
            }}
            addNotFoundLabel="Add product"
            hint={
              products.length === 0
                ? "No products yet. Open the list, type a name, then Add product."
                : "Type to search. If nothing matches, add a new product from the search."
            }
          />
        ) : null}

        {draft && selected ? (
          <div className="space-y-3 rounded-[var(--radius-xl)] border border-border bg-surface p-3">
            <div>
              <p className="text-section text-ink">New product</p>
              <p className="mt-1 text-caption">
                Set how much one pack adds to {selected.name}, then save and use it for this refill.
              </p>
            </div>
            <TextField
              label="Name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              required
            />
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label="Qty per product"
                type="number"
                step="any"
                min="0"
                value={draft.qty}
                onChange={(e) => setDraft({ ...draft, qty: e.target.value })}
                required
              />
              <Dropdown
                label="Unit"
                value={draft.unitCode}
                onChange={(v) => setDraft({ ...draft, unitCode: v })}
                options={
                  unitOpts.length
                    ? unitOpts
                    : [{ value: selected.base_unit, label: selected.base_unit }]
                }
              />
            </div>
            {draftBasePreview != null ? (
              <p className="text-caption">
                Stores {fmtQty(draftBasePreview)} {selected.base_unit} per product.
              </p>
            ) : null}
            <TextField
              label="Default price (optional)"
              type="number"
              step="any"
              min="0"
              value={draft.defaultPrice}
              onChange={(e) => setDraft({ ...draft, defaultPrice: e.target.value })}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void saveProductDraft()} disabled={savingProduct}>
                {savingProduct ? "Saving…" : "Save and use"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setDraft(null)} disabled={savingProduct}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="How many"
            type="number"
            step="any"
            min="0"
            value={count}
            onChange={(e) => setCount(e.target.value)}
            required
          />
          <TextField
            label="Price each"
            type="number"
            step="any"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
          />
        </div>

        {preview && selected ? (
          <div className="rounded-[var(--radius)] border border-border px-3 py-2 space-y-1">
            <p className="text-label">Stores</p>
            <p className="text-sm text-ink">
              {fmtQty(preview.baseQty)} {labelForUnit(selected.units, selected.base_unit, selected.base_unit)}{" "}
              at {preview.unitCost.toFixed(6)} per {selected.base_unit}
            </p>
            <p className="text-sm text-ink">
              Display:{" "}
              {
                displayQty(preview.baseQty, selected.display_unit, selected.units, selected.base_unit)
                  .text
              }
            </p>
            <p className="text-sm font-semibold tabular-nums text-ink">
              Total {preview.expenditure.toFixed(2)}
            </p>
          </div>
        ) : null}

        <Button type="submit" disabled={busy || !product || !!draft}>
          {saving ? "Saving…" : "Save refill"}
        </Button>
      </form>
    </div>
  );
}
