"use client";

import { useAuth } from "@/components/auth-provider";
import {
  createBusiness,
  getActiveBusinessId,
  listBusinesses,
  setActiveBusinessId,
} from "@/lib/api";
import type { Business } from "@/lib/types";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

interface BusinessContextValue {
  businesses: Business[];
  activeBusiness: Business | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  selectBusiness: (id: string) => void;
  setupBusiness: (name: string, currency?: string) => Promise<void>;
}

const BusinessContext = createContext<BusinessContextValue | null>(null);

export function BusinessProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setBusinesses([]);
      setActiveId(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const list = await listBusinesses();
      setBusinesses(list);
      const stored = getActiveBusinessId();
      const nextId =
        stored && list.some((b) => b.id === stored)
          ? stored
          : list[0]?.id ?? null;
      if (nextId) {
        setActiveBusinessId(nextId);
        setActiveId(nextId);
      } else {
        setActiveId(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load businesses");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) {
      refresh();
    }
  }, [authLoading, refresh]);

  const selectBusiness = (id: string) => {
    setActiveBusinessId(id);
    setActiveId(id);
  };

  const setupBusiness = async (name: string, currency = "USD") => {
    const id = await createBusiness(name, currency);
    setActiveBusinessId(id);
    setActiveId(id);
    await refresh();
  };

  const activeBusiness = businesses.find((b) => b.id === activeId) ?? null;

  return (
    <BusinessContext.Provider
      value={{
        businesses,
        activeBusiness,
        loading: authLoading || loading,
        error,
        refresh,
        selectBusiness,
        setupBusiness,
      }}
    >
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusiness() {
  const ctx = useContext(BusinessContext);
  if (!ctx) {
    throw new Error("useBusiness must be used within BusinessProvider");
  }
  return ctx;
}
