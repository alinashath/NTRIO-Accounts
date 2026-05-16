"use client";

import { BusinessSwitcher } from "@/components/business-switcher";
import { useAuth } from "@/components/auth-provider";
import Link from "next/link";
import { Settings } from "lucide-react";

export function AppHeader() {
  const { subscription } = useAuth();

  return (
    <header className="sticky top-0 z-40 mx-auto max-w-lg border-b border-border bg-surface/95 px-4 py-3 backdrop-blur-md pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="flex items-center gap-2">
        <BusinessSwitcher />
        <Link
          href="/settings"
          className="ml-auto flex h-10 w-10 items-center justify-center rounded-xl text-muted hover:bg-white hover:text-slate-900"
          aria-label="Settings"
        >
          <Settings className="h-5 w-5" />
        </Link>
      </div>
      {subscription && !subscription.is_active ? (
        <Link
          href="/subscribe"
          className="mt-2 block rounded-lg bg-amber-50 px-3 py-2 text-center text-xs font-medium text-amber-800"
        >
          Subscription expired — renew to continue
        </Link>
      ) : subscription?.status === "trialing" ? (
        <p className="mt-2 text-center text-xs text-muted">
          Trial · {subscription.plan_name} plan
        </p>
      ) : null}
    </header>
  );
}
