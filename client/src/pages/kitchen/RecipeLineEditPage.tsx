import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "@/api/http";
import { PageBackHeader } from "@/components/PageBackHeader";
import { Dropdown } from "@/components/Dropdown";
import { SavingBanner, SkeletonFormPage } from "@/components/Skeleton";
import { Button, TextField } from "@/components/ui";
import { fmtQty, labelForUnit, toBase } from "@/lib/units";
import type { RecipeDto, StockItemDto } from "../../../../shared/types";

export function RecipeLineEditPage() {
  const { id: recipeId, lineId } = useParams<{ id: string; lineId: string }>();
  const isNew = !lineId || lineId === "new";
  const navigate = useNavigate();

  const [recipe, setRecipe] = useState<RecipeDto | null>(null);
  const [prepared, setPrepared] = useState<RecipeDto[]>([]);
  const [items, setItems] = useState<StockItemDto[]>([]);
  const [stockItemId, setStockItemId] = useState("");
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState("");
  const [componentRecipeId, setComponentRecipeId] = useState("");
  const [notes, setNotes] = useState("");
  const [showOnKot, setShowOnKot] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const selected = items.find((i) => i.id === stockItemId) ?? null;
  const unitOpts = useMemo(
    () =>
      (selected?.units ?? []).map((u) => ({
        value: u.code,
        label: u.label,
      })),
    [selected],
  );

  const preview = useMemo(() => {
    if (!selected) return null;
    const q = Number(qty);
    if (!(q > 0) || !unit) return null;
    const base = toBase(q, unit, selected.units, selected.base_unit);
    const cost =
      selected.last_unit_cost != null
        ? Math.round(base * selected.last_unit_cost * 100) / 100
        : null;
    return { base, cost };
  }, [selected, qty, unit]);

  const load = useCallback(async () => {
    if (!recipeId) return;
    setLoading(true);
    try {
      const [r, s, allRecipes] = await Promise.all([
        apiFetch<RecipeDto>(`/api/recipes/${recipeId}`),
        apiFetch<{ items: StockItemDto[] }>("/api/stock/items?kind=all"),
        apiFetch<{ items: RecipeDto[] }>("/api/recipes"),
      ]);
      setRecipe(r);
      setItems(s.items);
      setPrepared(
        allRecipes.items.filter(
          (x) => x.kind === "prepared" || x.apply_to === "custom",
        ),
      );
      if (!isNew && lineId) {
        const line = r.lines.find((l) => l.id === lineId);
        if (line) {
          setStockItemId(line.stock_item_id);
          setQty(String(line.input_qty ?? line.qty_per_serving));
          setUnit(line.input_unit ?? line.stock_item_unit);
          setComponentRecipeId(line.component_recipe_id ?? "");
          setNotes(line.notes ?? "");
          setShowOnKot(line.show_on_kot !== false);
        }
      } else if (s.items[0]) {
        setStockItemId(s.items[0].id);
        setUnit(s.items[0].display_unit || s.items[0].base_unit);
      }
    } finally {
      setLoading(false);
    }
  }, [recipeId, lineId, isNew]);

  useEffect(() => {
    void load().catch((e) => {
      setError(e instanceof Error ? e.message : "Failed");
      setLoading(false);
    });
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    if (!unitOpts.some((u) => u.value === unit)) {
      setUnit(selected.display_unit || selected.base_unit);
    }
  }, [selected, unitOpts, unit]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!recipe || !stockItemId) return;
    const q = Number(qty);
    if (!(q > 0)) {
      setError("Quantity must be greater than 0");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const isAddons = recipe.kind === "addons" || recipe.apply_to === "room_extras";
      const thisLine = {
        stock_item_id: stockItemId,
        input_qty: q,
        input_unit: unit,
        component_recipe_id: isAddons && componentRecipeId ? componentRecipeId : null,
        notes: notes.trim() || null,
        show_on_kot: showOnKot,
        is_option: false,
      };
      const others = recipe.lines
        .filter((l) => (isNew ? true : l.id !== lineId))
        .map((l) => ({
          stock_item_id: l.stock_item_id,
          input_qty: l.input_qty ?? l.qty_per_serving,
          input_unit: l.input_unit ?? l.stock_item_unit,
          qty_per_serving: l.qty_per_serving,
          component_recipe_id: l.component_recipe_id,
          notes: l.notes,
          show_on_kot: l.show_on_kot,
          is_option: l.is_option,
        }));
      await apiFetch(`/api/recipes/${recipeId}`, {
        method: "PUT",
        body: JSON.stringify({ lines: [...others, thisLine] }),
      });
      navigate(`/kitchen/recipes/${recipeId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <SkeletonFormPage fields={4} />;

  return (
    <div className="flex flex-col gap-4">
      <PageBackHeader
        backTo={`/kitchen/recipes/${recipeId}`}
        title={isNew ? "Add ingredient" : "Edit ingredient"}
        caption="Pick the unit you think in — can or gram. We store the smallest unit for stock and cost."
      />
      <SavingBanner show={saving} />
      {error ? (
        <p className="rounded-[var(--radius)] border border-debit/30 bg-debit-bg px-3 py-2 text-sm text-debit-ink">
          {error}
        </p>
      ) : null}
      <form className={`space-y-3 ${saving ? "pointer-events-none opacity-70" : ""}`} onSubmit={(e) => void submit(e)}>
        <Dropdown
          label="Stock item"
          value={stockItemId}
          onChange={setStockItemId}
          options={
            items.length
              ? items.map((i) => ({
                  value: i.id,
                  label:
                    i.last_unit_cost != null
                      ? `${i.name} (${i.unit})`
                      : `${i.name} (${i.unit})`,
                }))
              : [{ value: "", label: "No stock items" }]
          }
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Quantity"
            type="number"
            step="any"
            min="0"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            required
          />
          <Dropdown
            label="Unit"
            value={unit}
            onChange={setUnit}
            options={unitOpts.length ? unitOpts : [{ value: "pcs", label: "pcs" }]}
          />
        </div>
        {preview && selected ? (
          <div className="rounded-[var(--radius)] border border-border px-3 py-2 text-sm text-ink">
            {qty} {labelForUnit(selected.units, unit, unit)} = {fmtQty(preview.base)}{" "}
            {selected.base_unit}
            {preview.cost != null ? `, cost ${preview.cost.toFixed(2)}` : ""}
          </div>
        ) : null}
        <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        {(recipe?.kind === "addons" || recipe?.apply_to === "room_extras") && (
          <>
            <Dropdown
              label="Expand prepared recipe (optional)"
              value={componentRecipeId}
              onChange={setComponentRecipeId}
              required={false}
              placeholder="None — use stock qty only"
              options={prepared.map((p) => ({
                value: p.id,
                label: `${p.name}${p.batch_size > 1 ? ` (batch ${p.batch_size})` : ""}`,
              }))}
              hint="When set, ordered pieces use that recipe’s ingredients ÷ batch size instead of depleting this stock item."
            />
            <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={showOnKot}
                onChange={(e) => setShowOnKot(e.target.checked)}
              />
              Show on KOT when selected
            </label>
          </>
        )}
        <Button type="submit" disabled={saving || !items.length}>
          {saving ? "Saving…" : "Save ingredient"}
        </Button>
      </form>
    </div>
  );
}
