import { Link } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/api/http";
import { ChangeTag, ListRow, PanelCard } from "@/components/design";
import { Button, TextField } from "@/components/ui";
import { copyText, downloadText, printHtml, toCsv } from "@/lib/download";
import type { ShoppingListDto, ShoppingReason } from "../../../../shared/types";

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, "");
}

function reasonLabel(r: ShoppingReason) {
  if (r === "order_shortfall") return "Order shortfall";
  if (r === "min_stock") return "Below min";
  return "Not in stock";
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
      "Covers breakfast order needs + min stock levels",
      "",
      ...data.buy_items.map((l) => {
        const why = l.reasons.map(reasonLabel).join(", ");
        return `${l.name}: buy ${fmt(l.to_buy)} ${l.unit} (need ${fmt(l.required)}, on hand ${fmt(l.on_hand)}, min ${fmt(l.min_stock)}${why ? ` · ${why}` : ""})`;
      }),
      data.buy_items.length === 0 ? "(Nothing to buy)" : "",
    ].join("\n");
  }

  function download() {
    if (!data) return;
    downloadText(
      `shopping-list-${date}.csv`,
      toCsv(
        ["Item", "Unit", "Required", "On hand", "Min stock", "To buy", "Reasons", "Use notes", "Pack info"],
        data.items.map((l) => [
          l.name,
          l.unit,
          l.required,
          l.on_hand,
          l.min_stock,
          l.to_buy,
          l.reasons.join("; "),
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
          `<tr><td>${l.name}</td><td>${l.unit}</td><td>${fmt(l.required)}</td><td>${fmt(l.on_hand)}</td><td>${fmt(l.min_stock)}</td><td><strong>${fmt(l.to_buy)}</strong></td><td>${l.reasons.map(reasonLabel).join(", ")}</td></tr>`,
      )
      .join("");
    printHtml(
      `Shopping list ${date}`,
      `<h1>Shopping list</h1><p>${date} — order needs + min stock</p>
      <table><thead><tr><th>Item</th><th>Unit</th><th>Required</th><th>On hand</th><th>Min</th><th>To buy</th><th>Why</th></tr></thead>
      <tbody>${rows || "<tr><td colspan=7>Nothing to buy</td></tr>"}</tbody></table>`,
    );
  }

  const buyCount = data?.buy_items.length ?? 0;
  const summary = data?.summary;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page-title text-ink">Shopping list</h1>
          <p className="mt-1 text-caption">
            Built from breakfast orders for this date. Buys shortfalls and enough to stay at min stock.
          </p>
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
        <Link
          to="/kitchen"
          className="inline-flex min-h-11 items-center rounded-sm border border-border px-4 text-sm font-semibold text-action"
        >
          Breakfast orders
        </Link>
      </div>

      {error ? <p className="text-sm font-medium text-debit">{error}</p> : null}
      {msg ? <p className="text-sm font-medium text-credit">{msg}</p> : null}

      {summary ? (
        <PanelCard title="Summary" caption={date}>
          <ListRow
            primary="Lines to buy"
            secondary={`${summary.order_shortfall_count} order shortfall · ${summary.min_stock_count} min stock · ${summary.missing_item_count} not in catalog`}
            right={<span className="text-sm font-semibold tabular-nums text-ink">{summary.buy_line_count}</span>}
          />
        </PanelCard>
      ) : null}

      <PanelCard title="To buy" caption={`${buyCount} line${buyCount === 1 ? "" : "s"} · ${date}`}>
        {(data?.buy_items ?? []).map((l) => (
          <ListRow
            key={l.code}
            primary={l.name}
            secondary={`${l.unit || "—"} · need ${fmt(l.required)} · on hand ${fmt(l.on_hand)} · min ${fmt(l.min_stock)}`}
            right={
              <div className="flex flex-col items-end gap-1">
                <span className="text-sm font-semibold tabular-nums text-ink">{fmt(l.to_buy)}</span>
                <div className="flex flex-wrap justify-end gap-1">
                  {l.reasons.map((r) => (
                    <ChangeTag key={r} variant={r === "missing_item" ? "negative" : r === "min_stock" ? "neutral" : "negative"}>
                      {reasonLabel(r)}
                    </ChangeTag>
                  ))}
                </div>
              </div>
            }
            rightSecondary="to buy"
          />
        ))}
        {data && data.buy_items.length === 0 ? (
          <p className="border-t border-border px-4 py-3 text-caption">
            Nothing to buy — order needs and min stock are covered.
          </p>
        ) : null}
        {data && !data.items.length ? (
          <p className="border-t border-border px-4 py-3 text-caption">
            No breakfast requirements for this date. Place orders in Kitchen first.
          </p>
        ) : null}
      </PanelCard>

      <PanelCard title="Covered by stock" caption="Required items already on hand (above min after use)">
        {(data?.items ?? [])
          .filter((l) => l.to_buy === 0 && l.required > 0)
          .map((l) => (
            <ListRow
              key={`ok-${l.code}`}
              primary={l.name}
              secondary={`${l.unit} · need ${fmt(l.required)} · on hand ${fmt(l.on_hand)} · min ${fmt(l.min_stock)}`}
              right={<span className="text-sm font-semibold tabular-nums text-credit">OK</span>}
            />
          ))}
        {data && data.items.filter((l) => l.to_buy === 0 && l.required > 0).length === 0 ? (
          <p className="border-t border-border px-4 py-3 text-caption">No covered requirement lines.</p>
        ) : null}
      </PanelCard>
    </div>
  );
}
