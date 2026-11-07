import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "@/api/http";
import { ListRow, PanelCard, SegmentedControl } from "@/components/design";
import { SkeletonListPage, SkeletonTableRows } from "@/components/Skeleton";
import { Button } from "@/components/ui";
import type { MealMenuDto, MealPeriod, RecipeDto, StockItemDto } from "../../../../shared/types";

type ConfigTab = "menus" | "prepared" | "addons";

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
      <span className={`text-sm font-semibold tabular-nums ${cost == null ? "text-muted" : "text-ink"}`}>
        {fmtCost(cost)}
      </span>
      {incomplete && cost != null ? (
        <span className="text-[11px] leading-tight text-muted">partial</span>
      ) : null}
    </div>
  );
}

export function KitchenRecipesPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<ConfigTab>("menus");
  const [menus, setMenus] = useState<MealMenuDto[]>([]);
  const [recipes, setRecipes] = useState<RecipeDto[]>([]);
  const [items, setItems] = useState<StockItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [m, r, s] = await Promise.all([
        apiFetch<{ items: MealMenuDto[] }>("/api/menus"),
        apiFetch<{ items: RecipeDto[] }>("/api/recipes"),
        apiFetch<{ items: StockItemDto[] }>("/api/stock/items?kind=all"),
      ]);
      setMenus(m.items);
      setRecipes(r.items);
      setItems(s.items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load().catch((e) => {
      setError(e instanceof Error ? e.message : "Failed");
      setLoading(false);
    });
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
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  if (loading && !menus.length && !recipes.length) {
    return <SkeletonListPage rows={6} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page-title text-ink">Menus &amp; recipes</h1>
          <p className="mt-1 text-caption">
            Open a menu or recipe to edit. Each ingredient opens on its own page — pick grams or cans.
            Stock is taken in the smallest unit.
          </p>
        </div>
        {tab === "menus" ? (
          <Button type="button" className="gap-2" onClick={() => navigate("/kitchen/menus/new")}>
            <Plus className="h-4 w-4" aria-hidden />
            Create menu
          </Button>
        ) : (
          <Button
            type="button"
            className="gap-2"
            onClick={() =>
              navigate(
                tab === "prepared" ? "/kitchen/recipes/new?kind=prepared" : "/kitchen/recipes/new?kind=addons",
              )
            }
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

      {loading ? (
        <PanelCard title="Loading">
          <SkeletonTableRows rows={5} />
        </PanelCard>
      ) : null}

      {!loading && !items.length ? (
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

      {!loading && tab === "menus"
        ? menusByPeriod.map((group) => (
            <PanelCard
              key={group.period}
              title={group.label}
              caption={`${group.items.length} menu${group.items.length === 1 ? "" : "s"}`}
            >
              {!group.items.length ? (
                <p className="border-t border-border px-4 py-3 text-caption">
                  No menus yet for {group.label.toLowerCase()}.
                </p>
              ) : (
                group.items.map((m) => (
                  <ListRow
                    key={m.id}
                    primary={m.name}
                    secondary={
                      m.lines.length
                        ? `${m.lines.length} line${m.lines.length === 1 ? "" : "s"}`
                        : "No lines yet"
                    }
                    href={`/kitchen/menus/${m.id}`}
                    right={
                      <div className="flex items-center gap-2">
                        <CostCell cost={m.estimated_cost} incomplete={m.cost_incomplete} />
                        <button
                          type="button"
                          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm text-debit hover:bg-debit-bg"
                          aria-label={`Delete ${m.name}`}
                          onClick={(e) => {
                            e.preventDefault();
                            void removeMenu(m.id, m.name);
                          }}
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                        </button>
                      </div>
                    }
                  />
                ))
              )}
            </PanelCard>
          ))
        : null}

      {!loading && (tab === "prepared" || tab === "addons") ? (
        <PanelCard
          title={tab === "prepared" ? "Prepared items" : "Shared add-ons"}
          caption="Tap a row to edit. Ingredients open one at a time."
        >
          {(tab === "prepared" ? prepared : addons).map((r) => (
            <ListRow
              key={r.id}
              primary={r.name}
              secondary={
                r.lines.length
                  ? r.lines
                      .map((l) => {
                        const qty = l.input_qty ?? l.qty_per_serving;
                        const unit = l.input_unit ?? l.stock_item_unit;
                        return `${l.stock_item_name} ${qty}${unit ? ` ${unit}` : ""}`;
                      })
                      .join(" · ")
                  : "No ingredients"
              }
              href={`/kitchen/recipes/${r.id}`}
              right={
                <div className="flex items-center gap-2">
                  <CostCell cost={r.estimated_cost} incomplete={r.cost_incomplete} />
                  <button
                    type="button"
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm text-debit hover:bg-debit-bg"
                    onClick={(e) => {
                      e.preventDefault();
                      void removeRecipe(r.id, r.name);
                    }}
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                  </button>
                </div>
              }
            />
          ))}
          {!(tab === "prepared" ? prepared : addons).length ? (
            <p className="border-t border-border px-4 py-3 text-caption">Nothing here yet.</p>
          ) : null}
        </PanelCard>
      ) : null}
    </div>
  );
}
