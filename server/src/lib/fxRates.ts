import { prisma } from "./prisma.js";

/** Default / historical backfill when no rate exists on or before as-of date. */
export const USD_MVR_RATE_DEFAULT = 20;

export const FX_BASELINE_YMD = "1970-01-01";

export type FxRatePoint = { rate_date: string; usd_mvr_rate: number };

function ymdUtc(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function toDateOnly(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

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

export async function listFxDailyRates(userId: string): Promise<FxRatePoint[]> {
  const rows = await prisma.fxDailyRate.findMany({
    where: { userId },
    orderBy: { rateDate: "asc" },
  });
  return rows.map((r) => ({
    rate_date: r.rateDate.toISOString().slice(0, 10),
    usd_mvr_rate: Number(r.usdMvrRate),
  }));
}

/** Ensure 1970-01-01 baseline of 20 exists for the user. */
export async function ensureFxBaseline(userId: string): Promise<void> {
  await prisma.fxDailyRate.upsert({
    where: {
      userId_rateDate: { userId, rateDate: toDateOnly(FX_BASELINE_YMD) },
    },
    create: {
      userId,
      rateDate: toDateOnly(FX_BASELINE_YMD),
      usdMvrRate: USD_MVR_RATE_DEFAULT,
    },
    update: {},
  });
}

/** Upsert a daily rate for the given date (defaults to today UTC). */
export async function upsertFxDailyRate(
  userId: string,
  usdMvrRate: number,
  rateDateYmd?: string,
): Promise<FxRatePoint> {
  const ymd = rateDateYmd ?? ymdUtc();
  await ensureFxBaseline(userId);
  const row = await prisma.fxDailyRate.upsert({
    where: {
      userId_rateDate: { userId, rateDate: toDateOnly(ymd) },
    },
    create: {
      userId,
      rateDate: toDateOnly(ymd),
      usdMvrRate,
    },
    update: { usdMvrRate },
  });
  return {
    rate_date: row.rateDate.toISOString().slice(0, 10),
    usd_mvr_rate: Number(row.usdMvrRate),
  };
}

/**
 * Effective USD/MVR rate for as-of date (UTC today when omitted).
 * Uses sparse daily history with carry-forward; falls back to 20.
 */
export async function getUsdMvrRate(userId: string, asOfYmd?: string): Promise<number> {
  const asOf = asOfYmd ?? ymdUtc();
  const row = await prisma.fxDailyRate.findFirst({
    where: {
      userId,
      rateDate: { lte: toDateOnly(asOf) },
    },
    orderBy: { rateDate: "desc" },
  });
  if (row) {
    const n = Number(row.usdMvrRate);
    return n > 0 ? n : USD_MVR_RATE_DEFAULT;
  }
  // Fall back to current settings, then default 20
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  const fromSettings = Number(settings?.globalUsdMvrRate ?? 0);
  return fromSettings > 0 ? fromSettings : USD_MVR_RATE_DEFAULT;
}

/** Load full ascending series once for in-memory dated conversions. */
export async function loadFxRateResolver(
  userId: string,
): Promise<(asOfYmd: string) => number> {
  const series = await listFxDailyRates(userId);
  if (!series.length) {
    const fallback = await getUsdMvrRate(userId);
    return () => fallback;
  }
  return (asOfYmd: string) => resolveUsdMvrRateFromSeries(series, asOfYmd);
}
