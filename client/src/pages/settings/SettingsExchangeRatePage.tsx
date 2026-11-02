import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/api/http";
import { Button, Card, TextField } from "@/components/ui";
import { useDisplayCurrency } from "@/context/DisplayCurrencyContext";
import { SettingsSubpage } from "./SettingsSubpage";

export function SettingsExchangeRatePage() {
  const { refreshFx, globalUsdMvrRate, fxRates } = useDisplayCurrency();
  const [fxInput, setFxInput] = useState("");
  const [fxDate, setFxDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [fxBusy, setFxBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recentFxRates = useMemo(() => {
    const sorted = [...fxRates].sort((a, b) => b.rate_date.localeCompare(a.rate_date));
    return sorted.filter((r) => r.rate_date !== "1970-01-01").slice(0, 12);
  }, [fxRates]);

  useEffect(() => {
    setFxInput(String(globalUsdMvrRate));
  }, [globalUsdMvrRate]);

  return (
    <SettingsSubpage
      title="Exchange rate"
      caption="Daily USD→MVR rates apply forward until you save a newer date. Before any saved rate: 1 USD = 20 MVR."
    >
      {error ? <p className="text-sm text-debit">{error}</p> : null}

      <Card>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            const v = Number(fxInput);
            if (!v || v <= 0) {
              setError("Enter a positive rate (MVR per 1 USD).");
              return;
            }
            if (!/^\d{4}-\d{2}-\d{2}$/.test(fxDate)) {
              setError("Enter a valid rate date.");
              return;
            }
            setFxBusy(true);
            setError(null);
            void apiFetch("/api/settings", {
              method: "PATCH",
              body: JSON.stringify({ global_usd_mvr_rate: v, rate_date: fxDate }),
            })
              .then(() => refreshFx())
              .catch((err) => setError(err instanceof Error ? err.message : "Failed"))
              .finally(() => setFxBusy(false));
          }}
        >
          <div className="min-w-[10rem] flex-1">
            <TextField
              label="1 USD = ? MVR"
              type="number"
              inputMode="decimal"
              step="0.0001"
              min="0.0001"
              value={fxInput}
              onChange={(e) => setFxInput(e.target.value)}
            />
          </div>
          <div className="min-w-[10rem]">
            <TextField
              label="Effective date"
              type="date"
              value={fxDate}
              onChange={(e) => setFxDate(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={fxBusy}>
            {fxBusy ? "Saving…" : "Save rate"}
          </Button>
        </form>
      </Card>

      {recentFxRates.length ? (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-section text-ink">Recent rates</h3>
          </div>
          <ul className="divide-y divide-border">
            {recentFxRates.map((r) => (
              <li key={r.rate_date} className="flex min-h-11 justify-between gap-2 px-4 py-3 text-sm">
                <span className="text-muted-label">{r.rate_date}</span>
                <span className="tabular-nums text-ink">
                  1 USD = {r.usd_mvr_rate.toFixed(4)} MVR
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </SettingsSubpage>
  );
}
