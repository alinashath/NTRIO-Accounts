"use client";

import { useBusiness } from "@/components/business-provider";
import clsx from "clsx";
import { ChevronDown, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export function BusinessSwitcher() {
  const { businesses, activeBusiness, selectBusiness, loading } = useBusiness();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  if (loading) {
    return (
      <div className="h-10 flex-1 animate-pulse rounded-xl bg-slate-200" />
    );
  }

  if (!activeBusiness) {
    return (
      <Link
        href="/businesses/new"
        className="flex flex-1 items-center gap-2 rounded-xl border border-dashed border-brand-300 bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700"
      >
        <Plus className="h-4 w-4" />
        Add your first business
      </Link>
    );
  }

  return (
    <div className="relative flex-1" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-left shadow-sm"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">
            {activeBusiness.name}
          </p>
          <p className="text-xs text-muted">{activeBusiness.currency}</p>
        </div>
        <ChevronDown
          className={clsx(
            "h-4 w-4 shrink-0 text-muted transition",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-border bg-white shadow-lg">
          <ul className="max-h-64 overflow-y-auto py-1">
            {businesses.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  className={clsx(
                    "flex w-full flex-col px-3 py-2.5 text-left text-sm hover:bg-slate-50",
                    b.id === activeBusiness.id && "bg-brand-50",
                  )}
                  onClick={() => {
                    selectBusiness(b.id);
                    setOpen(false);
                  }}
                >
                  <span className="font-medium text-slate-900">{b.name}</span>
                  <span className="text-xs capitalize text-muted">
                    {b.role ?? "member"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-border p-1">
            <Link
              href="/businesses/new"
              className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-brand-600 hover:bg-brand-50"
              onClick={() => setOpen(false)}
            >
              <Plus className="h-4 w-4" />
              Add business
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
