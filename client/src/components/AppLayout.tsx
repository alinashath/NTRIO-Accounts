import clsx from "clsx";
import {
  BarChart3,
  CreditCard,
  Home,
  LogOut,
  Settings,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/auth";
import { useDisplayCurrency } from "@/context/DisplayCurrencyContext";
import { Button } from "@/components/ui";

const links = [
  { to: "/", label: "Home", icon: Home },
  { to: "/accounts", label: "Accounts", icon: Wallet },
  { to: "/contacts", label: "Contacts", icon: Users },
  { to: "/income", label: "Income", icon: TrendingUp },
  { to: "/expenses", label: "Spend", icon: TrendingDown },
  { to: "/debts", label: "Debts", icon: CreditCard },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const email = useAuthStore((s) => s.session?.user.email);
  const { displayCurrency, setDisplayCurrency, globalUsdMvrRate } = useDisplayCurrency();

  async function signOut() {
    await supabase.auth.signOut();
    useAuthStore.getState().setSession(null);
    navigate("/login", { replace: true });
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-5xl flex-col px-3 pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))] pt-[max(0.75rem,env(safe-area-inset-top,0px))] md:px-4 md:pb-8 md:pt-4">
      <header className="mb-4 shrink-0 border-b border-slate-200 pb-3 md:mb-6 md:pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold text-slate-900 sm:text-xl">
              Income &amp; expense
            </h1>
            {email ? (
              <p className="mt-1 truncate text-xs text-slate-500/90 sm:text-sm">{email}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-600 sm:text-sm">
              <span className="font-medium text-slate-800">Display amounts in</span>
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
                {(["USD", "MVR"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setDisplayCurrency(c)}
                    className={`touch-manipulation rounded-full px-4 py-2.5 text-sm font-semibold transition active:scale-[0.98] min-h-11 min-w-[3.25rem] md:min-h-10 md:min-w-0 md:px-3 md:py-2 md:text-xs ${
                      displayCurrency === c ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <span className="w-full text-slate-500 sm:w-auto">1 USD = {globalUsdMvrRate.toFixed(4)} MVR</span>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="min-w-11 shrink-0 gap-1.5 px-3 sm:min-w-0"
            aria-label="Sign out"
            title="Sign out"
            onClick={() => void signOut()}
          >
            <LogOut className="h-5 w-5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>

        <nav className="mt-4 hidden flex-wrap gap-2 md:flex">
          {links.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                clsx(
                  "inline-flex min-h-11 items-center rounded-full px-3 py-2 text-sm font-medium transition touch-manipulation",
                  isActive
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50",
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="min-h-0 flex-1">{children}</main>

      <nav
        className="fixed inset-x-0 bottom-0 z-[150] border-t border-slate-200/90 bg-white/95 pb-safe shadow-[0_-4px_24px_-8px_rgba(15,23,42,0.12)] backdrop-blur-md md:hidden"
        aria-label="Main"
      >
        <div className="mx-auto flex max-w-lg justify-between gap-1 overflow-x-auto px-1 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                clsx(
                  "flex min-h-[3.25rem] min-w-[3.25rem] shrink-0 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-1.5 text-[11px] font-semibold leading-tight touch-manipulation active:opacity-80",
                  isActive ? "bg-slate-100 text-slate-900" : "text-slate-500",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className="h-6 w-6" strokeWidth={isActive ? 2.25 : 2} />
                  <span className="max-w-[4.5rem] truncate">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
