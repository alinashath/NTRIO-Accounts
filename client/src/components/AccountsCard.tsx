import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Amount, PanelCard, SegmentedControl } from "@/components/design";
import { convertWithUsdMvrRate } from "@/lib/displayFx";
import { formatCaptionAmount, formatUnsignedAmount } from "@/lib/amountFormat";
import type { AccountDto, AccountType } from "../../../shared/types";

type FilterKey = "All" | "Bank" | "Cash" | "Wallet";

const FILTERS: { value: FilterKey; label: string }[] = [
  { value: "All", label: "All" },
  { value: "Bank", label: "Bank" },
  { value: "Cash", label: "Cash" },
  { value: "Wallet", label: "Wallet" },
];

const TYPE_LABEL: Record<AccountType, FilterKey> = {
  bank: "Bank",
  cash: "Cash",
  wallet: "Wallet",
};

type Prepared = {
  account: AccountDto;
  displayBalance: number;
  share: number;
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

  const prepared = useMemo<Prepared[]>(() => {
    const rows = accounts.map((account) => ({
      account,
      displayBalance: convertWithUsdMvrRate(
        account.balance,
        account.currency,
        displayCurrency,
        usdMvrRate,
      ),
      share: 0,
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

  return (
    <PanelCard title="Accounts" href="/accounts/ledger" className={className}>
      <div className="px-4 pb-3">
        <p className="text-amount-lg text-ink">
          {formatUnsignedAmount(totalDisplay, displayCurrency)}
        </p>
        <p className="mt-0.5 text-caption">{formatCaptionAmount(totalAlt, altCurrency)}</p>
        {prepared.length ? (
          <p className="mt-2 text-caption">
            MVR {held.mvrPct.toFixed(0)}% · USD {held.usdPct.toFixed(0)}% held
          </p>
        ) : null}

        {prepared.length ? (
          <div className="mt-3">
            <SegmentedControl
              aria-label="Filter by type"
              value={filter}
              onChange={setFilter}
              options={FILTERS}
              className="w-full [&>button]:flex-1"
            />
          </div>
        ) : null}
      </div>

      {filtered.length ? (
        <ul>
          {filtered.map((r) => {
            const { account } = r;
            const native = account.currency.toUpperCase();
            const display = displayCurrency.toUpperCase();
            return (
              <li key={account.id} className="border-t border-border">
                <Link
                  to={`/accounts/ledger/${account.id}`}
                  className="flex min-h-11 items-center gap-3 px-4 py-3 touch-manipulation"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{account.name}</p>
                    <p className="mt-0.5 text-caption">
                      {TYPE_LABEL[account.type]} · {native} · {r.share.toFixed(0)}% of total
                    </p>
                  </div>
                  <Amount
                    value={r.displayBalance}
                    currency={displayCurrency}
                    tone="plain"
                    signed={false}
                    captionValue={
                      native !== display
                        ? account.balance
                        : convertWithUsdMvrRate(
                            r.displayBalance,
                            displayCurrency,
                            altCurrency,
                            usdMvrRate,
                          )
                    }
                    captionCurrency={native !== display ? native : altCurrency}
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-4 pb-4 text-caption">
          {accounts.length ? "No accounts in this filter." : "No accounts yet."}
        </p>
      )}
    </PanelCard>
  );
}
