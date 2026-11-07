import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { apiFetch } from "@/api/http";
import { PageBackHeader } from "@/components/PageBackHeader";
import { ListRow, PanelCard } from "@/components/design";
import { SavingBanner, SkeletonFormPage } from "@/components/Skeleton";
import { Button, TextField } from "@/components/ui";
import type { RecipeDto } from "../../../../shared/types";

function fmtCost(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(2);
}

export function RecipeEditPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === "new";
  const [search] = useSearchParams();
  const kindParam = search.get("kind") === "addons" ? "addons" : "prepared";
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [batchSize, setBatchSize] = useState("1");
  const [recipe, setRecipe] = useState<RecipeDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(isNew);

  const load = useCallback(async () => {
    if (isNew || !id) return;
    const r = await apiFetch<RecipeDto>(`/api/recipes/${id}`);
    setRecipe(r);
    setName(r.name);
    setNotes(r.notes ?? "");
    setBatchSize(String(r.batch_size || 1));
    setLoaded(true);
  }, [id, isNew]);

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [load]);

  async function saveMeta(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        const created = await apiFetch<RecipeDto>("/api/recipes", {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            apply_to: kindParam === "addons" ? "room_extras" : "custom",
            kind: kindParam,
            notes: notes.trim() || null,
            batch_size: Number(batchSize) || 1,
            lines: [],
          }),
        });
        navigate(`/kitchen/recipes/${created.id}`, { replace: true });
      } else {
        await apiFetch(`/api/recipes/${id}`, {
          method: "PUT",
          body: JSON.stringify({
            name: name.trim(),
            notes: notes.trim() || null,
            batch_size: Number(batchSize) || 1,
          }),
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
    if (!confirm(`Delete “${name}”?`)) return;
    try {
      await apiFetch(`/api/recipes/${id}`, { method: "DELETE" });
      navigate("/kitchen/recipes", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  if (!loaded && !isNew) return <SkeletonFormPage fields={4} />;

  const mode = recipe
    ? recipe.kind === "addons" || recipe.apply_to === "room_extras"
      ? "addons"
      : "prepared"
    : kindParam;

  return (
    <div className="flex flex-col gap-4">
      <PageBackHeader
        backTo="/kitchen/recipes"
        title={isNew ? (mode === "addons" ? "New add-ons" : "New prepared item") : name || "Recipe"}
        caption="Each ingredient opens on its own page. Pick grams or cans. Stock is taken in the smallest unit."
      />
      <SavingBanner show={saving} />
      {error ? (
        <p className="rounded-[var(--radius)] border border-debit/30 bg-debit-bg px-3 py-2 text-sm text-debit-ink">
          {error}
        </p>
      ) : null}

      <form className={`space-y-3 ${saving ? "pointer-events-none opacity-70" : ""}`} onSubmit={(e) => void saveMeta(e)}>
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        {mode === "prepared" ? (
          <TextField
            label="Batch size"
            type="number"
            min="1"
            step="1"
            value={batchSize}
            onChange={(e) => setBatchSize(e.target.value)}
          />
        ) : null}
        {mode === "prepared" ? (
          <p className="text-caption">
            Ingredient quantities are for one batch. When this recipe is linked from a menu or room
            extra, kitchen scales by ordered pieces ÷ batch size.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : isNew ? "Create & add ingredients" : "Save details"}
          </Button>
          {!isNew ? (
            <Button type="button" variant="secondary" onClick={() => void remove()}>
              Delete
            </Button>
          ) : null}
        </div>
      </form>

      {!isNew && recipe ? (
        <PanelCard
          title="Ingredients"
          caption={`Cost ${fmtCost(recipe.estimated_cost)}${recipe.cost_incomplete ? " (partial)" : ""}`}
          headerRight={
            <Link
              to={`/kitchen/recipes/${id}/lines/new`}
              className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-action"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add
            </Link>
          }
        >
          {recipe.lines.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted">No ingredients yet.</p>
          ) : (
            <ul>
              {recipe.lines.map((l) => {
                const qty = l.input_qty ?? l.qty_per_serving;
                const unit = l.input_unit ?? l.stock_item_unit;
                const linked = l.component_recipe_name
                  ? ` · expands ${l.component_recipe_name}`
                  : "";
                return (
                  <ListRow
                    key={l.id}
                    primary={l.stock_item_name}
                    secondary={`${qty} ${unit}${
                      l.estimated_cost != null ? ` · ${fmtCost(l.estimated_cost)}` : ""
                    }${linked}`}
                    href={`/kitchen/recipes/${id}/lines/${l.id}`}
                    right={
                      <button
                        type="button"
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm text-debit hover:bg-debit-bg"
                        aria-label={`Remove ${l.stock_item_name}`}
                        onClick={(e) => {
                          e.preventDefault();
                          void (async () => {
                            if (!confirm(`Remove ${l.stock_item_name}?`)) return;
                            try {
                              const next = recipe.lines
                                .filter((x) => x.id !== l.id)
                                .map((x) => ({
                                  stock_item_id: x.stock_item_id,
                                  input_qty: x.input_qty ?? x.qty_per_serving,
                                  input_unit: x.input_unit ?? x.stock_item_unit,
                                  qty_per_serving: x.qty_per_serving,
                                  notes: x.notes,
                                  show_on_kot: x.show_on_kot,
                                  is_option: x.is_option,
                                }));
                              await apiFetch(`/api/recipes/${id}`, {
                                method: "PUT",
                                body: JSON.stringify({ lines: next }),
                              });
                              await load();
                            } catch (err) {
                              setError(err instanceof Error ? err.message : "Failed");
                            }
                          })();
                        }}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    }
                  />
                );
              })}
            </ul>
          )}
        </PanelCard>
      ) : null}
    </div>
  );
}
