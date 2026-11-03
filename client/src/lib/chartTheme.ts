/** Chart colors — DESIGN.md trading green / red / yellow accent (light canvas) */
export const chartTheme = {
  income: "#0ECB81",
  expense: "#F6465D",
  net: "#F0B90B",
  grid: "#EAECEF",
  tick: "#707A8A",
  tooltipBorder: "#EAECEF",
  tooltipBg: "#FFFFFF",
  categories: ["#181A20", "#707A8A", "#F0B90B", "#0ECB81", "#F6465D", "#929AA5", "#4B5563"],
} as const;

export const chartAxisProps = {
  tick: { fill: chartTheme.tick, fontSize: 11 },
  axisLine: { stroke: chartTheme.grid },
  tickLine: { stroke: chartTheme.grid },
} as const;
