import { Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "@/api/http";
import { ListRow, PanelCard, SegmentedControl } from "@/components/design";
import { Dropdown } from "@/components/Dropdown";
import { Modal } from "@/components/Modal";
import { Button, TextField } from "@/components/ui";
import type {
  MealMenuDto,
  MealMenuLineRole,
  MealPeriod,
  RecipeDto,
  StockItemDto,
} from "../../../../shared/types";

type ConfigTab = "menus" | "prepared" | "addons";

type MenuLineDraft = {
  role: MealMenuLineRole;
  choice_group_key: string;
  choice_group_label: string;
  display_name: string;
  map_kind: "stock" | "prepared";
  stock_item_id: string;
  component_recipe_id: string;
  qty_per_serving: string;
  notes: string;
  show_on_kot: boolean;
  sort_order: number;
};

type RecipeLineDraft = {
  stock_item_id: string;
  qty_per_serving: string;
  notes: string;
  show_on_kot: boolean;
};

const PERIOD_LABEL: Record<MealPeriod, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

function fmtCost(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(2);
}

function CostCell({
  cost,
  incomplete,
}: {
  cost: number | null | undefined;
  incomplete?: boolean;
}) {
  return (
    <div className="flex w-[5.5rem] shrink-0 flex-col items-end justify-center">
      <span
        className={`text-sm font-semibold tabular-nums ${
          cost == null ? "text-muted" : "text-ink"
        }`}
      >
        {fmtCost(cost)}
      </span>
      {incomplete && cost != null ? (
        <span className="text-[11px] leading-tight text-muted">partial</span>
      ) : null}
    </div>
  );
}

function ListColumnHeader({ nameLabel = "Name" }: { nameLabel?: string }) {
  return (
    <div className="flex items-center gap-3 border-t border-border bg-surface-elevated px-4 py-2">
      <p className="min-w-0 flex-1 text-label">{nameLabel}</p>
      <p className="w-[5.5rem] shrink-0 text-right text-label">Cost</p>
      <p className="w-[5.75rem] shrink-0 text-right text-label"> </p>
    </div>
  );
}

export function KitchenRecipesPage() {
  const [tab, setTab] = useState<ConfigTab>("menus");
  const [menus, setMenus] = useState<MealMenuDto[]>([]);
  const [recipes, setRecipes] = useState<RecipeDto[]>([]);
  const [items, setItems] = useState<StockItemDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [menuModal, setMenuModal] = useState<"create" | MealMenuDto | null>(null);
  const [recipeModal, setRecipeModal] = useState<"create-prepared" | "create-addons" | RecipeDto | null>(
    null,
  );

  const load = useCallback(async () => {
    const [m, r, s] = await Promise.all([
      apiFetch<{ items: MealMenuDto[] }>("/api/menus"),
      apiFetch<{ items: RecipeDto[] }>("/api/recipes"),
      apiFetch<{ items: StockItemDto[] }>("/api/stock/items?kind=all"),
    ]);
    setMenus(m.items);
    setRecipes(r.items);
    setItems(s.items);
  }, []);

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [load]);

  const prepared = useMemo(
    () => recipes.filter((r) => r.kind === "prepared" || r.apply_to === "custom"),
    [recipes],
  );
  const addons = useMemo(
    () => recipes.filter((r) => r.kind === "addons" || r.apply_to === "room_extras"),
    [recipes],
  );

  const menusByPeriod = useMemo(() => {
    const periods: MealPeriod[] = ["breakfast", "lunch", "dinner"];
    return periods.map((p) => ({
      period: p,
      label: PERIOD_LABEL[p],
      items: menus.filter((m) => m.meal_period === p),
    }));
  }, [menus]);

  async function removeMenu(id: string, name: string) {
    if (!confirm(`Deactivate menu “${name}”?`)) return;
    try {
      await apiFetch(`/api/menus/${id}`, { method: "DELETE" });
      setMsg(`Deactivated “${name}”`);
      setMenuModal(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  async function removeRecipe(id: string, name: string) {
    if (!confirm(`Delete “${name}”?`)) return;
    try {
      await apiFetch(`/api/recipes/${id}`, { method: "DELETE" });
      setMsg(`Deleted “${name}”`);
      setRecipeModal(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page-title text-ink">Menus &amp; recipes</h1>
          <p className="mt-1 text-caption">
            Configure meal menus (base, options, choices), prepared items with stock recipes, and shared
            add-ons.
          </p>
        </div>
        {tab === "menus" ? (
          <Button type="button" className="gap-2" onClick={() => setMenuModal("create")}>
            <Plus className="h-4 w-4" aria-hidden />
            Create menu
          </Button>
        ) : (
          <Button
            type="button"
            className="gap-2"
            onClick={() => setRecipeModal(tab === "prepared" ? "create-prepared" : "create-addons")}
          >
            <Plus className="h-4 w-4" aria-hidden />
            {tab === "prepared" ? "Create prepared item" : "Create add-ons recipe"}
          </Button>
        )}
      </div>

      <SegmentedControl
        aria-label="Config section"
        value={tab}
        onChange={(v) => setTab(v as ConfigTab)}
        options={[
          { value: "menus", label: "Meal menus" },
          { value: "prepared", label: "Prepared" },
          { value: "addons", label: "Add-ons" },
        ]}
      />

      {error ? <p className="text-sm font-medium text-debit">{error}</p> : null}
      {msg ? <p className="text-sm font-medium text-credit">{msg}</p> : null}

      {!items.length ? (
        <PanelCard title="Stock items required">
          <p className="border-t border-border px-4 py-3 text-caption">
            Add stock items first, then map menu lines and prepared recipes to them.
          </p>
          <div className="border-t border-border px-4 py-3">
            <Link
              to="/stock"
              className="inline-flex h-input min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-action px-4 text-sm font-semibold text-[var(--on-primary)]"
            >
              Open Inventory
            </Link>
          </div>
        </PanelCard>
      ) : null}

      {tab === "menus"
        ? menusByPeriod.map((group) => (
            <PanelCard
              key={group.period}
              title={group.label}
              caption={`${group.items.length} menu${
                group.items.length === 1 ? "" : "s"
              } · Cost = base + avg choices (from stock unit prices)`}
            >
              {!group.items.length ? (
                <p className="border-t border-border px-4 py-3 text-caption">
                  No menus yet for {group.label.toLowerCase()}. Create one to take guest orders.
                </p>
              ) : (
                <>
                  <ListColumnHeader nameLabel="Menu" />
                  {group.items.map((m) => (
                    <ListRow
                      key={m.id}
                      primary={m.name}
                      secondary={
                        m.lines.length
                          ? m.lines
                              .map(
                                (l) =>
                                  `${l.display_name} → ${l.mapping} (${l.role})${
                                    l.estimated_cost != null ? ` · ${fmtCost(l.estimated_cost)}` : ""
                                  }`,
                              )
                              .join(" · ")
                          : "No lines — add base, options, or choices"
                      }
                      right={
                        <div className="flex items-center gap-2">
                          <CostCell cost={m.estimated_cost} incomplete={m.cost_incomplete} />
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              className="inline-flex min-h-11 items-center gap-1.5 rounded-sm px-2 text-sm font-semibold text-action hover:bg-neutral-bg"
                              aria-label={`Edit ${m.name}`}
                              onClick={() => setMenuModal(m)}
                            >
                              <Pencil className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                              Edit
                            </button>
                            <button
                              type="button"
                              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm text-debit hover:bg-debit-bg"
                              aria-label={`Delete ${m.name}`}
                              onClick={() => void removeMenu(m.id, m.name)}
                            >
                              <Trash2 className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                            </button>
                          </div>
                        </div>
                      }
                    />
                  ))}
                </>
              )}
            </PanelCard>
          ))
        : null}

      {tab === "prepared" || tab === "addons" ? (
        <PanelCard
          title={tab === "prepared" ? "Prepared items" : "Shared add-ons"}
          caption={
            tab === "prepared"
              ? "BOM recipes · Cost column from ingredient unit prices"
              : "Choosable extras · Cost column from ingredient unit prices"
          }
        >
          {(tab === "prepared" ? prepared : addons).length ? (
            <ListColumnHeader nameLabel={tab === "prepared" ? "Prepared item" : "Add-on"} />
          ) : null}
          {(tab === "prepared" ? prepared : addons).map((r) => (
            <ListRow
              key={r.id}
              primary={r.name}
              secondary={
                r.lines.length
                  ? r.lines
                      .map(
                        (l) =>
                          `${l.stock_item_name} ${l.qty_per_serving}${
                            l.stock_item_unit ? ` ${l.stock_item_unit}` : ""
                          }${l.estimated_cost != null ? ` · ${fmtCost(l.estimated_cost)}` : ""}`,
                      )
                      .join(" · ")
                  : "No ingredients"
              }
              right={
                <div className="flex items-center gap-2">
                  <CostCell cost={r.estimated_cost} incomplete={r.cost_incomplete} />
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-sm px-2 text-sm font-semibold text-action hover:bg-neutral-bg"
                      onClick={() => setRecipeModal(r)}
                    >
                      <Pencil className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                      Edit
                    </button>
                    <button
                      type="button"
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm text-debit hover:bg-debit-bg"
                      onClick={() => void removeRecipe(r.id, r.name)}
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                    </button>
                  </div>
                </div>
              }
            />
          ))}
          {!(tab === "prepared" ? prepared : addons).length ? (
            <p className="border-t border-border px-4 py-3 text-caption">Nothing here yet.</p>
          ) : null}
        </PanelCard>
      ) : null}

      <Modal
        open={!!menuModal}
        title={menuModal === "create" ? "Create meal menu" : "Edit meal menu"}
        onClose={() => setMenuModal(null)}
        size="lg"
      >
        {menuModal ? (
          <MenuForm
            items={items}
            prepared={prepared}
            initial={menuModal === "create" ? null : menuModal}
            onDone={(name) => {
              setMenuModal(null);
              setMsg(name ? `Saved “${name}”` : "Menu saved");
              void load().catch(() => {});
            }}
            onDelete={
              menuModal !== "create"
                ? () => {
                    void removeMenu(menuModal.id, menuModal.name);
                  }
                : undefined
            }
            onError={setError}
          />
        ) : null}
      </Modal>

      <Modal
        open={!!recipeModal}
        title={
          recipeModal === "create-prepared"
            ? "Create prepared item"
            : recipeModal === "create-addons"
              ? "Create add-ons recipe"
              : "Edit recipe"
        }
        onClose={() => setRecipeModal(null)}
        size="lg"
      >
        {recipeModal ? (
          <PreparedForm
            items={items}
            mode={
              recipeModal === "create-prepared"
                ? "prepared"
                : recipeModal === "create-addons"
                  ? "addons"
                  : recipeModal.kind === "addons" || recipeModal.apply_to === "room_extras"
                    ? "addons"
                    : "prepared"
            }
            initial={
              recipeModal === "create-prepared" || recipeModal === "create-addons" ? null : recipeModal
            }
            onDone={(name) => {
              setRecipeModal(null);
              setMsg(name ? `Saved “${name}”` : "Recipe saved");
              void load().catch(() => {});
            }}
            onDelete={
              typeof recipeModal === "object"
                ? () => {
                    void removeRecipe(recipeModal.id, recipeModal.name);
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

function MenuForm({
  items,
  prepared,
  initial,
  onDone,
  onDelete,
  onError,
}: {
  items: StockItemDto[];
  prepared: RecipeDto[];
  initial: MealMenuDto | null;
  onDone: (name?: string) => void;
  onDelete?: () => void;
  onError: (s: string) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [mealPeriod, setMealPeriod] = useState<MealPeriod>(initial?.meal_period ?? "breakfast");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lines, setLines] = useState<MenuLineDraft[]>(
    initial?.lines.map((l, i) => ({
      role: l.role,
      choice_group_key: l.choice_group_key ?? "egg_style",
      choice_group_label: l.choice_group_label ?? "Egg style",
      display_name: l.display_name,
      map_kind: l.component_recipe_id ? "prepared" : "stock",
      stock_item_id: l.stock_item_id ?? items[0]?.id ?? "",
      component_recipe_id: l.component_recipe_id ?? prepared[0]?.id ?? "",
      qty_per_serving: String(l.qty_per_serving),
      notes: l.notes ?? "",
      show_on_kot: l.show_on_kot,
      sort_order: l.sort_order ?? i,
    })) ?? [
      {
        role: "base",
        choice_group_key: "egg_style",
        choice_group_label: "Egg style",
        display_name: items[0]?.name ?? "",
        map_kind: "stock",
        stock_item_id: items[0]?.id ?? "",
        component_recipe_id: prepared[0]?.id ?? "",
        qty_per_serving: "1",
        notes: "",
        show_on_kot: true,
        sort_order: 0,
      },
    ],
  );
  const [saving, setSaving] = useState(false);

  function addLine() {
    setLines((prev) => [
      ...prev,
      {
        role: "option",
        choice_group_key: "egg_style",
        choice_group_label: "Egg style",
        display_name: items[0]?.name ?? "",
        map_kind: "stock" as const,
        stock_item_id: items[0]?.id ?? "",
        component_recipe_id: prepared[0]?.id ?? "",
        qty_per_serving: "1",
        notes: "",
        show_on_kot: true,
        sort_order: prev.length,
      },
    ]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      onError("Name is required");
      return;
    }
    const payloadLines = lines
      .filter((l) => l.display_name.trim() && Number(l.qty_per_serving) >= 0)
      .map((l, i) => ({
        role: l.role,
        choice_group_key: l.role === "choice" ? l.choice_group_key.trim() || "choice" : null,
        choice_group_label: l.role === "choice" ? l.choice_group_label.trim() || "Choice" : null,
        display_name: l.display_name.trim(),
        stock_item_id: l.map_kind === "stock" ? l.stock_item_id : null,
        component_recipe_id: l.map_kind === "prepared" ? l.component_recipe_id : null,
        qty_per_serving: Number(l.qty_per_serving),
        notes: l.notes.trim() || null,
        show_on_kot: l.show_on_kot,
        sort_order: i,
      }));
    if (!payloadLines.length) {
      onError("Add at least one line");
      return;
    }
    if (payloadLines.some((l) => !l.stock_item_id && !l.component_recipe_id)) {
      onError("Each line must map to stock or a prepared recipe");
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        meal_period: mealPeriod,
        notes: notes.trim() || null,
        lines: payloadLines,
      };
      if (initial) {
        await apiFetch(`/api/menus/${initial.id}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await apiFetch("/api/menus", { method: "POST", body: JSON.stringify(body) });
      }
      onDone(name.trim());
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const stockOpts = items.map((i) => ({ value: i.id, label: `${i.name} (${i.unit})` }));
  const prepOpts = prepared.map((r) => ({ value: r.id, label: r.name }));

  return (
    <form className="space-y-3" onSubmit={(e) => void submit(e)}>
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
      <Dropdown
        label="Meal period"
        value={mealPeriod}
        onChange={(v) => setMealPeriod(v as MealPeriod)}
        options={[
          { value: "breakfast", label: "Breakfast" },
          { value: "lunch", label: "Lunch" },
          { value: "dinner", label: "Dinner" },
        ]}
        searchable={false}
      />
      <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-label">Menu lines</p>
          <Button type="button" variant="secondary" className="gap-2" onClick={addLine}>
            <Plus className="h-4 w-4" aria-hidden />
            Add line
          </Button>
        </div>
        <p className="text-caption">
          Base = always included. Option = multi-select on order. Choice = pick one from a group.
        </p>
        {lines.map((line, idx) => (
          <div key={idx} className="rounded-[var(--radius)] border border-border p-3 space-y-2">
            <TextField
              label="Display name"
              value={line.display_name}
              onChange={(e) =>
                setLines((prev) =>
                  prev.map((l, i) => (i === idx ? { ...l, display_name: e.target.value } : l)),
                )
              }
              required
            />
            <Dropdown
              label="Role"
              value={line.role}
              onChange={(v) =>
                setLines((prev) =>
                  prev.map((l, i) => (i === idx ? { ...l, role: v as MealMenuLineRole } : l)),
                )
              }
              options={[
                { value: "base", label: "Base (always included)" },
                { value: "option", label: "Option / side (multi)" },
                { value: "choice", label: "Choice (pick one)" },
              ]}
              searchable={false}
            />
            {line.role === "choice" ? (
              <>
                <TextField
                  label="Choice group key"
                  value={line.choice_group_key}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l, i) =>
                        i === idx ? { ...l, choice_group_key: e.target.value } : l,
                      ),
                    )
                  }
                  placeholder="egg_style"
                />
                <TextField
                  label="Choice group label"
                  value={line.choice_group_label}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l, i) =>
                        i === idx ? { ...l, choice_group_label: e.target.value } : l,
                      ),
                    )
                  }
                  placeholder="Egg style"
                />
              </>
            ) : null}
            <Dropdown
              label="Maps to"
              value={line.map_kind}
              onChange={(v) =>
                setLines((prev) =>
                  prev.map((l, i) =>
                    i === idx ? { ...l, map_kind: v as "stock" | "prepared" } : l,
                  ),
                )
              }
              options={[
                { value: "stock", label: "Stock item" },
                { value: "prepared", label: "Prepared recipe" },
              ]}
              searchable={false}
            />
            {line.map_kind === "stock" ? (
              <Dropdown
                label="Stock item"
                value={line.stock_item_id}
                onChange={(v) => {
                  const item = items.find((i) => i.id === v);
                  setLines((prev) =>
                    prev.map((l, i) =>
                      i === idx
                        ? {
                            ...l,
                            stock_item_id: v,
                            display_name: l.display_name || item?.name || "",
                          }
                        : l,
                    ),
                  );
                }}
                options={stockOpts}
              />
            ) : (
              <Dropdown
                label="Prepared recipe"
                value={line.component_recipe_id}
                onChange={(v) => {
                  const r = prepared.find((p) => p.id === v);
                  setLines((prev) =>
                    prev.map((l, i) =>
                      i === idx
                        ? {
                            ...l,
                            component_recipe_id: v,
                            display_name: l.display_name || r?.name || "",
                          }
                        : l,
                    ),
                  );
                }}
                options={
                  prepOpts.length
                    ? prepOpts
                    : [{ value: "", label: "Create a prepared item first" }]
                }
              />
            )}
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
              Show on KOT
            </label>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
            >
              Remove line
            </Button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="submit" disabled={saving || !items.length}>
          {saving ? "Saving…" : initial ? "Save changes" : "Create menu"}
        </Button>
        {onDelete ? (
          <Button type="button" variant="secondary" disabled={saving} onClick={onDelete}>
            Deactivate
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function PreparedForm({
  items,
  mode,
  initial,
  onDone,
  onDelete,
  onError,
}: {
  items: StockItemDto[];
  mode: "prepared" | "addons";
  initial: RecipeDto | null;
  onDone: (name?: string) => void;
  onDelete?: () => void;
  onError: (s: string) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lines, setLines] = useState<RecipeLineDraft[]>(
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
        is_option: false,
      }));
    if (!payloadLines.length) {
      onError("Add at least one stock ingredient");
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        apply_to: mode === "addons" ? "room_extras" : "custom",
        kind: mode === "addons" ? "addons" : "prepared",
        notes: notes.trim() || null,
        lines: payloadLines,
      };
      if (initial) {
        await apiFetch(`/api/recipes/${initial.id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch("/api/recipes", { method: "POST", body: JSON.stringify(body) });
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
    label:
      i.last_unit_cost != null
        ? `${i.name} (${i.unit}) · @ ${fmtCost(i.last_unit_cost)}`
        : `${i.name} (${i.unit})`,
  }));

  const draftCosts = lines.map((line) => {
    const item = items.find((i) => i.id === line.stock_item_id);
    const qty = Number(line.qty_per_serving);
    if (!item || !(qty > 0) || item.last_unit_cost == null) {
      return { cost: null as number | null, incomplete: qty > 0 };
    }
    return {
      cost: Math.round(qty * item.last_unit_cost * 100) / 100,
      incomplete: false,
    };
  });
  const draftTotal = draftCosts.every((c) => c.cost == null)
    ? null
    : Math.round(
        draftCosts.reduce((s, c) => s + (c.cost ?? 0), 0) * 100,
      ) / 100;
  const draftIncomplete = draftCosts.some((c) => c.incomplete || c.cost == null);

  return (
    <form className="space-y-3" onSubmit={(e) => void submit(e)}>
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
      <p className="text-caption">
        {mode === "prepared"
          ? "Ingredient BOM. When a menu line maps to this recipe, stock is deducted from these lines."
          : "Items choosable as add-ons on guest orders and room extras."}
      </p>
      <div className="flex items-baseline justify-between gap-3 rounded-[var(--radius)] border border-border px-3 py-2">
        <p className="text-label">Cost</p>
        <p className="text-sm font-semibold tabular-nums text-ink">
          {fmtCost(draftTotal)}
          {draftIncomplete && draftTotal != null ? (
            <span className="ml-1 text-caption font-normal">partial</span>
          ) : null}
        </p>
      </div>
      <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-label">Ingredients</p>
          <Button
            type="button"
            variant="secondary"
            className="gap-2"
            onClick={() =>
              setLines((prev) => [
                ...prev,
                {
                  stock_item_id: items[0]?.id ?? "",
                  qty_per_serving: "1",
                  notes: "",
                  show_on_kot: true,
                },
              ])
            }
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add
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
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label="Qty"
                type="number"
                step="any"
                value={line.qty_per_serving}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((l, i) => (i === idx ? { ...l, qty_per_serving: e.target.value } : l)),
                  )
                }
              />
              <div className="flex flex-col justify-end">
                <p className="text-label">Cost</p>
                <p className="min-h-11 flex items-center text-sm font-semibold tabular-nums text-ink">
                  {fmtCost(draftCosts[idx]?.cost)}
                </p>
              </div>
            </div>
            {mode === "addons" ? (
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
            ) : null}
            <Button
              type="button"
              variant="secondary"
              onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
            >
              Remove
            </Button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="submit" disabled={saving || !items.length}>
          {saving ? "Saving…" : initial ? "Save changes" : "Create"}
        </Button>
        {onDelete ? (
          <Button type="button" variant="secondary" disabled={saving} onClick={onDelete}>
            Delete
          </Button>
        ) : null}
      </div>
    </form>
  );
}
