/** Default / historical backfill when no rate exists on or before as-of date. */
export const USD_MVR_RATE_DEFAULT = 20;

export type FxRatePoint = { rate_date: string; usd_mvr_rate: number };

function asYmd(value: string): string {
  return value.slice(0, 10);
}

/** Resolve sparse ascending history: latest rate_date <= asOfYmd, else default 20. */
export function resolveUsdMvrRateFromSeries(
  series: FxRatePoint[],
  asOfYmd: string,
  fallback = USD_MVR_RATE_DEFAULT,
): number {
  const asOf = asYmd(asOfYmd);
  let best: number | null = null;
  for (const p of series) {
    if (asYmd(p.rate_date) <= asOf) best = p.usd_mvr_rate;
    else break;
  }
  return best != null && best > 0 ? best : fallback;
}

export function todayYmdUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
