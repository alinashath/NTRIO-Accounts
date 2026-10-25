import { useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/auth";
import { Button, Card } from "@/components/ui";

export function LoginPage() {
  const session = useAuthStore((s) => s.session);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (session) {
    return <Navigate to="/" replace />;
  }

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    if (data.session) {
      useAuthStore.getState().setSession(data.session);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/` },
    });
    setLoading(false);
    if (err) setError(err.message);
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-4 py-8 pt-[max(2rem,env(safe-area-inset-top,0px))] pb-[max(2rem,env(safe-area-inset-bottom,0px))]">
      <div className="mb-6 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-ink">NTRIO</p>
        <h1 className="mt-1 text-page-title text-ink">Accounts</h1>
        <p className="mt-1 text-caption">Sign in to continue</p>
      </div>
      <Card>
        <form className="space-y-4" onSubmit={handleEmailLogin}>
          <label className="block text-sm font-medium text-ink">
            Email
            <input
              className="mt-1 h-11 w-full touch-manipulation rounded-sm border border-border bg-surface px-3 text-sm text-ink"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm font-medium text-ink">
            Password
            <input
              className="mt-1 h-11 w-full touch-manipulation rounded-sm border border-border bg-surface px-3 text-sm text-ink"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error ? <p className="text-sm text-debit">{error}</p> : null}
          <Button className="w-full" type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-caption">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>
        <Button type="button" variant="secondary" className="w-full" onClick={() => void handleGoogle()} disabled={loading}>
          Continue with Google
        </Button>
      </Card>
    </div>
  );
}
