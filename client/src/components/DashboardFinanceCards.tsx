import { PctChangeTag } from "@/components/design";
import { formatSignedAmount, formatUnsignedAmount } from "@/lib/amountFormat";
import { formatMoneyAmountOnly, toMoney } from "@/lib/money";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

type DualCcy = { mvr: number; usd: number };

export type CashCurvePoint = {
  key: string;
  day: string;
  v: number;
};

type CashPath = {
  opening: number;
  added: number;
  spent: number;
  forex: number;
  rateEffect: number;
  cashNow: number;
  payLater: number;
  available: number;
  /** Native MVR/USD holdings (not FX conversion of the display total). */
  native: {
    opening: DualCcy;
    added: DualCcy;
    spent: DualCcy;
    cashNow: DualCcy;
    payLater: DualCcy;
    available: DualCcy;
  };
};

type PnlSlice = {
  total_income: number;
  total_expenses: number;
  net: number;
};

function HeroAvailable({
  currency,
  cashNow,
  payLater,
  available,
  opening,
  curve,
}: {
  currency: string;
  cashNow: number;
  payLater: number;
  available: number;
  opening: number;
  curve: CashCurvePoint[];
}) {
  const base = Math.max(Math.abs(cashNow), 0.01);
  const freePct = Math.max(0, Math.min(100, (Math.max(available, 0) / base) * 100));
  const owedPct = Math.max(0, Math.min(100, (Math.max(payLater, 0) / base) * 100));
  const freeShare = freePct + owedPct > 0 ? (freePct / (freePct + owedPct)) * 100 : 100;
  const owedShare = 100 - freeShare;
  const tone = available < 0 ? "text-debit" : "text-credit";

  const growth = toMoney(cashNow - opening);
  const growthPct =
    Math.abs(opening) >= 0.005 ? (growth / Math.abs(opening)) * 100 : null;
  const growthUp = growth >= 0;
  const growthTone = growthUp ? "text-credit" : "text-debit";
  const curveStroke = growthUp ? "var(--credit)" : "var(--debit)";
  const lastKey = curve.length ? curve[curve.length - 1]!.key : "";
  const tickKeys =
    curve.length <= 2
      ? curve.map((p) => p.key)
      : [
          curve[0]!.key,
          curve[Math.floor((curve.length - 1) / 2)]!.key,
          curve[curve.length - 1]!.key,
        ];

  return (
    <section
      className="overflow-hidden rounded-[var(--radius-xl)] border border-credit/30 bg-gradient-to-b from-credit-bg to-surface"
      aria-label="Available cashflow"
    >
      <div className="p-3.5 sm:p-4">
        <p className="text-xs font-semibold text-muted-label">Available cashflow</p>
        <p
          className={`mt-0.5 font-num text-[clamp(1.75rem,9vw,2.5rem)] font-extrabold leading-tight tracking-tight ${tone}`}
        >
          <small className="mr-1.5 text-[0.42em] font-bold text-muted-label">
            {currency.toUpperCase()}
          </small>
          {formatMoneyAmountOnly(toMoney(Math.abs(available)))}
        </p>
        <p className="mt-1 text-xs text-muted-label">
          Cash now {formatUnsignedAmount(cashNow, currency)} − pay later{" "}
          {formatUnsignedAmount(payLater, currency)}
        </p>

        {curve.length >= 2 ? (
          <div className="mt-3.5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs font-semibold text-muted-label">Growth this period</p>
              <p className={`font-num text-sm font-bold tabular-nums ${growthTone}`}>
                {growthUp ? "+" : "\u2212"}
                {formatMoneyAmountOnly(toMoney(Math.abs(growth)))}
                {growthPct != null ? (
                  <span className="ml-1.5 font-semibold">
                    {growthUp ? "+" : "\u2212"}
                    {Math.abs(growthPct).toFixed(1)}%
                  </span>
                ) : null}
              </p>
            </div>
            <div className="mt-1.5 h-[7.25rem] w-full" role="img" aria-label="Cash growth this period">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={curve}
                  margin={{ top: 8, right: 6, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="heroCashFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={curveStroke} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={curveStroke} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <YAxis hide domain={["dataMin", "dataMax"]} padding={{ top: 8, bottom: 4 }} />
                  <XAxis
                    dataKey="key"
                    ticks={tickKeys}
                    tickFormatter={(k: string) =>
                      curve.find((p) => p.key === k)?.day ?? k
                    }
                    interval={0}
                    tickLine={false}
                    axisLine={{
                      stroke: "var(--border)",
                      strokeDasharray: "4 4",
                    }}
                    tick={{
                      fill: "var(--muted-label)",
                      fontSize: 11,
                      fontFamily: "var(--font-num)",
                    }}
                    tickMargin={6}
                    height={22}
                  />
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke={curveStroke}
                    strokeWidth={2.25}
                    fill="url(#heroCashFill)"
                    isAnimationActive={false}
                    activeDot={false}
                    dot={(props: {
                      cx?: number;
                      cy?: number;
                      payload?: CashCurvePoint;
                    }) => {
                      const { cx, cy, payload } = props;
                      if (cx == null || cy == null || !payload || payload.key !== lastKey) {
                        return <g key={`dot-${payload?.key ?? "x"}`} />;
                      }
                      return (
                        <circle
                          key={`end-${payload.key}`}
                          cx={cx}
                          cy={cy}
                          r={5}
                          fill="var(--surface)"
                          stroke={curveStroke}
                          strokeWidth={2.5}
                        />
                      );
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : null}

        <div
          className="mt-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-border"
          role="img"
          aria-label={`${freeShare.toFixed(0)}% free to use, ${owedShare.toFixed(0)}% owed soon`}
        >
          <i className="block h-full bg-credit" style={{ width: `${freeShare}%` }} />
          <i
            className="block h-full bg-[var(--action-active)]"
            style={{ width: `${owedShare}%` }}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-credit" />
            Free{" "}
            <b className="font-num font-bold tabular-nums">
              {formatMoneyAmountOnly(toMoney(Math.max(available, 0)))}
            </b>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--action-active)]" />
            Owed soon{" "}
            <b className="font-num font-bold tabular-nums">
              {formatMoneyAmountOnly(toMoney(Math.max(payLater, 0)))}
            </b>
          </span>
        </div>
      </div>
    </section>
  );
}

function LedgerMonth({
  title,
  caption,
  currency,
  pnl,
  pnlPrev,
  forexGain,
  avgDailySpend,
}: {
  title: string;
  caption: string;
  currency: string;
  pnl: PnlSlice;
  pnlPrev: PnlSlice | null;
  forexGain: number;
  avgDailySpend: number;
}) {
  const income = pnl.total_income;
  const expenses = pnl.total_expenses;
  const net = pnl.net;
  const netIncl = net + forexGain;
  const keptPct = income > 0.005 ? Math.round((net / income) * 100) : 0;
  const spentPct = Math.max(0, 100 - keptPct);
  const keptTrack = income > 0.005 ? Math.max(0, Math.min(100, (net / income) * 100)) : 0;

  return (
    <section className="overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface">
      <header className="flex items-baseline justify-between gap-2 px-3.5 pb-2 pt-3 sm:px-4">
        <h2 className="text-section text-ink">{title}</h2>
        <span className="text-caption">{caption}</span>
      </header>
      <table className="w-full border-collapse text-sm">
        <tbody>
          <LedgerRow
            name="Income"
            note={
              pnlPrev
                ? `Prior ${formatMoneyAmountOnly(toMoney(pnlPrev.total_income))}`
                : undefined
            }
            amount={formatSignedAmount(income, currency, "credit")}
            amountClass="text-credit"
            chip={
              pnlPrev ? (
                <PctChangeTag
                  current={income}
                  prior={pnlPrev.total_income}
                  higherIsBetter
                  className="ml-1.5"
                />
              ) : null
            }
          />
          <LedgerRow
            name="Expenses"
            note={
              pnlPrev
                ? `Prior ${formatMoneyAmountOnly(toMoney(pnlPrev.total_expenses))}`
                : undefined
            }
            amount={formatSignedAmount(-expenses, currency, "debit")}
            amountClass="text-debit"
            chip={
              pnlPrev ? (
                <PctChangeTag
                  current={expenses}
                  prior={pnlPrev.total_expenses}
                  higherIsBetter={false}
                  className="ml-1.5"
                />
              ) : null
            }
          />
          <LedgerRow
            name="Net"
            note={
              pnlPrev ? `Prior ${formatMoneyAmountOnly(toMoney(pnlPrev.net))}` : undefined
            }
            amount={formatSignedAmount(net, currency, "auto")}
            amountClass={net < 0 ? "text-debit" : "text-credit"}
            chip={
              pnlPrev ? (
                <PctChangeTag
                  current={net}
                  prior={pnlPrev.net}
                  higherIsBetter
                  className="ml-1.5"
                />
              ) : null
            }
            total
          />
          <LedgerRow
            name="Forex gain"
            note="Gain from exchange-rate moves"
            amount={formatSignedAmount(forexGain, currency, "auto")}
            amountClass={forexGain < 0 ? "text-debit" : "text-credit"}
          />
          <LedgerRow
            name="Net incl. forex"
            amount={formatSignedAmount(netIncl, currency, "auto")}
            amountClass={netIncl < 0 ? "text-debit" : "text-credit"}
            total
          />
        </tbody>
      </table>
      <div className="border-t border-border px-3.5 py-2.5 sm:px-4">
        <div className="mb-1.5 flex justify-between gap-2 text-xs font-semibold">
          <span>Kept {keptPct}% of income</span>
          <span className="tabular-nums">Spent {spentPct}%</span>
        </div>
        <div
          className="flex h-2 overflow-hidden rounded-full bg-debit-bg"
          role="img"
          aria-label={`${keptPct}% kept, ${spentPct}% spent`}
        >
          <i className="block h-full bg-credit" style={{ width: `${keptTrack}%` }} />
        </div>
      </div>
      <div className="flex items-baseline justify-between gap-2 border-t border-border bg-[var(--action)]/10 px-3.5 py-2.5 sm:px-4">
        <span className="text-sm font-semibold text-ink">Avg spend / day</span>
        <b className="font-num text-lg font-bold tabular-nums text-action">
          {formatUnsignedAmount(avgDailySpend, currency)}
        </b>
      </div>
    </section>
  );
}

function LedgerRow({
  name,
  note,
  amount,
  amountClass,
  chip,
  total,
}: {
  name: string;
  note?: string;
  amount: string;
  amountClass: string;
  chip?: React.ReactNode;
  total?: boolean;
}) {
  return (
    <tr className={total ? "bg-neutral-bg/60" : undefined}>
      <td
        className={`px-3.5 py-2.5 align-middle sm:px-4 ${total ? "border-t border-ink/20 font-bold" : "border-t border-border font-semibold"}`}
      >
        {name}
        {note ? (
          <span className="mt-0.5 block text-[11px] font-normal tabular-nums text-muted-label">
            {note}
          </span>
        ) : null}
      </td>
      <td
        className={`whitespace-nowrap px-3.5 py-2.5 text-right align-middle font-num font-semibold tabular-nums sm:px-4 ${amountClass} ${total ? "border-t border-ink/20" : "border-t border-border"}`}
      >
        {amount}
        {chip}
      </td>
    </tr>
  );
}

type WfLine = {
  name: string;
  value: number;
  kind: "total" | "delta";
  key?: boolean;
  final?: boolean;
  detail: string;
  /** Native MVR/USD holdings for this line (not FX conversion of the display total). */
  dual?: DualCcy;
};

function DualComposition({
  dual,
  signed,
}: {
  dual: DualCcy;
  /** When true, show − for negative legs */
  signed?: boolean;
}) {
  const fmt = (n: number) => {
    const abs = formatMoneyAmountOnly(toMoney(Math.abs(n)));
    if (!signed) return abs;
    if (n < 0) return `\u2212${abs}`;
    if (n > 0) return `+${abs}`;
    return abs;
  };
  return (
    <span className="mt-0.5 block text-[11px] font-normal tabular-nums leading-snug text-muted-label">
      MVR {fmt(dual.mvr)} · USD {fmt(dual.usd)}
    </span>
  );
}

function CashWaterfall({
  currency,
  path,
}: {
  currency: string;
  path: CashPath;
}) {
  const lines: WfLine[] = [
    {
      name: "Opening",
      value: path.opening,
      kind: "total",
      detail:
        "Cash you had at the start of the period. MVR · USD is how much you actually held in each currency (not an exchange of the total).",
      dual: path.native.opening,
    },
    {
      name: "Added",
      value: path.added,
      kind: "delta",
      detail:
        "Money that came in during the period (income, collections, positive adjustments), split by the currency of the accounts it landed in.",
      dual: path.native.added,
    },
    {
      name: "Spent",
      value: -path.spent,
      kind: "delta",
      detail:
        "Money that went out during the period (expenses, repayments, negative adjustments), split by the currency of the accounts it left.",
      dual: path.native.spent,
    },
    {
      name: "Forex gain",
      value: path.forex,
      kind: "delta",
      detail: "Profit (or loss) from exchanging currencies vs Settings USD/MVR rates.",
    },
    {
      name: "Rate effect",
      value: path.rateEffect,
      kind: "delta",
      detail:
        "Change in display-currency value of balances from exchange-rate moves and timing.",
    },
    {
      name: "Cash now",
      value: path.cashNow,
      kind: "total",
      key: true,
      detail:
        "Total cash you hold now. MVR · USD is current native account balances. Opening + added − spent + forex + rate effect.",
      dual: path.native.cashNow,
    },
    {
      name: "Pay later",
      value: -path.payLater,
      kind: "delta",
      detail: "Open bills not yet paid, by each bill’s own currency.",
      dual: path.native.payLater,
    },
    {
      name: "Available cashflow",
      value: path.available,
      kind: "total",
      key: true,
      final: true,
      detail:
        "Cash you can actually use: cash now − pay later, in each currency (native MVR and USD).",
      dual: path.native.available,
    },
  ];

  return (
    <section className="overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface">
      <header className="flex items-baseline justify-between gap-2 px-3.5 pb-2 pt-3 sm:px-4">
        <h2 className="text-section text-ink">Cash this period</h2>
        <span className="text-caption">Tap a line for details</span>
      </header>
      <ol className="m-0 list-none p-0">
        {lines.map((r) => {
          const isDelta = r.kind === "delta";
          const amtClass = r.final
            ? "text-credit"
            : isDelta
              ? r.value >= 0
                ? "text-credit"
                : "text-debit"
              : "text-ink";
          const sign = isDelta ? (r.value >= 0 ? "+" : "\u2212") : "";
          return (
            <li
              key={r.name}
              className={`border-t border-border ${r.key ? "bg-neutral-bg/50" : ""} ${r.final ? "border-t-[1.5px] border-ink bg-credit-bg" : ""}`}
            >
              <details>
                <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-3.5 py-2.5 marker:content-none sm:px-4 [&::-webkit-details-marker]:hidden">
                  <span
                    className={`min-w-0 font-semibold ${r.key || r.final ? "text-[15px]" : "text-sm"} text-ink`}
                  >
                    {r.name}
                    <span className="ml-1.5 text-[11px] font-normal text-muted-label">ⓘ</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span
                      className={`block whitespace-nowrap font-num font-bold tabular-nums ${r.key || r.final ? "text-[15px]" : "text-sm"} ${amtClass}`}
                    >
                      {sign}
                      {formatMoneyAmountOnly(toMoney(Math.abs(r.value)))}
                    </span>
                    {r.dual ? <DualComposition dual={r.dual} signed={isDelta} /> : null}
                  </span>
                </summary>
                <p className="m-0 px-3.5 pb-2.5 text-xs text-muted-label sm:px-4">{r.detail}</p>
              </details>
            </li>
          );
        })}
      </ol>
      <p className="border-t border-border px-3.5 py-2 text-[11px] text-muted-label sm:px-4">
        Main figure in {currency.toUpperCase()} · MVR · USD below = native holdings, not exchange
      </p>
    </section>
  );
}

function NetWorthCard({
  currency,
  asOf,
  value,
}: {
  currency: string;
  asOf: string;
  value: number;
}) {
  return (
    <section className="overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface">
      <header className="flex items-baseline justify-between gap-2 px-3.5 pb-2 pt-3 sm:px-4">
        <h2 className="text-section text-ink">Net worth</h2>
        <span className="text-caption">As of {asOf}</span>
      </header>
      <div className="px-3.5 pb-3 sm:px-4">
        <p
          className={`font-num text-2xl font-extrabold tracking-tight ${value < 0 ? "text-debit" : "text-ink"}`}
        >
          {formatSignedAmount(value, currency, value < 0 ? "debit" : "auto")}
        </p>
        <details className="mt-1.5">
          <summary className="cursor-pointer list-none text-xs font-semibold text-action marker:content-none [&::-webkit-details-marker]:hidden">
            What is this?
          </summary>
          <p className="mt-1 text-xs text-muted-label">
            Everything you own minus everything you owe (cash, receivables, payables, debts).
            Negative means debts are larger than assets.
          </p>
        </details>
      </div>
    </section>
  );
}

export function DashboardFinanceCards({
  currency,
  periodTitle,
  priorCaption,
  asOfLabel,
  pnl,
  pnlPrev,
  forexGain,
  avgDailySpend,
  cashPath,
  cashCurve,
  netWorth,
}: {
  currency: string;
  periodTitle: string;
  priorCaption: string;
  asOfLabel: string;
  pnl: PnlSlice | null;
  pnlPrev: PnlSlice | null;
  forexGain: number;
  avgDailySpend: number;
  cashPath: CashPath | null;
  cashCurve: CashCurvePoint[];
  netWorth: number;
}) {
  const available = cashPath?.available ?? 0;
  const cashNow = cashPath?.cashNow ?? 0;
  const payLater = cashPath?.payLater ?? 0;
  const opening = cashPath?.opening ?? 0;

  return (
    <div className="space-y-2.5">
      {cashPath ? (
        <HeroAvailable
          currency={currency}
          cashNow={cashNow}
          payLater={payLater}
          available={available}
          opening={opening}
          curve={cashCurve}
        />
      ) : null}

      {pnl ? (
        <LedgerMonth
          title={periodTitle}
          caption={priorCaption}
          currency={currency}
          pnl={pnl}
          pnlPrev={pnlPrev}
          forexGain={forexGain}
          avgDailySpend={avgDailySpend}
        />
      ) : null}

      {cashPath ? <CashWaterfall currency={currency} path={cashPath} /> : null}

      <NetWorthCard currency={currency} asOf={asOfLabel} value={netWorth} />
    </div>
  );
}
