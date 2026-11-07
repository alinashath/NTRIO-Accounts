import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "@/api/http";
import { PageBackHeader } from "@/components/PageBackHeader";
import { SegmentedControl } from "@/components/design";
import { Dropdown } from "@/components/Dropdown";
import { SavingBanner, SkeletonFormPage } from "@/components/Skeleton";
import { Button, TextField } from "@/components/ui";
import type {
  MealMenuDto,
  MealMenuLineRole,
  RecipeDto,
  StockItemDto,
} from "../../../../shared/types";

export function MenuLineEditPage() {
  const { id: menuId, lineId } = useParams<{ id: string; lineId: string }>();
  const isNew = !lineId || lineId === "new";
  const navigate = useNavigate();

  const [menu, setMenu] = useState<MealMenuDto | null>(null);
  const [items, setItems] = useState<StockItemDto[]>([]);
  const [prepared, setPrepared] = useState<RecipeDto[]>([]);
  const [role, setRole] = useState<MealMenuLineRole>("base");
  const [mapKind, setMapKind] = useState<"stock" | "prepared">("prepared");
  const [displayName, setDisplayName] = useState("");
  const [stockItemId, setStockItemId] = useState("");
  const [componentRecipeId, setComponentRecipeId] = useState("");
  const [qty, setQty] = useState("1");
  const [choiceKey, setChoiceKey] = useState("");
  const [choiceLabel, setChoiceLabel] = useState("");
  const [showOnKot, setShowOnKot] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!menuId) return;
    setLoading(true);
    try {
      const [m, s, r] = await Promise.all([
        apiFetch<MealMenuDto>(`/api/menus/${menuId}`),
        apiFetch<{ items: StockItemDto[] }>("/api/stock/items?kind=all"),
        apiFetch<{ items: RecipeDto[] }>("/api/recipes"),
      ]);
      setMenu(m);
      setItems(s.items);
      const prep = r.items.filter((x) => x.kind === "prepared" || x.apply_to === "custom");
      setPrepared(prep);
      if (!isNew && lineId) {
        const line = m.lines.find((l) => l.id === lineId);
        if (line) {
          setRole(line.role);
          setDisplayName(line.display_name);
          setQty(String(line.qty_per_serving));
          setShowOnKot(line.show_on_kot !== false);
          setChoiceKey(line.choice_group_key ?? "");
          setChoiceLabel(line.choice_group_label ?? "");
          if (line.component_recipe_id) {
            setMapKind("prepared");
            setComponentRecipeId(line.component_recipe_id);
          } else {
            setMapKind("stock");
            setStockItemId(line.stock_item_id ?? "");
          }
        }
      } else {
        if (prep[0]) setComponentRecipeId(prep[0].id);
        if (s.items[0]) setStockItemId(s.items[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [menuId, lineId, isNew]);

  useEffect(() => {
    void load().catch((e) => {
      setError(e instanceof Error ? e.message : "Failed");
      setLoading(false);
    });
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!menu) return;
    if (!displayName.trim()) {
      setError("Display name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const thisLine = {
        role,
        choice_group_key: role === "choice" ? choiceKey.trim() || null : null,
        choice_group_label: role === "choice" ? choiceLabel.trim() || null : null,
        display_name: displayName.trim(),
        stock_item_id: mapKind === "stock" ? stockItemId : null,
        component_recipe_id: mapKind === "prepared" ? componentRecipeId : null,
        qty_per_serving: Number(qty) || 0,
        notes: null,
        show_on_kot: showOnKot,
        sort_order: isNew ? menu.lines.length * 10 : menu.lines.find((l) => l.id === lineId)?.sort_order ?? 0,
      };
      const others = menu.lines
        .filter((l) => (isNew ? true : l.id !== lineId))
        .map((x) => ({
          role: x.role,
          choice_group_key: x.choice_group_key,
          choice_group_label: x.choice_group_label,
          display_name: x.display_name,
          stock_item_id: x.stock_item_id,
          component_recipe_id: x.component_recipe_id,
          qty_per_serving: x.qty_per_serving,
          notes: x.notes,
          show_on_kot: x.show_on_kot,
          sort_order: x.sort_order,
        }));
      await apiFetch(`/api/menus/${menuId}`, {
        method: "PUT",
        body: JSON.stringify({ lines: [...others, thisLine] }),
      });
      navigate(`/kitchen/menus/${menuId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <SkeletonFormPage fields={5} />;

  return (
    <div className="flex flex-col gap-4">
      <PageBackHeader
        backTo={`/kitchen/menus/${menuId}`}
        title={isNew ? "Add menu line" : "Edit menu line"}
        caption="Map this line to a prepared recipe or a stock item. Qty is servings of that mapping."
      />
      <SavingBanner show={saving} />
      {error ? (
        <p className="rounded-[var(--radius)] border border-debit/30 bg-debit-bg px-3 py-2 text-sm text-debit-ink">
          {error}
        </p>
      ) : null}
      <form className={`space-y-3 ${saving ? "pointer-events-none opacity-70" : ""}`} onSubmit={(e) => void submit(e)}>
        <TextField
          label="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
        />
        <SegmentedControl
          aria-label="Role"
          value={role}
          onChange={setRole}
          options={[
            { value: "base", label: "Base" },
            { value: "option", label: "Option" },
            { value: "choice", label: "Choice" },
          ]}
        />
        {role === "choice" ? (
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Choice group key"
              value={choiceKey}
              onChange={(e) => setChoiceKey(e.target.value)}
              placeholder="egg_style"
            />
            <TextField
              label="Choice group label"
              value={choiceLabel}
              onChange={(e) => setChoiceLabel(e.target.value)}
              placeholder="Egg style"
            />
          </div>
        ) : null}
        <SegmentedControl
          aria-label="Maps to"
          value={mapKind}
          onChange={setMapKind}
          options={[
            { value: "prepared", label: "Prepared" },
            { value: "stock", label: "Stock" },
          ]}
        />
        {mapKind === "prepared" ? (
          <Dropdown
            label="Prepared recipe"
            value={componentRecipeId}
            onChange={setComponentRecipeId}
            options={
              prepared.length
                ? prepared.map((p) => ({ value: p.id, label: p.name }))
                : [{ value: "", label: "No prepared recipes" }]
            }
          />
        ) : (
          <Dropdown
            label="Stock item"
            value={stockItemId}
            onChange={setStockItemId}
            options={
              items.length
                ? items.map((i) => ({ value: i.id, label: `${i.name} (${i.unit})` }))
                : [{ value: "", label: "No stock items" }]
            }
          />
        )}
        <TextField
          label="Qty per serving"
          type="number"
          step="any"
          min="0"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
        <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={showOnKot}
            onChange={(e) => setShowOnKot(e.target.checked)}
          />
          Show on KOT
        </label>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save line"}
        </Button>
      </form>
    </div>
  );
}
