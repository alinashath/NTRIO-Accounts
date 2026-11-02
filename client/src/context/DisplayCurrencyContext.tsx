import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiFetch } from "@/api/http";
import {
  resolveUsdMvrRateFromSeries,
  todayYmdUtc,
  USD_MVR_RATE_DEFAULT,
  type FxRatePoint,
} from "@/lib/fxRates";
import { getStoredOrganizationTitle, setStoredOrganizationTitle } from "@/lib/orgStorage";

export type DisplayCurrency = "USD" | "MVR";

type Ctx = {
  displayCurrency: DisplayCurrency;
  setDisplayCurrency: (c: DisplayCurrency) => void;
  /** Current / latest rate (for header and undated amounts). */
  globalUsdMvrRate: number;
  /** Sparse ascending daily rate history. */
  fxRates: FxRatePoint[];
  getUsdMvrRateForDate: (ymd: string) => number;
  refreshFx: () => Promise<void>;
  /** Wordmark in TopBar / Hub. */
  organizationTitle: string;
  setOrganizationTitleLocal: (title: string) => void;
};

const DisplayCurrencyContext = createContext<Ctx | null>(null);

const LS_KEY = "ntrio_display_ccy";

export function DisplayCurrencyProvider({ children }: { children: ReactNode }) {
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>(() => {
    const v = localStorage.getItem(LS_KEY);
    return v === "MVR" || v === "USD" ? v : "USD";
  });
  const [globalUsdMvrRate, setGlobalUsdMvrRate] = useState(USD_MVR_RATE_DEFAULT);
  const [fxRates, setFxRates] = useState<FxRatePoint[]>([]);
  const [organizationTitle, setOrganizationTitle] = useState(getStoredOrganizationTitle);

  useEffect(() => {
    localStorage.setItem(LS_KEY, displayCurrency);
  }, [displayCurrency]);

  const setOrganizationTitleLocal = useCallback((title: string) => {
    setOrganizationTitle(setStoredOrganizationTitle(title));
  }, []);

  const refreshFx = useCallback(async () => {
    const s = await apiFetch<{
      global_usd_mvr_rate: number;
      organization_title?: string;
      fx_rates?: FxRatePoint[];
    }>("/api/settings");
    setGlobalUsdMvrRate(s.global_usd_mvr_rate);
    setFxRates(s.fx_rates ?? []);
    if (s.organization_title?.trim()) {
      setOrganizationTitleLocal(s.organization_title);
    }
  }, [setOrganizationTitleLocal]);

  useEffect(() => {
    void refreshFx().catch(() => {});
  }, [refreshFx]);

  const getUsdMvrRateForDate = useCallback(
    (ymd: string) => {
      if (fxRates.length) return resolveUsdMvrRateFromSeries(fxRates, ymd);
      return globalUsdMvrRate > 0 ? globalUsdMvrRate : USD_MVR_RATE_DEFAULT;
    },
    [fxRates, globalUsdMvrRate],
  );

  const value = useMemo(
    () => ({
      displayCurrency,
      setDisplayCurrency,
      globalUsdMvrRate:
        globalUsdMvrRate > 0
          ? globalUsdMvrRate
          : getUsdMvrRateForDate(todayYmdUtc()),
      fxRates,
      getUsdMvrRateForDate,
      refreshFx,
      organizationTitle,
      setOrganizationTitleLocal,
    }),
    [
      displayCurrency,
      fxRates,
      getUsdMvrRateForDate,
      globalUsdMvrRate,
      organizationTitle,
      refreshFx,
      setOrganizationTitleLocal,
    ],
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
