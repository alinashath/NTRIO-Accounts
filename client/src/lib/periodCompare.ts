import { formatMoney } from "./money";

const DAY_MS = 86_400_000;

/** Same-length period ending the day before `from`. */
export function previousInclusivePeriodYmd(
  fromYmd: string,
  toYmd: string,
): { from: string; to: string } {
  const from = new Date(`${fromYmd}T00:00:00Z`);
  const to = new Date(`${toYmd}T00:00:00Z`);
  const inclusiveDays = Math.floor((to.getTime() - from.getTime()) / DAY_MS) + 1;
  const prevTo = new Date(from.getTime() - DAY_MS);
  const prevFrom = new Date(prevTo.getTime() - (inclusiveDays - 1) * DAY_MS);
  return {
    from: prevFrom.toISOString().slice(0, 10),
    to: prevTo.toISOString().slice(0, 10),
  };
}

/** Percent change; null when prior is ~0. */
export function pctChange(current: number, prior: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(prior)) return null;
  if (Math.abs(prior) < 1e-6) {
    if (Math.abs(current) < 1e-6) return 0;
    return null;
  }
  return Math.round(((current - prior) / Math.abs(prior)) * 1000) / 10;
}

export function formatPct(n: number, digits = 0): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

/**
 * Compact “vs prior” line for StatCards.
 * `higherIsBetter`: when true, positive change is good (income/net worth);
 * when false, positive change is bad (expenses).
 */
export function formatVsPrior(
  current: number,
  prior: number,
  opts?: { higherIsBetter?: boolean; currency?: string },
): { text: string; tone: "positive" | "negative" | "neutral" } {
  const higherIsBetter = opts?.higherIsBetter ?? true;
  const pct = pctChange(current, prior);
  const delta = Math.round((current - prior) * 100) / 100;

  if (pct == null) {
    if (Math.abs(current) < 1e-6 && Math.abs(prior) < 1e-6) {
      return { text: "Flat vs prior period", tone: "neutral" };
    }
    const dir = current > prior ? "up" : "down";
    const amount = opts?.currency
      ? formatMoney(Math.abs(delta), opts.currency)
      : Math.abs(delta).toFixed(2);
    return {
      text: `${dir === "up" ? "↑" : "↓"} ${amount} vs prior (n/a %)`,
      tone: (delta === 0 ? "neutral" : delta > 0 === higherIsBetter ? "positive" : "negative") as
        | "positive"
        | "negative"
        | "neutral",
    };
  }

  const arrow = pct > 0 ? "↑" : pct < 0 ? "↓" : "→";
  const tone: "positive" | "negative" | "neutral" =
    pct === 0 ? "neutral" : pct > 0 === higherIsBetter ? "positive" : "negative";

  return {
    text: `${arrow} ${formatPct(pct, 1)} vs prior period`,
    tone,
  };
}

/** Share of total as a percent string (e.g. expenses / income). */
export function formatSharePct(part: number, whole: number, label: string): string | undefined {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || Math.abs(whole) < 1e-6) return undefined;
  const pct = Math.round((part / whole) * 1000) / 10;
  return `${pct.toFixed(0)}% ${label}`;
}
