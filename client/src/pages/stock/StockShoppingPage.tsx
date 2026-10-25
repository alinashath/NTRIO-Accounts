import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/api/http";
import { ListRow, PanelCard } from "@/components/design";
import { Button, TextField } from "@/components/ui";
import { copyText, downloadText, printHtml, toCsv } from "@/lib/download";
import type { ShoppingListDto } from "../../../../shared/types";

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

export function StockShoppingPage() {
  const [date, setDate] = useState(todayYmd);
  const [data, setData] = useState<ShoppingListDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await apiFetch<ShoppingListDto>(`/api/stock/shopping-list?date=${date}`);
    setData(d);
  }, [date]);

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [load]);

  function shareText() {
    if (!data) return "";
    return [
      `Shopping list — ${data.date}`,
      "Ingredients required minus available stock",
      "",
      ...data.buy_items.map(
        (l) => `${l.name}: buy ${l.to_buy} ${l.unit} (need ${l.required}, on hand ${l.on_hand})`,
      ),
      data.buy_items.length === 0 ? "(Nothing to buy)" : "",
    ].join("\n");
  }

  function download() {
    if (!data) return;
    downloadText(
      `shopping-list-${date}.csv`,
      toCsv(
        ["Item", "Unit", "Required", "On hand", "To buy", "Use notes", "Pack info"],
        data.items.map((l) => [
          l.name,
          l.unit,
          l.required,
          l.on_hand,
          l.to_buy,
          l.use_notes,
          l.pack_info,
        ]),
      ),
      "text/csv;charset=utf-8",
    );
  }

  function printList() {
    if (!data) return;
    const rows = data.buy_items
      .map(
        (l) =>
          `<tr><td>${l.name}</td><td>${l.unit}</td><td>${l.required}</td><td>${l.on_hand}</td><td><strong>${l.to_buy}</strong></td></tr>`,
      )
      .join("");
    printHtml(
      `Shopping list ${date}`,
      `<h1>Shopping list</h1><p>${date} — ingredients minus available stock</p>
      <table><thead><tr><th>Item</th><th>Unit</th><th>Required</th><th>On hand</th><th>To buy</th></tr></thead>
      <tbody>${rows || "<tr><td colspan=5>Nothing to buy</td></tr>"}</tbody></table>`,
    );
  }

  const buyCount = data?.buy_items.length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page-title text-ink">Shopping list</h1>
          <p className="mt-1 text-caption">Requirements from breakfast orders minus on-hand balance.</p>
        </div>
        <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            void copyText(shareText())
              .then(() => setMsg("Shopping list copied"))
              .catch(() => setError("Copy failed"))
          }
        >
          Copy
        </Button>
        <Button type="button" variant="secondary" onClick={download}>
          Download
        </Button>
        <Button type="button" variant="secondary" onClick={printList}>
          Print / PDF
        </Button>
      </div>

      {error ? <p className="text-sm font-medium text-debit">{error}</p> : null}
      {msg ? <p className="text-sm font-medium text-credit">{msg}</p> : null}

      <PanelCard title="To buy" caption={`${buyCount} line${buyCount === 1 ? "" : "s"} · ${date}`}>
        {(data?.buy_items ?? []).map((l) => (
          <ListRow
            key={l.code}
            primary={l.name}
            secondary={`${l.unit} · need ${l.required} · on hand ${l.on_hand}`}
            right={<span className="text-sm font-semibold tabular-nums text-ink">{l.to_buy}</span>}
            rightSecondary="to buy"
          />
        ))}
        {data && data.buy_items.length === 0 ? (
          <p className="border-t border-border px-4 py-3 text-caption">Nothing to buy for this date.</p>
        ) : null}
        {!data?.items.length ? (
          <p className="border-t border-border px-4 py-3 text-caption">No requirements for this date.</p>
        ) : null}
      </PanelCard>

      <PanelCard title="Full requirements" caption="Includes lines already covered by stock">
        {(data?.items ?? [])
          .filter((l) => l.to_buy === 0)
          .map((l) => (
            <ListRow
              key={`ok-${l.code}`}
              primary={l.name}
              secondary={`${l.unit} · need ${l.required} · on hand ${l.on_hand}`}
              right={<span className="text-sm font-semibold tabular-nums text-credit">0</span>}
              rightSecondary="to buy"
            />
          ))}
      </PanelCard>
    </div>
  );
}
