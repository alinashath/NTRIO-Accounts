import {
  addWeeks,
  eachDayOfInterval,
  eachMonthOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  max,
  min,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";

export type CashChartGranularity = "day" | "week" | "month";

/** <32 days → daily; ~1–2 months → weekly; longer → monthly. */
export function chartGranularityForDays(periodDays: number): CashChartGranularity {
  if (periodDays < 32) return "day";
  if (periodDays <= 62) return "week";
  return "month";
}

export function chartGranularityLabel(g: CashChartGranularity): string {
  return g === "day" ? "Daily" : g === "week" ? "Weekly" : "Monthly";
}

export function chartGranularityUnit(g: CashChartGranularity): string {
  return g === "day" ? "day" : g === "week" ? "week" : "month";
}

export type TrendBucket = {
  from: string;
  to: string;
  /** Short axis label */
  label: string;
  sort: string;
};

/** Inclusive date buckets for trend charts (day / week / month). */
export function trendBucketsForRange(
  fromYmd: string,
  toYmd: string,
  granularity: CashChartGranularity,
): TrendBucket[] {
  const start = parseISO(fromYmd);
  const end = parseISO(toYmd);

  if (granularity === "day") {
    return eachDayOfInterval({ start, end }).map((d) => {
      const key = format(d, "yyyy-MM-dd");
      return { from: key, to: key, label: format(d, "MMM d"), sort: key };
    });
  }

  if (granularity === "week") {
    const buckets: TrendBucket[] = [];
    let cursor = startOfWeek(start, { weekStartsOn: 1 });
    while (cursor <= end) {
      const weekEnd = endOfWeek(cursor, { weekStartsOn: 1 });
      const from = format(max([cursor, start]), "yyyy-MM-dd");
      const to = format(min([weekEnd, end]), "yyyy-MM-dd");
      const sort = format(cursor, "yyyy-MM-dd");
      buckets.push({
        from,
        to,
        label: format(cursor, "MMM d"),
        sort,
      });
      cursor = addWeeks(cursor, 1);
    }
    return buckets;
  }

  const months = eachMonthOfInterval({ start, end });
  const years = new Set(months.map((m) => m.getFullYear()));
  const multiYear = years.size > 1;

  return months.map((m) => {
    const monthStart = startOfMonth(m);
    const monthEnd = endOfMonth(m);
    const from = format(max([monthStart, start]), "yyyy-MM-dd");
    const to = format(min([monthEnd, end]), "yyyy-MM-dd");
    const sort = format(monthStart, "yyyy-MM");
    return {
      from,
      to,
      label: multiYear ? format(monthStart, "MMM yy") : format(monthStart, "MMM"),
      sort,
    };
  });
}
