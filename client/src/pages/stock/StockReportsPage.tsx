import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/api/http";
import { ListRow, PanelCard, StatRow } from "@/components/design";
import { Button, TextField } from "@/components/ui";
import { downloadText, toCsv } from "@/lib/download";
import type { StockReportDto } from "../../../../shared/types";

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function StockReportsPage() {
  const [from, setFrom] = useState(monthStartYmd);
  const [to, setTo] = useState(todayYmd);
  const [data, setData] = useState<StockReportDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const q = new URLSearchParams({ from, to });
    const d = await apiFetch<StockReportDto>(`/api/stock/reports?${q}`);
    setData(d);
  }, [from, to]);

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [load]);

  function downloadReport() {
    if (!data) return;
    const summary = toCsv(
      ["Metric", "Value"],
      [
        ["From", data.from],
        ["To", data.to],
        ["Guest count (breakfast orders)", data.guest_count],
        ["Expenditure", data.expenditure],
        ["Cost per guest", data.cost_per_guest],
        ["Food waste qty", data.food_waste.total_waste_qty],
        ["Total used qty", data.food_waste.total_used_qty],
      ],
    );
    const consumption = toCsv(
      ["Item", "Unit", "Used", "Waste", "Expenditure"],
      data.ingredient_consumption.map((r) => [r.name, r.unit, r.used, r.waste, r.expenditure]),
    );
    downloadText(
      `breakfast-cost-report-${from}_${to}.csv`,
      `${summary}\n\n${consumption}`,
      "text/csv;charset=utf-8",
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page-title text-ink">Cost &amp; waste</h1>
          <p className="mt-1 text-caption">
            Ingredient consumption, expenditure, cost per guest, food waste.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <TextField label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <TextField label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <Button type="button" variant="secondary" onClick={downloadReport} disabled={!data}>
        Download report
      </Button>

      {error ? <p className="text-sm font-medium text-debit">{error}</p> : null}

      {data ? (
        <>
          <PanelCard title="Summary" caption={`${data.from} → ${data.to}`}>
            <StatRow
              label="Guests"
              value={<span className="text-amount-lg tabular-nums">{data.guest_count}</span>}
            />
            <StatRow
              label="Expenditure"
              value={
                <span className="text-amount-lg tabular-nums">{data.expenditure.toFixed(2)}</span>
              }
            />
            <StatRow
              label="Cost per guest"
              value={
                <span className="text-amount-lg tabular-nums">
                  {data.cost_per_guest != null ? data.cost_per_guest.toFixed(2) : "—"}
                </span>
              }
            />
            <StatRow
              label="Food waste qty"
              value={
                <span className="text-amount-lg tabular-nums text-debit">
                  {data.food_waste.total_waste_qty}
                </span>
              }
            />
          </PanelCard>

          <PanelCard title="Ingredient consumption" caption="Used, waste, and spend by item">
            {data.ingredient_consumption.map((r) => (
              <ListRow
                key={r.stock_item_id}
                primary={r.name}
                secondary={`${r.unit} · used ${r.used} · waste ${r.waste}`}
                right={
                  <span className="text-sm font-semibold tabular-nums text-ink">
                    {r.expenditure.toFixed(2)}
                  </span>
                }
                rightSecondary="expenditure"
              />
            ))}
            {!data.ingredient_consumption.length ? (
              <p className="border-t border-border px-4 py-3 text-caption">
                No ledger activity in this period.
              </p>
            ) : null}
          </PanelCard>

          <PanelCard title="Food waste" caption="Waste quantities on inventory ledger days">
            {data.food_waste.lines.map((l) => (
              <ListRow
                key={l.stock_item_id}
                primary={l.name}
                secondary={l.unit}
                right={<span className="text-sm font-semibold tabular-nums text-debit">{l.waste}</span>}
              />
            ))}
            {!data.food_waste.lines.length ? (
              <p className="border-t border-border px-4 py-3 text-caption">No waste recorded.</p>
            ) : null}
          </PanelCard>
        </>
      ) : null}
    </div>
  );
}
