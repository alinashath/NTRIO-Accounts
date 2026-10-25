import { BedDouble, Package, UtensilsCrossed, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ListRow, PanelCard } from "@/components/design";

const workspaces = [
  {
    id: "accounts",
    title: "Accounts",
    description: "Income, expenses, debts, and financial reports",
    to: "/accounts",
    icon: Wallet,
  },
  {
    id: "occupancy",
    title: "Occupancy",
    description: "Stay calendar, rooms, and guest occupancy",
    to: "/occupancy",
    icon: BedDouble,
  },
  {
    id: "kitchen",
    title: "Kitchen",
    description: "Breakfast orders, server summary, KOT",
    to: "/kitchen",
    icon: UtensilsCrossed,
  },
  {
    id: "stock",
    title: "Stock",
    description: "Inventory, shopping list, and cost reports",
    to: "/stock",
    icon: Package,
  },
] as const;

export function HubPage() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[960px] flex-col px-4 pb-8 pt-[max(0.5rem,env(safe-area-inset-top,0px))]">
      <header className="-mx-4 mb-6 border-b border-border bg-surface px-4 py-4">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-ink">NTRIO</p>
        <h1 className="mt-1 text-page-title text-ink">Workspaces</h1>
        <p className="mt-1 text-caption">Accounts · Occupancy · Kitchen · Stock</p>
      </header>

      <div className="flex flex-col gap-4">
        <PanelCard title="Open">
          {workspaces.map((w) => {
            const Icon = w.icon;
            return (
              <ListRow
                key={w.id}
                primary={w.title}
                secondary={w.description}
                right={
                  <span
                    className="inline-flex min-h-11 min-w-11 items-center justify-center text-muted-label"
                    aria-hidden
                  >
                    <Icon className="h-5 w-5" strokeWidth={1.8} />
                  </span>
                }
                onClick={() => {
                  localStorage.setItem("ntrio_workspace", w.id);
                  navigate(w.to);
                }}
              />
            );
          })}
        </PanelCard>
      </div>
    </div>
  );
}
