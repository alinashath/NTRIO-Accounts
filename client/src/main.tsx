import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { supabase } from "./lib/supabase";
import { useAuthStore } from "./store/auth";

function Boot() {
  const setSession = useAuthStore((s) => s.setSession);
  const markAuthReady = useAuthStore((s) => s.markAuthReady);
  const authReady = useAuthStore((s) => s.authReady);

  useEffect(() => {
    let cancelled = false;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      setSession(session);
    });
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        setSession(data.session);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) markAuthReady();
      });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [setSession, markAuthReady]);

  if (!authReady) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Boot />
  </StrictMode>,
);
