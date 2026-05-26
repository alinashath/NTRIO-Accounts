import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch } from "@/api/http";

export type DisplayCurrency = "USD" | "MVR";

type Ctx = {
  displayCurrency: DisplayCurrency;
  setDisplayCurrency: (c: DisplayCurrency) => void;
  globalUsdMvrRate: number;
  refreshFx: () => Promise<void>;
};

const DisplayCurrencyContext = createContext<Ctx | null>(null);

const LS_KEY = "ntrio_display_ccy";

export function DisplayCurrencyProvider({ children }: { children: ReactNode }) {
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>(() => {
    const v = localStorage.getItem(LS_KEY);
    return v === "MVR" || v === "USD" ? v : "USD";
  });
  const [globalUsdMvrRate, setGlobalUsdMvrRate] = useState(15.42);

  useEffect(() => {
    localStorage.setItem(LS_KEY, displayCurrency);
  }, [displayCurrency]);

  const refreshFx = useCallback(async () => {
    const s = await apiFetch<{ global_usd_mvr_rate: number }>("/api/settings");
    setGlobalUsdMvrRate(s.global_usd_mvr_rate);
  }, []);

  useEffect(() => {
    void refreshFx().catch(() => {});
  }, [refreshFx]);

  const value = useMemo(
    () => ({ displayCurrency, setDisplayCurrency, globalUsdMvrRate, refreshFx }),
    [displayCurrency, globalUsdMvrRate, refreshFx],
  );

  return <DisplayCurrencyContext.Provider value={value}>{children}</DisplayCurrencyContext.Provider>;
}

export function useDisplayCurrency() {
  const v = useContext(DisplayCurrencyContext);
  if (!v) {
    throw new Error("useDisplayCurrency must be used inside DisplayCurrencyProvider");
  }
  return v;
}
