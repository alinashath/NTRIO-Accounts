import clsx from "clsx";
import { NavLink, Outlet } from "react-router-dom";

const tabs = [
  { to: "/reports/pnl", label: "P & L" },
  { to: "/reports/cashflow", label: "Cash flow" },
  { to: "/reports/balance-sheet", label: "Balance sheet" },
] as const;

export default function ReportsLayout() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Reports</h2>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                "shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition touch-manipulation",
                isActive ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
              )
            }
          >
            {label}
          </NavLink>
        ))}
      </div>

      <Outlet />
    </div>
  );
}
