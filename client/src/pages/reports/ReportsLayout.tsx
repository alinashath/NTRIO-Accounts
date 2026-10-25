import clsx from "clsx";
import { NavLink, Outlet } from "react-router-dom";

const tabs = [
  { to: "/accounts/reports/pnl", label: "P&L" },
  { to: "/accounts/reports/cashflow", label: "Cash flow" },
  { to: "/accounts/reports/balance-sheet", label: "Balance sheet" },
] as const;

export default function ReportsLayout() {
  return (
    <div className="space-y-3">
      <div
        className="flex gap-0.5 overflow-x-auto rounded-[var(--radius-md)] border border-border/80 bg-muted/40 p-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Report type"
      >
        {tabs.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                "h-7 shrink-0 cursor-pointer touch-manipulation rounded-[var(--radius-md)] px-2.5 text-xs font-medium leading-7 transition duration-150",
                isActive
                  ? "bg-primary text-on-primary"
                  : "text-muted-foreground hover:bg-card hover:text-foreground",
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
