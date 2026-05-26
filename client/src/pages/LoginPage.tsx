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
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (err) setError(err.message);
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
      <Card>
        <h1 className="text-xl font-bold text-slate-900">Sign in</h1>

        <form className="mt-5 space-y-4" onSubmit={handleEmailLogin}>
          <label className="block text-sm font-medium text-slate-700">
            Email
            <input
              className="mt-1.5 w-full min-h-12 touch-manipulation rounded-xl border border-slate-300 px-3 py-3 text-base text-slate-900 shadow-sm"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Password
            <input
              className="mt-1.5 w-full min-h-12 touch-manipulation rounded-xl border border-slate-300 px-3 py-3 text-base text-slate-900 shadow-sm"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <Button className="w-full touch-manipulation" type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
        </form>

        <div className="my-5 text-center text-sm text-slate-500">or</div>

        <Button
          type="button"
          variant="ghost"
          className="w-full touch-manipulation"
          disabled={loading}
          onClick={() => void handleGoogle()}
        >
          Continue with Google
        </Button>
      </Card>
    </div>
  );
}
