import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";

type AuthState = {
  session: Session | null;
  setSession: (s: Session | null) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  setSession: (session) => set({ session }),
}));
