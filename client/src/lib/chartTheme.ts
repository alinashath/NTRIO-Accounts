/** Chart colors — green income / red expense + category accents */
export const chartTheme = {
  income: "#16a34a",
  expense: "#dc2626",
  net: "#2563eb",
  grid: "#E5E5E5",
  tick: "#737373",
  tooltipBorder: "#E5E5E5",
  tooltipBg: "#FFFFFF",
  categories: ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#0891b2", "#4f46e5", "#ca8a04"],
} as const;

export const chartAxisProps = {
  tick: { fill: chartTheme.tick, fontSize: 11 },
  axisLine: { stroke: chartTheme.grid },
  tickLine: { stroke: chartTheme.grid },
} as const;
