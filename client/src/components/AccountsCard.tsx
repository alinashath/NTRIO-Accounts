import { useMemo, useState } from "react";
import { Banknote, Landmark, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { chartTheme } from "@/lib/chartTheme";
import { convertWithUsdMvrRate } from "@/lib/displayFx";
import { formatMoney, formatMoneyAmountOnly, toMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { AccountDto, AccountType } from "../../../shared/types";

type FilterKey = "All" | "Bank" | "Cash" | "Wallet";

const FILTERS: FilterKey[] = ["All", "Bank", "Cash", "Wallet"];

const TYPE_LABEL: Record<AccountType, FilterKey> = {
  bank: "Bank",
  cash: "Cash",
  wallet: "Wallet",
};

function TypeIcon({ type }: { type: AccountType }) {
  const cls = "h-5 w-5 text-white";
  if (type === "cash") return <Banknote className={cls} aria-hidden strokeWidth={1.8} />;
  if (type === "wallet") return <Wallet className={cls} aria-hidden strokeWidth={1.8} />;
  return <Landmark className={cls} aria-hidden strokeWidth={1.8} />;
}

function colorForAccount(index: number): string {
  return chartTheme.categories[index % chartTheme.categories.length]!;
}

type Prepared = {
  account: AccountDto;
  displayBalance: number;
  share: number;
  color: string;
  index: number;
};

export function AccountsCard({
  accounts,
  displayCurrency,
  usdMvrRate,
  className,
}: {
  accounts: AccountDto[];
  displayCurrency: string;
  usdMvrRate: number;
  className?: string;
}) {
  const [filter, setFilter] = useState<FilterKey>("All");
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const prepared = useMemo<Prepared[]>(() => {
    const rows = accounts.map((account, index) => ({
      account,
      displayBalance: convertWithUsdMvrRate(
        account.balance,
        account.currency,
        displayCurrency,
        usdMvrRate,
      ),
      share: 0,
      color: colorForAccount(index),
      index,
    }));
    const totalAbs = rows.reduce((s, r) => s + Math.abs(r.displayBalance), 0);
    for (const r of rows) {
      r.share = totalAbs > 0 ? (Math.abs(r.displayBalance) / totalAbs) * 100 : 0;
    }
    return rows.sort((a, b) => Math.abs(b.displayBalance) - Math.abs(a.displayBalance));
  }, [accounts, displayCurrency, usdMvrRate]);

  const totalDisplay = useMemo(
    () => prepared.reduce((s, r) => s + r.displayBalance, 0),
    [prepared],
  );

  const altCurrency = displayCurrency.toUpperCase() === "MVR" ? "USD" : "MVR";
  const totalAlt = convertWithUsdMvrRate(
    totalDisplay,
    displayCurrency,
    altCurrency,
    usdMvrRate,
  );

  const held = useMemo(() => {
    let mvr = 0;
    let usd = 0;
    for (const r of prepared) {
      const ccy = r.account.currency.toUpperCase();
      if (ccy === "USD") usd += Math.abs(r.displayBalance);
      else if (ccy === "MVR") mvr += Math.abs(r.displayBalance);
    }
    const denom = mvr + usd;
    return {
      mvrPct: denom > 0 ? (mvr / denom) * 100 : 0,
      usdPct: denom > 0 ? (usd / denom) * 100 : 0,
    };
  }, [prepared]);

  const filtered = useMemo(() => {
    if (filter === "All") return prepared;
    return prepared.filter((r) => TYPE_LABEL[r.account.type] === filter);
  }, [filter, prepared]);

  const toggleHighlight = (id: string) => {
    setHighlightId((cur) => (cur === id ? null : id));
  };

  return (
    <Card className={cn("gap-0 overflow-hidden", className)}>
      <CardHeader className="gap-0 pb-0">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base tracking-tight sm:text-[18px]">Accounts</CardTitle>
          <Link
            to="/accounts"
            className="shrink-0 py-1 text-[13px] font-semibold text-[#0b7a87] transition hover:opacity-80"
          >
            View all
          </Link>
        </div>

        <div className="pt-1.5">
          <p className="text-[12.5px] text-muted-foreground">Total balance</p>
          <p className="mt-0.5 text-[34px] font-bold leading-[1.1] tracking-tight tabular-nums text-foreground">
            <span className="mr-1.5 text-sm font-medium tracking-normal text-muted-foreground">
              {displayCurrency}
            </span>
            {formatMoneyAmountOnly(totalDisplay)}
          </p>
          <p className="mt-0.5 text-[13px] text-muted-foreground tabular-nums">
            ≈ {formatMoney(totalAlt, altCurrency)}
          </p>
        </div>

        {prepared.length ? (
          <>
            <div
              className="mt-3.5 flex h-3 gap-[3px]"
              aria-hidden
            >
              {prepared.map((r) => {
                const active =
                  (filter === "All" || TYPE_LABEL[r.account.type] === filter) &&
                  (highlightId === null || highlightId === r.account.id);
                return (
                  <div
                    key={r.account.id}
                    className="min-w-1 rounded transition-opacity duration-150"
                    style={{
                      flex: Math.max(Math.abs(r.displayBalance), 0.01),
                      background: r.color,
                      opacity: active ? 1 : 0.18,
                    }}
                  />
                );
              })}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted-foreground">
              <span>
                Held in MVR{" "}
                <b className="font-semibold tabular-nums text-foreground">
                  {held.mvrPct.toFixed(0)}%
                </b>
              </span>
              <span>
                Held in USD{" "}
                <b className="font-semibold tabular-nums text-foreground">
                  {held.usdPct.toFixed(0)}%
                </b>
              </span>
            </div>
          </>
        ) : null}

        {prepared.length ? (
          <div
            className="-mx-1 mt-3.5 flex gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="group"
            aria-label="Filter by type"
          >
            {FILTERS.map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                onClick={() => {
                  setFilter(key);
                  setHighlightId(null);
                }}
                className={cn(
                  "h-8 shrink-0 cursor-pointer touch-manipulation rounded-full border px-3.5 text-[13px] font-semibold transition duration-150",
                  filter === key
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {key}
              </button>
            ))}
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="px-4 pb-2.5 pt-1.5">
        {filtered.length ? (
          <ul>
            {filtered.map((r) => {
              const { account } = r;
              const native = account.currency.toUpperCase();
              const display = displayCurrency.toUpperCase();
              const dim = highlightId !== null && highlightId !== account.id;
              return (
                <li
                  key={account.id}
                  className={cn(
                    "border-t border-border/80 first:border-t-0",
                    dim && "opacity-40",
                  )}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleHighlight(account.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleHighlight(account.id);
                      }
                    }}
                    className="grid cursor-pointer grid-cols-[40px_1fr_auto] items-center gap-3 py-3.5 touch-manipulation"
                  >
                    <div
                      className="grid h-10 w-10 place-items-center rounded-xl"
                      style={{ background: r.color }}
                      aria-hidden
                    >
                      <TypeIcon type={account.type} />
                    </div>
                    <div className="min-w-0">
                      <Link
                        to={`/accounts/${account.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="block truncate font-medium text-foreground hover:underline"
                      >
                        {account.name}
                      </Link>
                      <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                        {TYPE_LABEL[account.type]}
                        <span className="mx-1">·</span>
                        {native}
                        <span className="mx-1">·</span>
                        {r.share.toFixed(0)}% of total
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[17px] font-bold tracking-tight tabular-nums text-foreground whitespace-nowrap">
                        <span className="mr-1 text-[11px] font-medium tracking-normal text-muted-foreground">
                          {display}
                        </span>
                        {formatMoneyAmountOnly(r.displayBalance)}
                      </p>
                      {native !== display ? (
                        <p className="mt-0.5 text-[12.5px] tabular-nums text-muted-foreground">
                          {formatMoney(toMoney(account.balance), native)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="py-4 text-sm text-muted-foreground">
            {accounts.length ? "No accounts in this filter." : "No accounts yet."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
