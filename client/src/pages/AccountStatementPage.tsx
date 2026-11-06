import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { format } from "date-fns";
import { apiFetch } from "@/api/http";
import { Button, Card, TextField } from "@/components/ui";
import { downloadText, toCsv } from "@/lib/download";
import { formatMoney } from "@/lib/money";
import type { AccountLedgerPageDto, LedgerLineDto, LedgerKind } from "../../../shared/types";

function kindLabel(k: LedgerKind): string {
  switch (k) {
    case "income":
      return "Income";
    case "expense":
      return "Expense";
    case "transfer_in":
      return "Transfer in";
    case "transfer_out":
      return "Transfer out";
    case "debt":
      return "Debt";
    case "adjustment":
      return "Adjustment";
    default:
      return k;
  }
}

export function AccountStatementPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<AccountLedgerPageDto | null>(null);
  const [items, setItems] = useState<LedgerLineDto[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [adjOpen, setAdjOpen] = useState(false);
  const [adjDate, setAdjDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [adjAmount, setAdjAmount] = useState("");
  const [adjNote, setAdjNote] = useState("");
  const [adjBusy, setAdjBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);

  const loadPage = useCallback(
    async (p: number, append: boolean) => {
      if (!id) return;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await apiFetch<AccountLedgerPageDto>(
          `/api/accounts/${encodeURIComponent(id)}/ledger?page=${p}&page_size=50`,
        );
        if (append) {
          setItems((prev) => [...prev, ...res.items]);
          setPage(p);
        } else {
          setData(res);
          setItems(res.items);
          setPage(p);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [id],
  );

  useEffect(() => {
    if (!id) return;
    void loadPage(1, false);
  }, [id, loadPage]);

  async function submitAdjustment(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    const amt = Number(adjAmount);
    if (!Number.isFinite(amt) || amt === 0) {
      setError("Enter a non-zero adjustment amount (use − for decreases).");
      return;
    }
    setAdjBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/accounts/${encodeURIComponent(id)}/adjustments`, {
        method: "POST",
        body: JSON.stringify({
          date: adjDate,
          amount: amt,
          note: adjNote.trim() || undefined,
        }),
      });
      setAdjOpen(false);
      setAdjAmount("");
      setAdjNote("");
      await loadPage(1, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setAdjBusy(false);
    }
  }

  const ccy = data?.currency ?? "USD";
  const hasMore = data != null && items.length < data.total;

  async function exportCsv() {
    if (!id || !data) return;
    setExportBusy(true);
    setError(null);
    try {
      const all: LedgerLineDto[] = [];
      let p = 1;
      let total = Infinity;
      const pageSize = 200;
      while (all.length < total) {
        const res = await apiFetch<AccountLedgerPageDto>(
          `/api/accounts/${encodeURIComponent(id)}/ledger?page=${p}&page_size=${pageSize}`,
        );
        total = res.total;
        all.push(...res.items);
        if (res.items.length === 0) break;
        p += 1;
        if (p > 500) break;
      }
      // Screen is newest-first; CSV is oldest → newest for spreadsheet use.
      const chronological = [...all].reverse();
      const slug = data.account.name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "account";
      downloadText(
        `statement-${slug}-${format(new Date(), "yyyy-MM-dd")}.csv`,
        toCsv(
          ["Date", "Type", "Description", "Money in", "Money out", "Balance", "Currency"],
          [
            [
              "",
              "Opening",
              "Opening balance",
              "",
              "",
              data.opening_balance,
              ccy,
            ],
            ...chronological.map((r) => [
              r.date,
              kindLabel(r.kind),
              r.description ?? "",
              r.money_in ?? "",
              r.money_out ?? "",
              r.running_balance,
              ccy,
            ]),
          ],
        ),
        "text/csv;charset=utf-8",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExportBusy(false);
    }
  }

  if (!id) {
    return <p className="text-sm text-muted-label">Missing account.</p>;
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/accounts/ledger" className="text-sm font-medium text-action hover:underline">
            ← Accounts
          </Link>
          {loading && !data ? (
            <p className="mt-2 text-muted-label">Loading…</p>
          ) : data ? (
            <>
              <h2 className="mt-1 text-lg font-bold text-ink md:text-xl">Statement — {data.account.name}</h2>
              <p className="text-sm text-muted-label">
                {data.account.type.toUpperCase()} · {ccy} · Opening{" "}
                <span className="tabular-nums">{formatMoney(data.opening_balance, ccy)}</span> · Current{" "}
                <span className="tabular-nums">{formatMoney(data.account.balance, ccy)}</span>
                {" · "}Latest first
              </p>
            </>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={!data || exportBusy || loading}
            onClick={() => void exportCsv()}
          >
            {exportBusy ? "Exporting…" : "Export CSV"}
          </Button>
          <Button type="button" onClick={() => setAdjOpen(true)}>
            Balance adjustment
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-debit">{error}</p> : null}

      <Card>
        <h3 className="text-sm font-semibold text-ink">Activity</h3>
        <p className="mt-0.5 text-caption">Newest transactions first. Balance is after each line.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase text-muted-label">
                <th className="py-2 pr-2">Date</th>
                <th className="py-2 pr-2">Type</th>
                <th className="py-2 pr-2">Description</th>
                <th className="py-2 pr-2 text-right">In</th>
                <th className="py-2 pr-2 text-right">Out</th>
                <th className="py-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {!loading && items.length === 0 ? (
                <tr>
                  <td className="py-6 text-muted-label" colSpan={6}>
                    No ledger lines yet (only opening balance).
                  </td>
                </tr>
              ) : (
                items.map((r) => (
                  <tr key={`${r.kind}-${r.id}`} className="border-b border-border">
                    <td className="whitespace-nowrap py-2 pr-2 text-body">{r.date}</td>
                    <td className="py-2 pr-2">
                      <span
                        className={
                          r.kind === "adjustment"
                            ? "rounded bg-neutral-bg px-1.5 py-0.5 text-xs font-semibold text-action"
                            : "text-muted-label"
                        }
                      >
                        {kindLabel(r.kind)}
                      </span>
                    </td>
                    <td className="max-w-[12rem] truncate py-2 pr-2 text-ink">{r.description ?? "—"}</td>
                    <td className="py-2 pr-2 text-right tabular-nums text-credit">
                      {r.money_in != null ? formatMoney(r.money_in, ccy) : "—"}
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums text-debit">
                      {r.money_out != null ? formatMoney(r.money_out, ccy) : "—"}
                    </td>
                    <td className="py-2 text-right font-medium tabular-nums text-ink">
                      {formatMoney(r.running_balance, ccy)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {hasMore ? (
          <div className="mt-3 flex justify-center">
            <Button
              type="button"
              variant="ghost"
              disabled={loadingMore}
              onClick={() => void loadPage(page + 1, true)}
            >
              {loadingMore ? "Loading…" : "Load older"}
            </Button>
          </div>
        ) : null}
      </Card>

      {adjOpen ? (
        <ModalAdj
          adjDate={adjDate}
          setAdjDate={setAdjDate}
          adjAmount={adjAmount}
          setAdjAmount={setAdjAmount}
          adjNote={adjNote}
          setAdjNote={setAdjNote}
          ccy={ccy}
          busy={adjBusy}
          onClose={() => setAdjOpen(false)}
          onSubmit={submitAdjustment}
        />
      ) : null}
    </div>
  );
}

function ModalAdj({
  adjDate,
  setAdjDate,
  adjAmount,
  setAdjAmount,
  adjNote,
  setAdjNote,
  ccy,
  busy,
  onClose,
  onSubmit,
}: {
  adjDate: string;
  setAdjDate: (s: string) => void;
  adjAmount: string;
  setAdjAmount: (s: string) => void;
  adjNote: string;
  setAdjNote: (s: string) => void;
  ccy: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[var(--radius-md)] border border-border bg-card p-3">
        <h3 className="text-base font-semibold text-ink">Balance adjustment</h3>
        <form className="mt-4 space-y-3" onSubmit={onSubmit}>
          <label className="block text-sm">
            <span className="text-muted-label">Date</span>
            <input
              type="date"
              className="mt-1 block h-8 w-full rounded-[var(--radius-md)] border border-border px-2.5 text-sm"
              value={adjDate}
              onChange={(e) => setAdjDate(e.target.value)}
              required
            />
          </label>
          <TextField
            label={`Amount (${ccy}, + or −)`}
            value={adjAmount}
            onChange={(e) => setAdjAmount(e.target.value)}
            inputMode="decimal"
            placeholder="e.g. -2.50 or 100"
            required
          />
          <TextField label="Note (optional)" value={adjNote} onChange={(e) => setAdjNote(e.target.value)} />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save adjustment"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
