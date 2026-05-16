"use client";

import clsx from "clsx";
import {
  ArrowLeftRight,
  BarChart3,
  LayoutDashboard,
  PlusCircle,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/new", label: "New", icon: PlusCircle },
  { href: "/balance-sheet", label: "Reports", icon: BarChart3 },
  { href: "/transactions", label: "Activity", icon: ArrowLeftRight },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-2">
        {links.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/"
              ? pathname === "/"
              : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex min-h-[56px] min-w-[64px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition",
                active ? "text-brand-600" : "text-muted",
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
