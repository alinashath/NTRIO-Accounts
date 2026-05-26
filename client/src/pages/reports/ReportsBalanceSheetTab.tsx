import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { apiFetch } from "@/api/http";
import { DisplayAmountCell } from "@/components/DisplayAmountCell";
import { Button, Card } from "@/components/ui";
import { useDisplayCurrency } from "@/context/DisplayCurrencyContext";
import { formatMoney } from "@/lib/money";
import type { AccountDto, AccountType, DebtDto } from "../../../shared/types";

type NetWorthRes = {
  as_of: string;
  display_currency?: string | null;
  cash_and_accounts: number;
  outstanding_i_owe: number;
  outstanding_owed_to_me: number;
  net_worth: number;
  pay_later_unpaid: number | null;
};

const accountTypeLabel = (t: AccountType) =>
  t === "bank" ? "Bank" : t === "cash" ? "Cash" : "Wallet";

export function ReportsBalanceSheetTab() {
  const { displayCurrency } = useDisplayCurrency();
  const today = new Date();
  const defaultAsOf = format(today, "yyyy-MM-dd");

  const [asOf, setAsOf] = useState(defaultAsOf);
  const [applied, setApplied] = useState(defaultAsOf);
  const [nw, setNw] = useState<NetWorthRes | null>(null);
  const [accounts, setAccounts] = useState<AccountDto[]>([]);
  const [debts, setDebts] = useState<DebtDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const dc = encodeURIComponent(displayCurrency);
    const a = applied;
    try {
      const [n, accs, d] = await Promise.all([
        apiFetch<NetWorthRes>(
          `/api/reports/net-worth?as_of=${encodeURIComponent(a)}&display_currency=${dc}`,
        ),
        apiFetch<AccountDto[]>("/api/accounts"),
        apiFetch<DebtDto[]>("/api/debts?status=open"),
      ]);
      setNw(n);
      setAccounts(accs);
      setDebts(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }, [applied, displayCurrency]);

  useEffect(() => {
    void load();
  }, [load]);

  const accountsByType = useMemo(() => {
    const m = new Map<AccountType, AccountDto[]>();
    for (const a of accounts) {
      const list = m.get(a.type) ?? [];
      list.push(a);
      m.set(a.type, list);
    }
    return m;
  }, [accounts]);

  const iOwe = useMemo(() => debts.filter((d) => d.direction === "i_owe" && d.outstanding > 0), [debts]);
  const owedToMe = useMemo(() => debts.filter((d) => d.direction === "owed_to_me" && d.outstanding > 0), [debts]);

  const totalAssetsFromNw = nw ? nw.cash_and_accounts + nw.outstanding_owed_to_me : 0;
  const totalLiabFromNw =
    nw != null ? nw.outstanding_i_owe + (nw.pay_later_unpaid != null ? nw.pay_later_unpaid : 0) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-slate-900">Balance sheet</h3>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="text-slate-600">As of</span>
            <input
              type="date"
              className="mt-1 block rounded-xl border border-slate-300 px-3 py-2 text-sm"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
            />
          </label>
          <Button type="button" onClick={() => setApplied(asOf)}>
            Apply
          </Button>
        </div>
      </Card>

      {nw ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <p className="text-xs uppercase text-slate-500">Cash &amp; accounts</p>
            <p className="mt-2 text-lg font-bold text-slate-900">
              {formatMoney(nw.cash_and_accounts, displayCurrency)}
            </p>
          </Card>
          <Card>
            <p className="text-xs uppercase text-slate-500">Owed to me</p>
            <p className="mt-2 text-lg font-bold text-slate-900">
              {formatMoney(nw.outstanding_owed_to_me, displayCurrency)}
            </p>
          </Card>
          <Card>
            <p className="text-xs uppercase text-slate-500">I owe + pay later</p>
            <p className="mt-2 text-lg font-bold text-orange-800">
              {formatMoney(
                nw.outstanding_i_owe + (nw.pay_later_unpaid ?? 0),
                displayCurrency,
              )}
            </p>
          </Card>
          <Card>
            <p className="text-xs uppercase text-slate-500">Net worth</p>
            <p className="mt-2 text-lg font-bold text-slate-900">{formatMoney(nw.net_worth, displayCurrency)}</p>
          </Card>
        </div>
      ) : null}

      <Card>
        <h3 className="text-sm font-semibold text-slate-900">Assets</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">Account</th>
                <th className="py-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {(["bank", "cash", "wallet"] as const).flatMap((type) => {
                const list = accountsByType.get(type) ?? [];
                return list.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 text-slate-500">{accountTypeLabel(type)}</td>
                    <td className="py-2 pr-3 text-slate-800">{a.name}</td>
                    <td className="py-2 text-right">
                      <DisplayAmountCell amount={a.balance} nativeCurrency={a.currency} className="font-medium" />
                    </td>
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>

        <h4 className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">Receivables (debts owed to you)</h4>
        <ul className="mt-2 divide-y divide-slate-100 text-sm">
          {owedToMe.length ? (
            owedToMe.map((d) => (
              <li key={d.id} className="flex justify-between gap-2 py-2">
                <span className="text-slate-700">{d.contact_name}</span>
                <DisplayAmountCell amount={d.outstanding} nativeCurrency={d.currency} className="font-medium" />
              </li>
            ))
          ) : (
            <li className="py-2 text-slate-500">No open receivables.</li>
          )}
        </ul>

        <p className="mt-4 border-t border-slate-100 pt-3 text-sm font-semibold text-slate-900">
          Total assets (summary):{" "}
          <span className="tabular-nums">{formatMoney(totalAssetsFromNw, displayCurrency)}</span>
        </p>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-slate-900">Liabilities</h3>
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {iOwe.length ? (
            iOwe.map((d) => (
              <li key={d.id} className="flex justify-between gap-2 py-2">
                <span className="text-slate-700">{d.contact_name}</span>
                <DisplayAmountCell amount={d.outstanding} nativeCurrency={d.currency} className="font-medium text-orange-800" />
              </li>
            ))
          ) : (
            <li className="py-2 text-slate-500">No open debts (I owe).</li>
          )}
          {nw && nw.pay_later_unpaid != null && nw.pay_later_unpaid > 0 ? (
            <li className="flex justify-between gap-2 py-2">
              <span className="text-slate-700">Pay later (unpaid bills)</span>
              <span className="font-medium tabular-nums text-orange-800">
                {formatMoney(nw.pay_later_unpaid, displayCurrency)}
              </span>
            </li>
          ) : null}
        </ul>
        <p className="mt-4 border-t border-slate-100 pt-3 text-sm font-semibold text-slate-900">
          Total liabilities (summary):{" "}
          <span className="tabular-nums">{formatMoney(totalLiabFromNw, displayCurrency)}</span>
        </p>
      </Card>
    </div>
  );
}
