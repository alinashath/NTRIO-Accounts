import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";

type AuthState = {
  session: Session | null;
  /** Becomes true after the first `getSession()` completes — avoids API calls with a null token. */
  authReady: boolean;
  setSession: (s: Session | null) => void;
  markAuthReady: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  authReady: false,
  setSession: (session) => set({ session }),
  markAuthReady: () => set({ authReady: true }),
}));
