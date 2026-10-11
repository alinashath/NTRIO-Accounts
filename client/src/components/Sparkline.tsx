import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";
import { cn } from "@/lib/utils";

type Point = { v: number };

/**
 * Compact trend sparkline for KPI cards. Decorative when `label` is provided
 * (summary lives in adjacent text); otherwise expose a short accessible name.
 */
export function Sparkline({
  values,
  color,
  className,
  label,
  height = 40,
}: {
  values: number[];
  color: string;
  className?: string;
  /** Accessible summary of the trend */
  label?: string;
  height?: number;
}) {
  const data: Point[] = values.map((v) => ({ v: Number.isFinite(v) ? v : 0 }));
  const empty = data.length < 2 || data.every((d) => d.v === 0);
  const gradId = `spark-${color.replace(/[^a-zA-Z0-9]/g, "")}`;

  if (empty) {
    return (
      <div
        className={cn("flex items-end", className)}
        style={{ height }}
        role="img"
        aria-label={label ?? "No trend data"}
      >
        <div className="h-px w-full bg-border" />
      </div>
    );
  }

  return (
    <div
      className={cn("min-w-0", className)}
      style={{ height }}
      role="img"
      aria-label={label ?? "Trend"}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.75}
            fill={`url(#${gradId})`}
            isAnimationActive={false}
            dot={false}
            activeDot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
