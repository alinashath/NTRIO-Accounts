import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "@/api/http";
import { PageBackHeader } from "@/components/PageBackHeader";
import { ListRow, PanelCard, SegmentedControl } from "@/components/design";
import { SavingBanner, SkeletonFormPage } from "@/components/Skeleton";
import { Button, TextField } from "@/components/ui";
import type { MealMenuDto, MealPeriod } from "../../../../shared/types";

export function MenuEditPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === "new";
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [mealPeriod, setMealPeriod] = useState<MealPeriod>("breakfast");
  const [notes, setNotes] = useState("");
  const [menu, setMenu] = useState<MealMenuDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(isNew);

  const load = useCallback(async () => {
    if (isNew || !id) return;
    const m = await apiFetch<MealMenuDto>(`/api/menus/${id}`);
    setMenu(m);
    setName(m.name);
    setMealPeriod(m.meal_period);
    setNotes(m.notes ?? "");
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
        const created = await apiFetch<MealMenuDto>("/api/menus", {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            meal_period: mealPeriod,
            notes: notes.trim() || null,
            lines: [],
          }),
        });
        navigate(`/kitchen/menus/${created.id}`, { replace: true });
      } else {
        await apiFetch(`/api/menus/${id}`, {
          method: "PUT",
          body: JSON.stringify({
            name: name.trim(),
            meal_period: mealPeriod,
            notes: notes.trim() || null,
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
    if (!confirm(`Deactivate menu “${name}”?`)) return;
    try {
      await apiFetch(`/api/menus/${id}`, { method: "DELETE" });
      navigate("/kitchen/recipes", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  if (!loaded && !isNew) return <SkeletonFormPage fields={4} />;

  return (
    <div className="flex flex-col gap-4">
      <PageBackHeader
        backTo="/kitchen/recipes"
        title={isNew ? "Create meal menu" : name || "Edit menu"}
        caption="Menu lines open one at a time. Base items are always included; options and choices are selected on the order."
      />
      <SavingBanner show={saving} />
      {error ? (
        <p className="rounded-[var(--radius)] border border-debit/30 bg-debit-bg px-3 py-2 text-sm text-debit-ink">
          {error}
        </p>
      ) : null}

      <form className={`space-y-3 ${saving ? "pointer-events-none opacity-70" : ""}`} onSubmit={(e) => void saveMeta(e)}>
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <SegmentedControl
          aria-label="Meal period"
          value={mealPeriod}
          onChange={setMealPeriod}
          options={[
            { value: "breakfast", label: "Breakfast" },
            { value: "lunch", label: "Lunch" },
            { value: "dinner", label: "Dinner" },
          ]}
        />
        <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : isNew ? "Create & add lines" : "Save details"}
          </Button>
          {!isNew ? (
            <Button type="button" variant="secondary" onClick={() => void remove()}>
              Deactivate
            </Button>
          ) : null}
        </div>
      </form>

      {!isNew && menu ? (
        <PanelCard
          title="Menu lines"
          headerRight={
            <Link
              to={`/kitchen/menus/${id}/lines/new`}
              className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-action"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add
            </Link>
          }
        >
          {menu.lines.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted">No lines yet.</p>
          ) : (
            <ul>
              {menu.lines.map((l) => (
                <ListRow
                  key={l.id}
                  primary={l.display_name}
                  secondary={`${l.role} · ${l.mapping} · qty ${l.qty_per_serving}`}
                  href={`/kitchen/menus/${id}/lines/${l.id}`}
                  right={
                    <button
                      type="button"
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm text-debit hover:bg-debit-bg"
                      onClick={(e) => {
                        e.preventDefault();
                        void (async () => {
                          if (!confirm(`Remove ${l.display_name}?`)) return;
                          try {
                            const next = menu.lines
                              .filter((x) => x.id !== l.id)
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
                            await apiFetch(`/api/menus/${id}`, {
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
              ))}
            </ul>
          )}
        </PanelCard>
      ) : null}
    </div>
  );
}
