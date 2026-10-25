import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/api/http";
import { ListRow, PanelCard } from "@/components/design";
import { Dropdown } from "@/components/Dropdown";
import { Modal } from "@/components/Modal";
import { Button, TextField } from "@/components/ui";
import type { RecipeApplyTo, RecipeDto, StockItemDto } from "../../../../shared/types";

type LineDraft = { stock_item_id: string; qty_per_serving: string; notes: string };

export function KitchenRecipesPage() {
  const [recipes, setRecipes] = useState<RecipeDto[]>([]);
  const [items, setItems] = useState<StockItemDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<"create" | RecipeDto | null>(null);

  const load = useCallback(async () => {
    const [r, s] = await Promise.all([
      apiFetch<{ items: RecipeDto[] }>("/api/recipes"),
      apiFetch<{ items: StockItemDto[] }>("/api/stock/items?kind=all"),
    ]);
    setRecipes(r.items);
    setItems(s.items);
  }, []);

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [load]);

  async function remove(id: string) {
    if (!confirm("Delete this recipe?")) return;
    try {
      await apiFetch(`/api/recipes/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page-title text-ink">Recipes</h1>
          <p className="mt-1 text-caption">
            Create, edit, or delete recipes and ingredient lines (stock items).
          </p>
        </div>
        <Button type="button" onClick={() => setModal("create")}>
          Create recipe
        </Button>
      </div>

      {error ? <p className="text-sm font-medium text-debit">{error}</p> : null}

      <PanelCard title="Recipes" caption={`${recipes.length} active`}>
        {recipes.map((r) => (
          <ListRow
            key={r.id}
            primary={r.name}
            secondary={`${r.apply_to} · ${r.lines.length} ingredient line${r.lines.length === 1 ? "" : "s"}${
              r.notes ? ` · ${r.notes}` : ""
            }`}
            right={<span className="text-sm font-semibold text-action">Edit</span>}
            onClick={() => setModal(r)}
          />
        ))}
        {!recipes.length ? (
          <p className="border-t border-border px-4 py-3 text-caption">No recipes yet.</p>
        ) : null}
      </PanelCard>

      <Modal
        open={!!modal}
        title={modal === "create" ? "Create recipe" : "Edit recipe"}
        onClose={() => setModal(null)}
      >
        {modal ? (
          <RecipeForm
            items={items}
            initial={modal === "create" ? null : modal}
            onDone={() => {
              setModal(null);
              void load().catch(() => {});
            }}
            onDelete={
              modal !== "create"
                ? () => {
                    void remove(modal.id).then(() => setModal(null));
                  }
                : undefined
            }
            onError={setError}
          />
        ) : null}
      </Modal>
    </div>
  );
}

function RecipeForm({
  items,
  initial,
  onDone,
  onDelete,
  onError,
}: {
  items: StockItemDto[];
  initial: RecipeDto | null;
  onDone: () => void;
  onDelete?: () => void;
  onError: (s: string) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [applyTo, setApplyTo] = useState<RecipeApplyTo>(initial?.apply_to ?? "custom");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lines, setLines] = useState<LineDraft[]>(
    initial?.lines.map((l) => ({
      stock_item_id: l.stock_item_id,
      qty_per_serving: String(l.qty_per_serving),
      notes: l.notes ?? "",
    })) ?? [{ stock_item_id: items[0]?.id ?? "", qty_per_serving: "1", notes: "" }],
  );
  const [saving, setSaving] = useState(false);

  function addLine() {
    setLines((prev) => [
      ...prev,
      { stock_item_id: items[0]?.id ?? "", qty_per_serving: "1", notes: "" },
    ]);
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      onError("Name is required");
      return;
    }
    const payloadLines = lines
      .filter((l) => l.stock_item_id && Number(l.qty_per_serving) > 0)
      .map((l) => ({
        stock_item_id: l.stock_item_id,
        qty_per_serving: Number(l.qty_per_serving),
        notes: l.notes.trim() || null,
      }));
    setSaving(true);
    try {
      if (initial) {
        await apiFetch(`/api/recipes/${initial.id}`, {
          method: "PUT",
          body: JSON.stringify({
            name: name.trim(),
            apply_to: applyTo,
            notes: notes.trim() || null,
            lines: payloadLines,
          }),
        });
      } else {
        await apiFetch("/api/recipes", {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            apply_to: applyTo,
            notes: notes.trim() || null,
            lines: payloadLines,
          }),
        });
      }
      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const itemOpts = items.map((i) => ({
    value: i.id,
    label: `${i.name} (${i.unit})`,
  }));

  return (
    <form className="space-y-3" onSubmit={(e) => void submit(e)}>
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
      <Dropdown
        label="Applies to"
        value={applyTo}
        onChange={(v) => setApplyTo(v as RecipeApplyTo)}
        options={[
          { value: "maldivian", label: "Maldivian breakfast" },
          { value: "continental", label: "Continental breakfast" },
          { value: "room_extras", label: "Room extras" },
          { value: "custom", label: "Custom" },
        ]}
        searchable={false}
      />
      <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-label">Ingredient lines</p>
          <Button type="button" variant="secondary" onClick={addLine}>
            Add item
          </Button>
        </div>
        {lines.map((line, idx) => (
          <div key={idx} className="rounded-[var(--radius)] border border-border p-3 space-y-2">
            <Dropdown
              label="Stock item"
              value={line.stock_item_id}
              onChange={(v) =>
                setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, stock_item_id: v } : l)))
              }
              options={itemOpts}
            />
            <TextField
              label="Qty per serving"
              type="number"
              step="any"
              value={line.qty_per_serving}
              onChange={(e) =>
                setLines((prev) =>
                  prev.map((l, i) => (i === idx ? { ...l, qty_per_serving: e.target.value } : l)),
                )
              }
            />
            <TextField
              label="Line notes"
              value={line.notes}
              onChange={(e) =>
                setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, notes: e.target.value } : l)))
              }
            />
            <Button type="button" variant="secondary" onClick={() => removeLine(idx)}>
              Remove line
            </Button>
          </div>
        ))}
        {!items.length ? (
          <p className="text-caption">Add stock items first under Stock → Inventory.</p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="submit" disabled={saving || !items.length}>
          {saving ? "Saving…" : "Save recipe"}
        </Button>
        {onDelete ? (
          <Button type="button" variant="secondary" onClick={onDelete}>
            Delete recipe
          </Button>
        ) : null}
      </div>
    </form>
  );
}
