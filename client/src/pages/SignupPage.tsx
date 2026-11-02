import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { apiFetch } from "@/api/http";
import { Button, Card, TextField } from "@/components/ui";
import { useAuthStore } from "@/store/auth";

export function SignupPage() {
  const session = useAuthStore((s) => s.session);
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizationTitle, setOrganizationTitle] = useState("");
  const [contactName, setContactName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  if (session) {
    return <Navigate to="/" replace />;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setDoneMsg(null);
    try {
      const res = await apiFetch<{ message?: string }>("/api/signup", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          password,
          organization_title: organizationTitle.trim(),
          contact_name: contactName.trim() || undefined,
        }),
      });
      setDoneMsg(
        res.message ||
          "Account created. Sign in — your organization waits for system admin approval.",
      );
      setTimeout(() => navigate("/login", { replace: true }), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-4 py-8">
      <div className="mb-6 text-center">
        <h1 className="text-page-title text-ink">Request organization</h1>
        <p className="mt-1 text-caption">
          Create a login and submit a new organization (tenant) for admin approval.
        </p>
      </div>

      <Card>
        <form className="flex flex-col gap-3" onSubmit={(e) => void submit(e)}>
          <TextField
            label="Your name (optional)"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            autoComplete="name"
          />
          <TextField
            label="Work email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
          />
          <TextField
            label="Organization title"
            value={organizationTitle}
            onChange={(e) => setOrganizationTitle(e.target.value)}
            placeholder="e.g. Acme Books"
            required
            maxLength={64}
            hint="Shown as the wordmark after approval"
          />
          {error ? <p className="text-sm text-debit">{error}</p> : null}
          {doneMsg ? <p className="text-sm text-credit">{doneMsg}</p> : null}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Submitting…" : "Create account & request org"}
          </Button>
        </form>
        <p className="mt-4 text-center text-caption">
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-action">
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  );
}
