import { useState } from "react";
import { Button, Card, TextField } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/auth";
import { SettingsSubpage } from "./SettingsSubpage";

export function SettingsAccountPage() {
  const session = useAuthStore((s) => s.session);
  const email = session?.user?.email ?? "";
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDoneMsg(null);

    if (!email) {
      setError("No email on this account.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("New password must be different from the current password.");
      return;
    }

    setBusy(true);
    try {
      const { error: verifyErr } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (verifyErr) {
        setError("Current password is incorrect.");
        return;
      }

      const { error: updateErr } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateErr) {
        setError(updateErr.message || "Could not update password.");
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setDoneMsg("Password updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsSubpage title="Account" caption={email || "Signed-in account"}>
      {error ? <p className="text-sm text-debit">{error}</p> : null}
      {doneMsg ? <p className="text-sm text-credit">{doneMsg}</p> : null}

      <Card>
        <h3 className="text-section text-ink">Change password</h3>
        <p className="mt-1 text-caption">Updates the password for your own sign-in only.</p>
        <form className="mt-4 flex flex-col gap-3" onSubmit={(e) => void submit(e)}>
          <TextField
            label="Current password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
          <TextField
            label="New password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
          />
          <TextField
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
          />
          <Button type="submit" className="w-full sm:w-auto" disabled={busy}>
            {busy ? "Updating…" : "Update password"}
          </Button>
        </form>
      </Card>
    </SettingsSubpage>
  );
}
