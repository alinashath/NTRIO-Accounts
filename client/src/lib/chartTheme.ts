/** Chart colors — DESIGN.md credit / debit / action only */
export const chartTheme = {
  income: "#047857",
  expense: "#B91C1C",
  net: "#1D4ED8",
  grid: "#E5E7EB",
  tick: "#4B5563",
  tooltipBorder: "#E5E7EB",
  tooltipBg: "#FFFFFF",
  categories: ["#111827", "#4B5563", "#1D4ED8", "#047857", "#B91C1C", "#374151", "#6B7280"],
} as const;

export const chartAxisProps = {
  tick: { fill: chartTheme.tick, fontSize: 11 },
  axisLine: { stroke: chartTheme.grid },
  tickLine: { stroke: chartTheme.grid },
} as const;
