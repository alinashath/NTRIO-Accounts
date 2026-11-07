import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "@/api/http";
import { PageBackHeader } from "@/components/PageBackHeader";
import { ListRow, PanelCard } from "@/components/design";
import { SkeletonListPage, SkeletonTableRows } from "@/components/Skeleton";
import { Button } from "@/components/ui";
import type { StockProductDto } from "../../../../shared/types";

export function StockProductsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<StockProductDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ items: StockProductDto[] }>("/api/stock/products");
      setItems(data.items);
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

  if (loading && items.length === 0) {
    return <SkeletonListPage rows={6} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageBackHeader
        backTo="/stock"
        title="Products"
        caption="One product fills one stock item. A 1 kg bag and a 10 kg sack can both fill flour."
        action={
          <Button type="button" className="gap-2" onClick={() => navigate("/stock/products/new")}>
            <Plus className="h-4 w-4" aria-hidden />
            Add
          </Button>
        }
      />
      {error ? (
        <p className="rounded-[var(--radius)] border border-debit/30 bg-debit-bg px-3 py-2 text-sm text-debit-ink">
          {error}
        </p>
      ) : null}
      <PanelCard
        title={
          loading ? "Products" : `${items.length} product${items.length === 1 ? "" : "s"}`
        }
      >
        {loading ? (
          <SkeletonTableRows rows={5} />
        ) : items.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">No products yet. Add bags, cans, or cases.</p>
        ) : (
          <ul>
            {items.map((p) => (
              <ListRow
                key={p.id}
                primary={p.name}
                secondary={`${p.stock_item_name} · ${p.qty} ${p.unit_code}${
                  p.default_price != null ? ` · ${p.default_price.toFixed(2)}` : ""
                }`}
                href={`/stock/products/${p.id}`}
              />
            ))}
          </ul>
        )}
      </PanelCard>
    </div>
  );
}
