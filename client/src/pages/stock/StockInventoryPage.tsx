import { PackagePlus, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "@/api/http";
import { ListRow, PanelCard, SegmentedControl } from "@/components/design";
import { SkeletonListPage, SkeletonTableRows } from "@/components/Skeleton";
import { Button, TextField } from "@/components/ui";
import { displayPrice, displayQty, fmtQty } from "@/lib/units";
import type { StockInventoryRowDto } from "../../../../shared/types";

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function StockInventoryPage() {
  const navigate = useNavigate();
  const [date, setDate] = useState(todayYmd);
  const [kind, setKind] = useState<"all" | "kitchen" | "other">("kitchen");
  const [levelFilter, setLevelFilter] = useState<"all" | "low">("all");
  const [rows, setRows] = useState<StockInventoryRowDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ date, kind });
      const data = await apiFetch<{ date: string; items: StockInventoryRowDto[] }>(
        `/api/stock/inventory?${q}`,
      );
      setRows(data.items);
    } finally {
      setLoading(false);
    }
  }, [date, kind]);

  useEffect(() => {
    void load().catch((e) => {
      setError(e instanceof Error ? e.message : "Failed");
      setLoading(false);
    });
  }, [load]);

  const visible = useMemo(
    () => (levelFilter === "low" ? rows.filter((r) => r.below_min) : rows),
    [rows, levelFilter],
  );

  if (loading && rows.length === 0) {
    return <SkeletonListPage rows={8} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page-title text-ink">Inventory</h1>
          <p className="mt-1 text-caption">
            Opening + Received − Used = Balance. Tap a row to edit. Refill with a product so price is
            stored per gram, millilitre, or piece.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            className="gap-2"
            onClick={() => navigate("/stock/products")}
          >
            Products
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="gap-2"
            onClick={() => navigate("/stock/refill")}
          >
            <PackagePlus className="h-4 w-4" aria-hidden />
            Refill
          </Button>
          <Button type="button" className="gap-2" onClick={() => navigate("/stock/items/new")}>
            <Plus className="h-4 w-4" aria-hidden />
            Add item
          </Button>
        </div>
      </div>

      {error ? (
        <p className="rounded-[var(--radius)] border border-debit/30 bg-debit-bg px-3 py-2 text-sm text-debit-ink">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <TextField
          label="Date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-[11rem]"
        />
        <SegmentedControl
          aria-label="Kind"
          value={kind}
          onChange={setKind}
          options={[
            { value: "kitchen", label: "Kitchen" },
            { value: "other", label: "Other" },
            { value: "all", label: "All" },
          ]}
        />
        <SegmentedControl
          aria-label="Level"
          value={levelFilter}
          onChange={setLevelFilter}
          options={[
            { value: "all", label: "All levels" },
            { value: "low", label: "Low stock" },
          ]}
        />
      </div>

      <PanelCard
        title={`Stock · ${date}${levelFilter === "low" ? " · low stock only" : ""}`}
        headerRight={
          <Link
            to="/kitchen/recipes"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-action"
          >
            Recipes
          </Link>
        }
      >
        {loading ? (
          <SkeletonTableRows rows={6} />
        ) : visible.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-muted">No stock items yet.</p>
            <Button type="button" className="mt-3" onClick={() => navigate("/stock/items/new")}>
              Add first stock item
            </Button>
          </div>
        ) : (
          <ul>
            {visible.map((r) => {
              const bal = displayQty(r.balance, r.display_unit, r.units, r.base_unit);
              const price = displayPrice(
                r.unit_cost ?? r.last_unit_cost,
                r.display_unit,
                r.units,
                r.base_unit,
              );
              const minDisp = displayQty(r.min_stock, r.display_unit, r.units, r.base_unit);
              return (
                <ListRow
                  key={r.stock_item_id}
                  primary={r.name}
                  secondary={`${bal.text} · ${price}${
                    r.below_min ? ` · Min ${fmtQty(minDisp.qty)}` : ""
                  }${
                    r.product_count
                      ? ` · ${r.product_count} product${r.product_count === 1 ? "" : "s"}`
                      : ""
                  }`}
                  onClick={() => navigate(`/stock/items/${r.stock_item_id}`)}
                  right={
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-11"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/stock/items/${r.stock_item_id}/refill`);
                      }}
                    >
                      Refill
                    </Button>
                  }
                />
              );
            })}
          </ul>
        )}
      </PanelCard>
    </div>
  );
}
