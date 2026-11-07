import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "@/api/http";
import { PageBackHeader } from "@/components/PageBackHeader";
import { ListRow, PanelCard, SegmentedControl } from "@/components/design";
import { Dropdown } from "@/components/Dropdown";
import { SavingBanner, SkeletonFormPage } from "@/components/Skeleton";
import { Button, TextField } from "@/components/ui";
import { baseForMeasure, buildUnitsList, type MeasureKind } from "@/lib/units";
import type { StockItemDto, StockProductDto } from "../../../../shared/types";

export function StockItemEditPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === "new";
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [measure, setMeasure] = useState<MeasureKind>("count");
  const [displayUnit, setDisplayUnit] = useState("pcs");
  const [pieceLabel, setPieceLabel] = useState("pcs");
  const [kind, setKind] = useState<"kitchen" | "other">("kitchen");
  const [minStock, setMinStock] = useState("0");
  const [useNotes, setUseNotes] = useState("");
  const [canGrams, setCanGrams] = useState("");
  const [caseCans, setCaseCans] = useState("");
  const [products, setProducts] = useState<StockProductDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(isNew);

  const unitsPreview = useMemo(() => {
    const base = baseForMeasure(measure);
    const packs: Array<{ code: string; label: string; to_base: number }> = [];
    const g = Number(canGrams);
    if (measure === "count" && g > 0) {
      // converting to weight via can
      return buildUnitsList(
        "g",
        [
          { code: "can", label: "can", to_base: g },
          ...(Number(caseCans) > 0
            ? [{ code: "case", label: "case", to_base: g * Number(caseCans) }]
            : []),
        ],
        "can",
      );
    }
    if (measure === "weight" && g > 0) {
      packs.push({ code: "can", label: "can", to_base: g });
      if (Number(caseCans) > 0) {
        packs.push({ code: "case", label: "case", to_base: g * Number(caseCans) });
      }
    }
    return buildUnitsList(base, packs, measure === "count" ? pieceLabel || "pcs" : undefined);
  }, [measure, canGrams, caseCans, pieceLabel]);

  const displayOpts = unitsPreview.map((u) => ({ value: u.code, label: u.label }));

  const load = useCallback(async () => {
    if (isNew || !id) return;
    const item = await apiFetch<StockItemDto & { product_count?: number }>(`/api/stock/items/${id}`);
    setName(item.name);
    setKind(item.kind);
    setMeasure(item.base_unit === "g" ? "weight" : item.base_unit === "ml" ? "volume" : "count");
    setDisplayUnit(item.display_unit);
    setPieceLabel(item.unit);
    setUseNotes(item.use_notes ?? "");
    const can = item.units.find((u) => u.code === "can" || u.kind === "pack");
    if (can && item.base_unit === "g") setCanGrams(String(can.to_base));
    const caseU = item.units.find((u) => u.code === "case");
    if (caseU && can) setCaseCans(String(caseU.to_base / can.to_base));
    // min stock shown in display unit
    const factor = item.units.find((u) => u.code === item.display_unit)?.to_base ?? 1;
    setMinStock(String(factor > 0 ? item.min_stock / factor : item.min_stock));
    const prods = await apiFetch<{ items: StockProductDto[] }>(
      `/api/stock/products?stock_item_id=${id}`,
    );
    setProducts(prods.items);
    setLoaded(true);
  }, [id, isNew]);

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [load]);

  useEffect(() => {
    if (!isNew) return;
    if (measure === "weight") setDisplayUnit("kg");
    else if (measure === "volume") setDisplayUnit("L");
    else setDisplayUnit("pcs");
  }, [measure, isNew]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const packs = unitsPreview.filter((u) => u.kind === "pack").map((u) => ({
        code: u.code,
        label: u.label,
        to_base: u.to_base,
      }));
      const useCanWeight = Number(canGrams) > 0;
      const body: Record<string, unknown> = {
        name: name.trim(),
        kind,
        measure: useCanWeight ? "weight" : measure,
        base_unit: useCanWeight ? "g" : baseForMeasure(measure),
        display_unit: useCanWeight ? "can" : displayUnit,
        piece_label: measure === "count" && !useCanWeight ? pieceLabel || "pcs" : null,
        packs: useCanWeight
          ? [
              { code: "can", label: "can", to_base: Number(canGrams) },
              ...(Number(caseCans) > 0
                ? [
                    {
                      code: "case",
                      label: "case",
                      to_base: Number(canGrams) * Number(caseCans),
                    },
                  ]
                : []),
            ]
          : packs,
        min_stock: Number(minStock) || 0,
        min_stock_unit: useCanWeight ? "can" : displayUnit,
        use_notes: useNotes.trim() || null,
      };

      // First-time can weight on an existing count item — rescale history
      if (!isNew && measure === "count" && useCanWeight) {
        body.piece_to_base = Number(canGrams);
        body.piece_code = "can";
        body.piece_unit_label = "can";
        body.rescale_existing = true;
      }

      if (isNew) {
        const created = await apiFetch<StockItemDto>("/api/stock/items", {
          method: "POST",
          body: JSON.stringify(body),
        });
        navigate(`/stock/items/${created.id}`, { replace: true });
      } else {
        await apiFetch(`/api/stock/items/${id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        await load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (isNew || !id) return;
    if (!confirm(`Delete stock item “${name}”?`)) return;
    try {
      await apiFetch(`/api/stock/items/${id}`, { method: "DELETE" });
      navigate("/stock", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  if (!loaded && !isNew) {
    return <SkeletonFormPage fields={6} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageBackHeader
        backTo="/stock"
        title={isNew ? "Add stock item" : name || "Edit stock item"}
        caption="We store grams, millilitres, or pieces. You can still work in kg, litres, or cans."
      />

      <SavingBanner show={saving} />

      {error ? (
        <p className="rounded-[var(--radius)] border border-debit/30 bg-debit-bg px-3 py-2 text-sm text-debit-ink">
          {error}
        </p>
      ) : null}

      <form className={`space-y-4 ${saving ? "pointer-events-none opacity-70" : ""}`} onSubmit={(e) => void submit(e)}>
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <SegmentedControl
          aria-label="Item kind"
          value={kind}
          onChange={setKind}
          options={[
            { value: "kitchen", label: "Kitchen" },
            { value: "other", label: "Other" },
          ]}
        />
        <SegmentedControl
          aria-label="Measure"
          value={measure}
          onChange={setMeasure}
          options={[
            { value: "weight", label: "Weight" },
            { value: "volume", label: "Volume" },
            { value: "count", label: "Count" },
          ]}
        />
        {measure === "count" ? (
          <TextField
            label="Piece label"
            value={pieceLabel}
            onChange={(e) => setPieceLabel(e.target.value)}
            placeholder="pcs, slice, teabag…"
          />
        ) : null}
        <Dropdown
          label="Display unit"
          value={displayUnit}
          onChange={setDisplayUnit}
          options={displayOpts.length ? displayOpts : [{ value: "pcs", label: "pcs" }]}
        />
        <TextField
          label={`Min stock (${displayUnit})`}
          type="number"
          step="any"
          min="0"
          value={minStock}
          onChange={(e) => setMinStock(e.target.value)}
        />
        <TextField
          label="Use / recipe notes"
          value={useNotes}
          onChange={(e) => setUseNotes(e.target.value)}
          placeholder="How this item is consumed"
        />

        <PanelCard title="Can / case size (optional)">
          <div className="space-y-3 px-4 py-3">
            <p className="text-caption">
              For tuna and similar: set how many grams are in one can. A case is a count of cans.
              Recipes can then use can or gram.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label="Grams per can"
                type="number"
                step="any"
                min="0"
                value={canGrams}
                onChange={(e) => setCanGrams(e.target.value)}
                placeholder="170"
              />
              <TextField
                label="Cans per case"
                type="number"
                step="1"
                min="0"
                value={caseCans}
                onChange={(e) => setCaseCans(e.target.value)}
                placeholder="48"
              />
            </div>
          </div>
        </PanelCard>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : isNew ? "Create item" : "Save changes"}
          </Button>
          {!isNew ? (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate(`/stock/items/${id}/adjust`)}
              >
                Adjust ledger
              </Button>
              <Button type="button" variant="secondary" onClick={() => void remove()}>
                Delete
              </Button>
            </>
          ) : null}
        </div>
      </form>

      {!isNew ? (
        <PanelCard
          title="Products that refill this item"
          headerRight={
            <Link
              to={`/stock/products/new?stock_item_id=${id}`}
              className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-action"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add
            </Link>
          }
        >
          {products.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted">
              No products yet. Add a 1 kg bag and a 10 kg sack so both can refill this stock.
            </p>
          ) : (
            <ul>
              {products.map((p) => (
                <ListRow
                  key={p.id}
                  primary={p.name}
                  secondary={`${p.qty} ${p.unit_code}${
                    p.default_price != null ? ` · default ${p.default_price.toFixed(2)}` : ""
                  }`}
                  href={`/stock/products/${p.id}`}
                />
              ))}
            </ul>
          )}
        </PanelCard>
      ) : null}
    </div>
  );
}
