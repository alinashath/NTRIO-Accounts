import {
  endOfMonth,
  endOfWeek,
  format,
  getDate,
  min,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subMonths,
  subWeeks,
  subYears,
} from "date-fns";

export type RangePreset =
  | "this_month"
  | "last_month"
  | "this_week"
  | "this_year"
  | "custom";

export type PeriodPresetOption = {
  id: Exclude<RangePreset, "custom"> | "custom";
  label: string;
};

/** Reports default chips */
export const REPORT_PERIOD_PRESETS: PeriodPresetOption[] = [
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "custom", label: "Custom" },
];

/** Dashboard chips — default this month vs previous month */
export const DASHBOARD_PERIOD_PRESETS: PeriodPresetOption[] = [
  { id: "this_month", label: "This month" },
  { id: "this_week", label: "This week" },
  { id: "this_year", label: "This year" },
  { id: "custom", label: "Custom" },
];

export function thisMonthRange(now = new Date()) {
  return {
    from: format(startOfMonth(now), "yyyy-MM-dd"),
    to: format(now, "yyyy-MM-dd"),
  };
}

export function lastMonthRange(now = new Date()) {
  const ref = subMonths(now, 1);
  return {
    from: format(startOfMonth(ref), "yyyy-MM-dd"),
    to: format(endOfMonth(ref), "yyyy-MM-dd"),
  };
}

/** Monday–today (or end of week if viewing past week later). */
export function thisWeekRange(now = new Date()) {
  const start = startOfWeek(now, { weekStartsOn: 1 });
  return {
    from: format(start, "yyyy-MM-dd"),
    to: format(now, "yyyy-MM-dd"),
  };
}

export function thisYearRange(now = new Date()) {
  return {
    from: format(startOfYear(now), "yyyy-MM-dd"),
    to: format(now, "yyyy-MM-dd"),
  };
}

export function rangeForPreset(preset: Exclude<RangePreset, "custom">, now = new Date()) {
  switch (preset) {
    case "this_month":
      return thisMonthRange(now);
    case "last_month":
      return lastMonthRange(now);
    case "this_week":
      return thisWeekRange(now);
    case "this_year":
      return thisYearRange(now);
  }
}

/**
 * Prior period for comparison.
 * - this_month → same MTD window last calendar month
 * - this_week → previous Mon–Sun week (or Mon–same weekday)
 * - this_year → same YTD last year
 * - last_month / custom → equal-length period immediately before
 */
export function comparablePriorPeriod(
  fromYmd: string,
  toYmd: string,
  preset: RangePreset,
  now = new Date(),
): { from: string; to: string } {
  if (preset === "this_month") {
    const start = startOfMonth(subMonths(now, 1));
    const day = getDate(parseISO(toYmd));
    const candidate = new Date(start);
    candidate.setDate(day);
    const end = min([candidate, endOfMonth(start)]);
    return {
      from: format(start, "yyyy-MM-dd"),
      to: format(end, "yyyy-MM-dd"),
    };
  }

  if (preset === "this_week") {
    const thisStart = startOfWeek(now, { weekStartsOn: 1 });
    const prevStart = subWeeks(thisStart, 1);
    const prevEnd = endOfWeek(prevStart, { weekStartsOn: 1 });
    // Match length through "today" weekday when current week is partial
    const daysIntoWeek = Math.floor(
      (parseISO(toYmd).getTime() - parseISO(fromYmd).getTime()) / 86_400_000,
    );
    const end = new Date(prevStart);
    end.setDate(prevStart.getDate() + daysIntoWeek);
    const capped = min([end, prevEnd]);
    return {
      from: format(prevStart, "yyyy-MM-dd"),
      to: format(capped, "yyyy-MM-dd"),
    };
  }

  if (preset === "this_year") {
    const start = startOfYear(subYears(now, 1));
    const to = parseISO(toYmd);
    const end = new Date(start);
    end.setMonth(to.getMonth(), to.getDate());
    return {
      from: format(start, "yyyy-MM-dd"),
      to: format(end, "yyyy-MM-dd"),
    };
  }

  // last_month + custom: equal-length window before `from`
  const DAY_MS = 86_400_000;
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
