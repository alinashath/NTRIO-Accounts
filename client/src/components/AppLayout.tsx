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
    <div className="mx-auto flex min-h-[100dvh] max-w-5xl flex-col px-3 pb-[calc(3.75rem+env(safe-area-inset-bottom,0px))] pt-[max(0.35rem,env(safe-area-inset-top,0px))] md:px-4 md:pb-5 md:pt-2">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[200] focus:rounded-[var(--radius-md)] focus:bg-primary focus:px-3 focus:py-2 focus:text-xs focus:font-semibold focus:text-on-primary"
      >
        Skip to main content
      </a>

      <header className="mb-2 shrink-0 border-b border-border/70 pb-2">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-baseline gap-2">
              <p className="shrink-0 text-[10px] font-bold uppercase tracking-[0.12em] text-primary">
                NTrio
              </p>
              <h1 className="truncate text-sm font-bold tracking-tight text-foreground">Accounts</h1>
              {email ? (
                <p className="hidden truncate text-[11px] text-muted-foreground sm:block">{email}</p>
              ) : null}
            </div>
          </div>

          <div
            className="inline-flex shrink-0 rounded-[var(--radius-md)] border border-border bg-muted/50 p-0.5"
            role="group"
            aria-label="Display currency"
            title={`1 USD = ${globalUsdMvrRate.toFixed(4)} MVR`}
          >
            {(["USD", "MVR"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setDisplayCurrency(c)}
                className={clsx(
                  "h-7 touch-manipulation cursor-pointer rounded-[var(--radius-md)] px-2 text-xs font-medium transition duration-150",
                  displayCurrency === c
                    ? "bg-primary text-on-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {c}
              </button>
            ))}
          </div>

          <Button
            type="button"
            variant="ghost"
            className="shrink-0 gap-1 px-2"
            aria-label="Sign out"
            title="Sign out"
            onClick={() => void signOut()}
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>

        <nav className="mt-1.5 hidden gap-0.5 overflow-x-auto md:flex" aria-label="Primary">
          {links.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                clsx(
                  "inline-flex h-7 shrink-0 cursor-pointer items-center rounded-[var(--radius-md)] px-2 text-xs font-medium transition duration-150 touch-manipulation",
                  isActive
                    ? "bg-primary text-on-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main id="main-content" className="min-h-0 flex-1">
        {children}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-[150] border-t border-border bg-card pb-safe md:hidden"
        aria-label="Main"
      >
        <div className="mx-auto flex max-w-lg justify-between gap-0.5 overflow-x-auto px-1 py-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                clsx(
                  "flex min-h-11 min-w-9 shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[var(--radius-md)] px-1 py-1 text-[10px] font-medium leading-tight touch-manipulation transition duration-150",
                  isActive ? "bg-muted text-foreground" : "text-muted-foreground",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className="h-3.5 w-3.5" strokeWidth={isActive ? 2.25 : 2} aria-hidden />
                  <span className="max-w-[3.5rem] truncate">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
