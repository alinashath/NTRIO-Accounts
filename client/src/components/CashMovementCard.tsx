import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { chartTheme } from "@/lib/chartTheme";
import { formatMoney, formatMoneyAmountOnly, toMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

export type CashMovementPoint = {
  day: string;
  income: number;
  expense: number;
  net: number;
};

type ChartRow = CashMovementPoint & {
  expenseNeg: number;
  trend: number;
};

function formatAxis(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1000) return `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
  return String(Math.round(v));
}

/** Ordinary least squares slope/intercept for net over index. */
function linearTrend(nets: number[]): { slope: number; intercept: number } {
  const n = nets.length;
  if (n < 2) return { slope: 0, intercept: nets[0] ?? 0 };
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    const y = nets[i]!;
    sumX += i;
    sumY += y;
    sumXY += i * y;
    sumXX += i * i;
  }
  const den = n * sumXX - sumX * sumX;
  if (Math.abs(den) < 1e-9) return { slope: 0, intercept: sumY / n };
  const slope = (n * sumXY - sumX * sumY) / den;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

function StatCell({
  label,
  value,
  currency,
  tone,
}: {
  label: string;
  value: number;
  currency: string;
  tone?: "positive" | "negative" | "neutral";
}) {
  const toneClass =
    tone === "positive"
      ? "text-positive"
      : tone === "negative"
        ? "text-negative"
        : "text-foreground";
  return (
    <div className="border-border/80 px-4 py-3.5 odd:border-r even:max-sm:border-r-0 sm:border-r sm:last:border-r-0 [&:nth-child(-n+2)]:max-sm:border-b">
      <p className="text-[12px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-[19px] font-bold tracking-tight tabular-nums",
          toneClass,
        )}
      >
        <span className="mr-1 text-xs font-medium tracking-normal text-muted-foreground">
          {currency}
        </span>
        {formatMoneyAmountOnly(value)}
      </p>
    </div>
  );
}

export function CashMovementCard({
  data,
  currency,
  weekly,
  compact,
  incomeTotal,
  expenseTotal,
  netTotal,
  avgDailySpend,
  className,
}: {
  data: CashMovementPoint[];
  currency: string;
  weekly: boolean;
  compact: boolean;
  incomeTotal: number;
  expenseTotal: number;
  netTotal: number;
  avgDailySpend: number;
  className?: string;
}) {
  const [sel, setSel] = useState<number | null>(null);

  const chartData: ChartRow[] = useMemo(() => {
    const nets = data.map((d) => d.net);
    const { slope, intercept } = linearTrend(nets);
    return data.map((d, i) => ({
      ...d,
      expenseNeg: -Math.abs(d.expense),
      trend: intercept + slope * i,
    }));
  }, [data]);

  const trendMeta = useMemo(() => {
    const { slope } = linearTrend(data.map((d) => d.net));
    return { slope: toMoney(slope) };
  }, [data]);

  const empty =
    data.length === 0 || data.every((d) => d.income === 0 && d.expense === 0);

  const selected = sel != null ? chartData[sel] : null;

  return (
    <Card className={cn("gap-0 overflow-hidden", className)}>
      <CardHeader className="gap-3 pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base tracking-tight sm:text-[18px]">
              Cash movement
            </CardTitle>
            <CardDescription className="mt-1">
              {weekly ? "Weekly" : "Daily"} · income above zero, expenses below
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-[3px]"
                style={{ background: chartTheme.income }}
                aria-hidden
              />
              Income
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-[3px]"
                style={{ background: chartTheme.expense }}
                aria-hidden
              />
              Expense
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-[3px]"
                style={{
                  background: `linear-gradient(90deg, ${chartTheme.income} 50%, ${chartTheme.expense} 50%)`,
                }}
                aria-hidden
              />
              Net
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="mb-0.5 w-2.5 border-t-2 border-dotted border-foreground"
                aria-hidden
              />
              Trend
            </span>
          </div>
        </div>

        <div
          className="flex min-h-16 flex-col justify-center gap-0.5 rounded-[14px] bg-muted/70 px-3.5 py-3"
          aria-live="polite"
        >
          {selected ? (
            <>
              <p className="text-[12.5px] text-muted-foreground">{selected.day}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold tabular-nums">
                <span className="text-positive">
                  In {formatMoney(selected.income, currency)}
                </span>
                <span className="text-negative">
                  Out {formatMoney(selected.expense, currency)}
                </span>
                <span
                  className={
                    selected.net < 0
                      ? "text-negative"
                      : selected.net > 0
                        ? "text-positive"
                        : "text-foreground"
                  }
                >
                  Net {formatMoney(selected.net, currency)}
                </span>
              </div>
            </>
          ) : (
            <>
              <p className="text-[13.5px] text-muted-foreground">
                Drag across the chart to see a day&apos;s income, expense and net.
              </p>
              {!empty ? (
                <p
                  className={cn(
                    "text-sm font-semibold tabular-nums",
                    trendMeta.slope < 0 ? "text-negative" : "text-positive",
                  )}
                >
                  Trend: net {trendMeta.slope < 0 ? "falling" : "rising"} about{" "}
                  {formatMoney(Math.abs(trendMeta.slope), currency)} a{" "}
                  {weekly ? "week" : "day"}
                </p>
              ) : null}
            </>
          )}
        </div>
      </CardHeader>

      <CardContent className="px-2 pb-0 sm:px-3">
        {empty ? (
          <div className="mb-3 flex h-52 items-center justify-center rounded-[14px] bg-muted/50 px-4 text-center text-sm text-muted-foreground">
            No income or expenses in this period yet.
          </div>
        ) : (
          <div
            className="h-56 touch-pan-y select-none sm:h-60"
            role="img"
            aria-label={`${weekly ? "Weekly" : "Daily"} cash movement chart. Income above zero, expenses below.`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                stackOffset="sign"
                margin={{
                  top: 8,
                  right: 8,
                  left: 0,
                  bottom: 0,
                }}
                barCategoryGap={compact ? "28%" : "32%"}
                onMouseMove={(state) => {
                  const idx =
                    typeof state?.activeTooltipIndex === "number"
                      ? state.activeTooltipIndex
                      : null;
                  setSel(idx);
                }}
                onMouseLeave={() => setSel(null)}
                onClick={(state) => {
                  const idx =
                    typeof state?.activeTooltipIndex === "number"
                      ? state.activeTooltipIndex
                      : null;
                  setSel(idx);
                }}
              >
                <defs>
                  <linearGradient id="cashNetGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="45%" stopColor={chartTheme.income} />
                    <stop offset="55%" stopColor={chartTheme.expense} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 5"
                  stroke={chartTheme.grid}
                  vertical={false}
                />
                <ReferenceLine y={0} stroke="#b9c6cb" strokeWidth={1.25} />
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: chartTheme.tick, fontSize: compact ? 10 : 11 }}
                  interval={weekly ? 0 : "preserveStartEnd"}
                  minTickGap={compact ? 28 : 14}
                  tickMargin={8}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={compact ? 34 : 42}
                  tickFormatter={formatAxis}
                  tick={{ fill: chartTheme.tick, fontSize: compact ? 10 : 11 }}
                />
                <Bar
                  dataKey="income"
                  stackId="flow"
                  fill={chartTheme.income}
                  maxBarSize={compact ? 16 : 14}
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={false}
                >
                  {chartData.map((_, i) => (
                    <Cell
                      key={`inc-${i}`}
                      fillOpacity={sel != null && sel !== i ? 0.45 : 1}
                    />
                  ))}
                </Bar>
                <Bar
                  dataKey="expenseNeg"
                  stackId="flow"
                  fill={chartTheme.expense}
                  maxBarSize={compact ? 16 : 14}
                  radius={[0, 0, 3, 3]}
                  isAnimationActive={false}
                >
                  {chartData.map((_, i) => (
                    <Cell
                      key={`exp-${i}`}
                      fillOpacity={sel != null && sel !== i ? 0.45 : 1}
                    />
                  ))}
                </Bar>
                <Line
                  type="monotone"
                  dataKey="net"
                  stroke="url(#cashNetGradient)"
                  strokeWidth={2.4}
                  dot={false}
                  activeDot={{
                    r: 4.5,
                    strokeWidth: 2.4,
                    fill: "#fff",
                    stroke: selected && selected.net < 0 ? chartTheme.expense : chartTheme.income,
                  }}
                  isAnimationActive={false}
                />
                <Line
                  type="linear"
                  dataKey="trend"
                  stroke="#0c1a24"
                  strokeWidth={1.7}
                  strokeDasharray="1 5"
                  strokeLinecap="round"
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                  legendType="none"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>

      <div className="mt-1.5 grid grid-cols-2 border-t border-border sm:grid-cols-4">
        <StatCell label="Income" value={incomeTotal} currency={currency} tone="positive" />
        <StatCell label="Expense" value={expenseTotal} currency={currency} tone="negative" />
        <StatCell
          label="Net"
          value={netTotal}
          currency={currency}
          tone={netTotal < 0 ? "negative" : netTotal > 0 ? "positive" : "neutral"}
        />
        <StatCell label="Avg spend / day" value={avgDailySpend} currency={currency} />
      </div>
    </Card>
  );
}
