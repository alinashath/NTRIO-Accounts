import { Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "@/api/http";
import { ListRow, PanelCard } from "@/components/design";
import { Dropdown } from "@/components/Dropdown";
import { Modal } from "@/components/Modal";
import { Button, TextField } from "@/components/ui";
import type { RecipeApplyTo, RecipeDto, StockItemDto } from "../../../../shared/types";

type LineDraft = {
  stock_item_id: string;
  qty_per_serving: string;
  notes: string;
  show_on_kot: boolean;
};

const APPLY_LABEL: Record<RecipeApplyTo, string> = {
  maldivian: "Maldivian breakfast",
  continental: "Continental breakfast",
  room_extras: "Room extras",
  custom: "Custom",
};

const APPLY_ORDER: RecipeApplyTo[] = ["maldivian", "continental", "room_extras", "custom"];

export function KitchenRecipesPage() {
  const [recipes, setRecipes] = useState<RecipeDto[]>([]);
  const [items, setItems] = useState<StockItemDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
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

  async function remove(id: string, name: string) {
    if (!confirm(`Delete recipe “${name}”? This removes its ingredient lines.`)) return;
    try {
      await apiFetch(`/api/recipes/${id}`, { method: "DELETE" });
      setMsg(`Deleted “${name}”`);
      setModal(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<RecipeApplyTo, RecipeDto[]>();
    for (const key of APPLY_ORDER) map.set(key, []);
    for (const r of recipes) {
      const list = map.get(r.apply_to) ?? [];
      list.push(r);
      map.set(r.apply_to, list);
    }
    return APPLY_ORDER.map((key) => ({ key, label: APPLY_LABEL[key], items: map.get(key) ?? [] })).filter(
      (g) => g.items.length > 0,
    );
  }, [recipes]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page-title text-ink">Recipes</h1>
          <p className="mt-1 text-caption">
            Configure what stock each breakfast uses. Edit Maldivian / Continental recipes to add or remove
            ingredients — shopping list and inventory Used follow these lines.
          </p>
        </div>
        <Button type="button" className="gap-2" onClick={() => setModal("create")}>
          <Plus className="h-4 w-4" aria-hidden />
          Create recipe
        </Button>
      </div>

      {error ? <p className="text-sm font-medium text-debit">{error}</p> : null}
      {msg ? <p className="text-sm font-medium text-credit">{msg}</p> : null}

      {!items.length ? (
        <PanelCard title="Stock items required">
          <p className="border-t border-border px-4 py-3 text-caption">
            Add stock items first, then attach them as recipe ingredients.
          </p>
          <div className="border-t border-border px-4 py-3">
            <Link
              to="/stock"
              className="inline-flex h-input min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-action px-4 text-sm font-semibold text-[var(--on-primary)]"
            >
              Open Inventory — Add stock item
            </Link>
          </div>
        </PanelCard>
      ) : null}

      {!recipes.length ? (
        <PanelCard title="No recipes yet" caption="Create Maldivian or Continental to set breakfast ingredients">
          <div className="border-t border-border px-4 py-3 flex flex-wrap gap-2">
            <Button type="button" className="gap-2" onClick={() => setModal("create")}>
              <Plus className="h-4 w-4" aria-hidden />
              Create first recipe
            </Button>
          </div>
        </PanelCard>
      ) : (
        grouped.map((group) => (
          <PanelCard
            key={group.key}
            title={group.label}
            caption={`${group.items.length} recipe${group.items.length === 1 ? "" : "s"} · tap Edit to change items`}
          >
            {group.items.map((r) => (
              <ListRow
                key={r.id}
                primary={r.name}
                secondary={
                  r.lines.length
                    ? r.lines
                        .map((l) => `${l.stock_item_name} ${l.qty_per_serving}${l.stock_item_unit ? ` ${l.stock_item_unit}` : ""}`)
                        .join(" · ")
                    : "No ingredient lines — add items"
                }
                right={
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-sm px-2 text-sm font-semibold text-action hover:bg-neutral-bg"
                      aria-label={`Edit ${r.name}`}
                      onClick={() => setModal(r)}
                    >
                      <Pencil className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                      Edit
                    </button>
                    <button
                      type="button"
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm text-debit hover:bg-debit-bg"
                      aria-label={`Delete ${r.name}`}
                      onClick={() => void remove(r.id, r.name)}
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                    </button>
                  </div>
                }
              />
            ))}
          </PanelCard>
        ))
      )}

      <Modal
        open={!!modal}
        title={modal === "create" ? "Create recipe" : "Edit recipe"}
        onClose={() => setModal(null)}
        size="lg"
      >
        {modal ? (
          <RecipeForm
            items={items}
            initial={modal === "create" ? null : modal}
            onDone={(name) => {
              setModal(null);
              setMsg(name ? `Saved “${name}”` : "Recipe saved");
              void load().catch(() => {});
            }}
            onDelete={
              modal !== "create"
                ? () => {
                    void remove(modal.id, modal.name);
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
  onDone: (name?: string) => void;
  onDelete?: () => void;
  onError: (s: string) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [applyTo, setApplyTo] = useState<RecipeApplyTo>(initial?.apply_to ?? "maldivian");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lines, setLines] = useState<LineDraft[]>(
    initial?.lines.map((l) => ({
      stock_item_id: l.stock_item_id,
      qty_per_serving: String(l.qty_per_serving),
      notes: l.notes ?? "",
      show_on_kot: l.show_on_kot !== false,
    })) ?? [
      {
        stock_item_id: items[0]?.id ?? "",
        qty_per_serving: "1",
        notes: "",
        show_on_kot: true,
      },
    ],
  );
  const [saving, setSaving] = useState(false);

  function addLine() {
    setLines((prev) => [
      ...prev,
      {
        stock_item_id: items[0]?.id ?? "",
        qty_per_serving: "1",
        notes: "",
        show_on_kot: true,
      },
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
        show_on_kot: l.show_on_kot,
      }));
    if (!payloadLines.length) {
      onError("Add at least one stock item with quantity greater than 0");
      return;
    }
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
      onDone(name.trim());
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
        label="Applies to breakfast type"
        value={applyTo}
        onChange={(v) => setApplyTo(v as RecipeApplyTo)}
        options={[
          { value: "maldivian", label: "Maldivian breakfast" },
          { value: "continental", label: "Continental breakfast" },
          { value: "room_extras", label: "Room extras (choosable on orders)" },
          { value: "custom", label: "Custom" },
        ]}
        searchable={false}
      />
      <p className="text-caption">
        {applyTo === "room_extras"
          ? "These items become the choosable extras on Breakfast orders. Turn on Show on KOT for lines that kitchen should see on the plan."
          : "Qty is per guest / serving. Saving updates shopping and inventory when breakfast orders use this type."}
      </p>
      <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-label">
            {applyTo === "room_extras" ? "Optional extra items" : "Ingredient items"}
          </p>
          <Button type="button" variant="secondary" className="gap-2" onClick={addLine} disabled={!items.length}>
            <Plus className="h-4 w-4" aria-hidden />
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
              label={applyTo === "room_extras" ? "Qty when selected" : "Qty per serving"}
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
            <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={line.show_on_kot}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((l, i) => (i === idx ? { ...l, show_on_kot: e.target.checked } : l)),
                  )
                }
              />
              Show on KOT when selected
            </label>
            <Button type="button" variant="secondary" onClick={() => removeLine(idx)}>
              Remove item
            </Button>
          </div>
        ))}
        {!items.length ? (
          <p className="text-caption">
            No stock items.{" "}
            <Link to="/stock" className="font-semibold text-action underline">
              Add items in Inventory
            </Link>
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="submit" disabled={saving || !items.length}>
          {saving ? "Saving…" : initial ? "Save changes" : "Create recipe"}
        </Button>
        {onDelete ? (
          <Button type="button" variant="secondary" disabled={saving} onClick={onDelete}>
            Delete recipe
          </Button>
        ) : null}
      </div>
    </form>
  );
}
