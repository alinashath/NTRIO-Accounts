import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch } from "@/api/http";
import { DisplayAmountCell } from "@/components/DisplayAmountCell";
import { Card } from "@/components/ui";
import { useDisplayCurrency } from "@/context/DisplayCurrencyContext";
import { formatMoney } from "@/lib/money";
import type { CategoryDetailDto } from "../../../shared/types";

function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

export function ReportsCategoryDetailPage() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const [searchParams] = useSearchParams();
  const { displayCurrency } = useDisplayCurrency();

  const kind = (searchParams.get("kind") === "income" ? "income" : "expense") as "income" | "expense";
  const from = searchParams.get("from") ?? format(new Date(new Date().getFullYear(), 0, 1), "yyyy-MM-dd");
  const to = searchParams.get("to") ?? format(new Date(), "yyyy-MM-dd");

  const [data, setData] = useState<CategoryDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const uncategorized = categoryId === "uncategorized";

  const detailUrl = useMemo(() => {
    const q = new URLSearchParams();
    q.set("from", from);
    q.set("to", to);
    q.set("kind", kind);
    q.set("display_currency", displayCurrency);
    if (uncategorized) q.set("uncategorized", "true");
    else if (categoryId) q.set("category_id", categoryId);
    return `/api/reports/category-detail?${q.toString()}`;
  }, [categoryId, displayCurrency, from, kind, to, uncategorized]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!categoryId) return;
      if (!uncategorized && !isUuid(categoryId)) {
        setError("Invalid category id.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch<CategoryDetailDto>(detailUrl);
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [categoryId, detailUrl, uncategorized]);

  const backHref = `/reports/pnl?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

  return (
    <div className="space-y-6">
      <div>
        <Link to={backHref} className="text-sm font-medium text-sky-700 hover:underline">
          ← P &amp; L
        </Link>
        <h3 className="mt-1 text-base font-semibold text-slate-900">
          {loading ? "Loading…" : data ? `${data.name} (${data.kind})` : "Category"}
        </h3>
        <p className="text-xs text-slate-500">
          {from} → {to}
        </p>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {data && !loading ? (
        <>
          <Card>
            <h4 className="text-sm font-semibold text-slate-900">Trend by month</h4>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.trend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => formatMoney(v, displayCurrency)} />
                  <Line
                    type="monotone"
                    dataKey="total"
                    stroke={data.kind === "income" ? "#16a34a" : "#f97316"}
                    strokeWidth={2}
                    dot={false}
                    name="Total"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <h4 className="text-sm font-semibold text-slate-900">Transactions</h4>
            <div className="mt-3 max-h-[min(50vh,400px)] overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Description</th>
                    <th className="py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.transactions.map((t) => (
                    <tr key={`${t.kind}-${t.id}`} className="border-b border-slate-100">
                      <td className="py-2 pr-3 whitespace-nowrap text-slate-700">{t.date}</td>
                      <td className="py-2 pr-3 text-slate-800">{t.description ?? "—"}</td>
                      <td className="py-2 text-right">
                        <DisplayAmountCell
                          amount={t.amount}
                          nativeCurrency={t.currency}
                          className={t.kind === "income" ? "text-emerald-700" : "text-orange-700"}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.transactions.length ? (
                <p className="py-4 text-center text-sm text-slate-500">No transactions in this range.</p>
              ) : null}
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
