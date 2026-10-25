import clsx from "clsx";
import {
  BarChart3,
  BedDouble,
  BookOpen,
  CalendarDays,
  ClipboardList,
  CreditCard,
  Home,
  LayoutGrid,
  LogOut,
  MoreHorizontal,
  Package,
  Plus,
  Settings,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Users,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Modal } from "@/components/Modal";
import { SegmentedControl } from "@/components/design";
import { useDisplayCurrency } from "@/context/DisplayCurrencyContext";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/auth";

export type WorkspaceId = "accounts" | "kitchen" | "stock" | "occupancy";

export function WorkspaceLayout({
  workspace,
  children,
}: {
  workspace: WorkspaceId;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const { displayCurrency, setDisplayCurrency, globalUsdMvrRate } = useDisplayCurrency();
  const [moreOpen, setMoreOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const title =
    workspace === "accounts"
      ? "Accounts"
      : workspace === "kitchen"
        ? "Kitchen"
        : workspace === "occupancy"
          ? "Occupancy"
          : "Stock";

  async function signOut() {
    await supabase.auth.signOut();
    useAuthStore.getState().setSession(null);
    navigate("/login", { replace: true });
  }

  const moreItems =
    workspace === "accounts"
      ? [
          { to: "/accounts/contacts", label: "Contacts", icon: Users },
          { to: "/accounts/income", label: "Income", icon: TrendingUp },
          { to: "/accounts/expenses", label: "Spend", icon: TrendingDown },
          { to: "/accounts/debts", label: "Debts", icon: CreditCard },
          { to: "/accounts/settings", label: "Settings", icon: Settings },
          { to: "/", label: "Workspaces", icon: LayoutGrid },
        ]
      : workspace === "kitchen"
        ? [
            { to: "/occupancy", label: "Occupancy", icon: BedDouble },
            { to: "/stock", label: "Stock", icon: Package },
            { to: "/accounts", label: "Accounts", icon: Wallet },
            { to: "/", label: "Workspaces", icon: LayoutGrid },
          ]
        : workspace === "occupancy"
          ? [
              { to: "/kitchen", label: "Kitchen", icon: UtensilsCrossed },
              { to: "/stock", label: "Stock", icon: Package },
              { to: "/accounts", label: "Accounts", icon: Wallet },
              { to: "/", label: "Workspaces", icon: LayoutGrid },
            ]
          : [
              { to: "/occupancy", label: "Occupancy", icon: BedDouble },
              { to: "/kitchen", label: "Kitchen", icon: UtensilsCrossed },
              { to: "/accounts", label: "Accounts", icon: Wallet },
              { to: "/", label: "Workspaces", icon: LayoutGrid },
            ];

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[960px] flex-col px-4 pb-[calc(var(--nav-h)+env(safe-area-inset-bottom,0px))] pt-[max(0.5rem,env(safe-area-inset-top,0px))] md:pb-6">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-[200] focus:rounded-sm focus:bg-action focus:px-3 focus:py-2 focus:text-xs focus:font-semibold focus:text-white"
      >
        Skip to main content
      </a>

      <header className="-mx-4 mb-4 flex shrink-0 items-center gap-3 border-b border-border bg-surface px-4 py-3">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="min-w-0 flex-1 touch-manipulation text-left"
          aria-label="NTRIO workspaces"
        >
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-ink">NTRIO</p>
          <p className="mt-0.5 text-section text-ink">{title}</p>
        </button>

        {workspace === "accounts" ? (
          <div title={`1 USD = ${globalUsdMvrRate.toFixed(4)} MVR`}>
            <SegmentedControl
              aria-label="Display currency"
              value={displayCurrency}
              onChange={setDisplayCurrency}
              options={[
                { value: "USD", label: "USD" },
                { value: "MVR", label: "MVR" },
              ]}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => navigate("/")}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm border border-border text-ink hover:bg-neutral-bg"
            aria-label="Workspaces"
            title="Workspaces"
          >
            <LayoutGrid className="h-5 w-5" strokeWidth={1.8} aria-hidden />
          </button>
        )}
      </header>

      <nav className="mb-4 hidden gap-1 border-b border-border pb-3 md:flex" aria-label="Primary">
        {(workspace === "accounts"
          ? [
              { to: "/accounts", label: "Home", end: true as boolean },
              { to: "/accounts/ledger", label: "Accounts", end: false },
              { to: "/accounts/contacts", label: "Contacts", end: false },
              { to: "/accounts/income", label: "Income", end: false },
              { to: "/accounts/expenses", label: "Spend", end: false },
              { to: "/accounts/debts", label: "Debts", end: false },
              { to: "/accounts/reports", label: "Reports", end: false },
              { to: "/accounts/settings", label: "Settings", end: false },
            ]
          : workspace === "kitchen"
            ? [
                { to: "/kitchen", label: "Orders", end: true as boolean },
                { to: "/kitchen/summaries", label: "KOT", end: false },
                { to: "/kitchen/recipes", label: "Recipes", end: false },
              ]
            : workspace === "occupancy"
              ? [
                  { to: "/occupancy", label: "Stay view", end: true as boolean },
                  { to: "/occupancy/rooms", label: "Rooms", end: false },
                ]
              : [
                  { to: "/stock", label: "Inventory", end: true as boolean },
                  { to: "/stock/shopping", label: "Shopping", end: false },
                  { to: "/stock/reports", label: "Reports", end: false },
                ]
        ).map(({ to, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              clsx(
                "inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-sm px-3 text-sm font-medium touch-manipulation",
                isActive ? "bg-ink text-white" : "text-muted-label hover:bg-neutral-bg hover:text-ink",
              )
            }
          >
            {label}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => void signOut()}
          className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-sm px-3 text-sm font-medium text-muted-label hover:bg-neutral-bg hover:text-ink"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          Sign out
        </button>
      </nav>

      <main id="main-content" className="min-h-0 flex-1">
        {children}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-[150] h-[calc(var(--nav-h)+env(safe-area-inset-bottom,0px))] border-t border-border bg-surface pb-safe md:hidden"
        aria-label="Main"
      >
        <div
          className={clsx(
            "mx-auto grid h-[var(--nav-h)] max-w-[960px]",
            workspace === "accounts"
              ? "grid-cols-5"
              : workspace === "occupancy"
                ? "grid-cols-3"
                : "grid-cols-4",
          )}
        >
          {workspace === "accounts" ? (
            <>
              <BottomTab to="/accounts" end label="Home" icon={Home} />
              <BottomTab to="/accounts/ledger" label="Accounts" icon={Wallet} />
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="flex flex-col items-center justify-center gap-0.5 font-medium text-muted-label touch-manipulation"
                aria-label="Add transaction"
              >
                <Plus className="h-5 w-5" strokeWidth={1.8} aria-hidden />
                <span className="text-[11px] leading-none">Add</span>
              </button>
              <BottomTab to="/accounts/reports" label="Reports" icon={BarChart3} />
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                className={clsx(
                  "flex flex-col items-center justify-center gap-0.5 touch-manipulation",
                  moreOpen ? "font-semibold text-action" : "font-medium text-muted-label",
                )}
                aria-label="More"
              >
                <MoreHorizontal className="h-5 w-5" strokeWidth={1.8} aria-hidden />
                <span className="text-[11px] leading-none">More</span>
              </button>
            </>
          ) : workspace === "kitchen" ? (
            <>
              <BottomTab to="/kitchen" end label="Orders" icon={UtensilsCrossed} />
              <BottomTab to="/kitchen/summaries" label="KOT" icon={ClipboardList} />
              <BottomTab to="/kitchen/recipes" label="Recipes" icon={BookOpen} />
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                className={clsx(
                  "flex flex-col items-center justify-center gap-0.5 touch-manipulation",
                  moreOpen ? "font-semibold text-action" : "font-medium text-muted-label",
                )}
                aria-label="More"
              >
                <MoreHorizontal className="h-5 w-5" strokeWidth={1.8} aria-hidden />
                <span className="text-[11px] leading-none">More</span>
              </button>
            </>
          ) : workspace === "occupancy" ? (
            <>
              <BottomTab to="/occupancy" end label="Stays" icon={CalendarDays} />
              <BottomTab to="/occupancy/rooms" label="Rooms" icon={BedDouble} />
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                className={clsx(
                  "flex flex-col items-center justify-center gap-0.5 touch-manipulation",
                  moreOpen ? "font-semibold text-action" : "font-medium text-muted-label",
                )}
                aria-label="More"
              >
                <MoreHorizontal className="h-5 w-5" strokeWidth={1.8} aria-hidden />
                <span className="text-[11px] leading-none">More</span>
              </button>
            </>
          ) : (
            <>
              <BottomTab to="/stock" end label="Inventory" icon={Package} />
              <BottomTab to="/stock/shopping" label="Shopping" icon={ShoppingCart} />
              <BottomTab to="/stock/reports" label="Reports" icon={BarChart3} />
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                className={clsx(
                  "flex flex-col items-center justify-center gap-0.5 touch-manipulation",
                  moreOpen ? "font-semibold text-action" : "font-medium text-muted-label",
                )}
                aria-label="More"
              >
                <MoreHorizontal className="h-5 w-5" strokeWidth={1.8} aria-hidden />
                <span className="text-[11px] leading-none">More</span>
              </button>
            </>
          )}
        </div>
      </nav>

      {workspace === "accounts" ? (
        <Modal open={addOpen} title="Add transaction" onClose={() => setAddOpen(false)}>
          <div className="grid gap-2 p-1">
            <button
              type="button"
              className="flex min-h-11 items-center justify-between rounded-sm border border-border px-4 text-left text-sm font-semibold text-ink hover:bg-neutral-bg"
              onClick={() => {
                setAddOpen(false);
                navigate("/accounts/income");
              }}
            >
              Add income
              <TrendingUp className="h-4 w-4 text-credit" aria-hidden />
            </button>
            <button
              type="button"
              className="flex min-h-11 items-center justify-between rounded-sm border border-border px-4 text-left text-sm font-semibold text-ink hover:bg-neutral-bg"
              onClick={() => {
                setAddOpen(false);
                navigate("/accounts/expenses");
              }}
            >
              Add expense
              <TrendingDown className="h-4 w-4 text-debit" aria-hidden />
            </button>
          </div>
        </Modal>
      ) : null}

      <Modal open={moreOpen} title="More" onClose={() => setMoreOpen(false)}>
        <div className="grid gap-1">
          {moreItems.map(({ to, label, icon: Icon }) => (
            <button
              key={to}
              type="button"
              className="flex min-h-11 items-center gap-3 rounded-sm px-3 text-left text-sm font-medium text-ink hover:bg-neutral-bg"
              onClick={() => {
                setMoreOpen(false);
                navigate(to);
              }}
            >
              <Icon className="h-5 w-5 text-muted-label" strokeWidth={1.8} aria-hidden />
              {label}
            </button>
          ))}
          <button
            type="button"
            className="mt-2 flex min-h-11 items-center gap-3 rounded-sm border-t border-border px-3 pt-3 text-left text-sm font-medium text-debit hover:bg-debit-bg"
            onClick={() => {
              setMoreOpen(false);
              void signOut();
            }}
          >
            <LogOut className="h-5 w-5" strokeWidth={1.8} aria-hidden />
            Sign out
          </button>
        </div>
      </Modal>
    </div>
  );
}

function BottomTab({
  to,
  label,
  icon: Icon,
  end,
}: {
  to: string;
  label: string;
  icon: typeof Home;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        clsx(
          "flex flex-col items-center justify-center gap-0.5 touch-manipulation",
          isActive ? "font-semibold text-action" : "font-medium text-muted-label",
        )
      }
    >
      <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden />
      <span className="text-[11px] leading-none">{label}</span>
    </NavLink>
  );
}
