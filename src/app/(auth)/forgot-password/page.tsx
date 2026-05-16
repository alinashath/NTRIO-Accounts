"use client";

import { Button, Card, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.resetPasswordForEmail(
      email,
      { redirectTo: `${window.location.origin}/auth/callback?next=/settings` },
    );

    if (authError) {
      setError(authError.message);
    } else {
      setSent(true);
    }
    setLoading(false);
  }

  if (sent) {
    return (
      <Card>
        <h2 className="text-lg font-semibold">Check your email</h2>
        <p className="mt-2 text-sm text-muted">
          Password reset instructions were sent to {email}.
        </p>
        <Link
          href="/login"
          className="mt-4 block text-center text-sm font-medium text-brand-600"
        >
          Back to sign in
        </Link>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold">Reset password</h2>
      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Sending…" : "Send reset link"}
        </Button>
      </form>
      <Link
        href="/login"
        className="mt-4 block text-center text-sm text-muted"
      >
        Back to sign in
      </Link>
    </Card>
  );
}
