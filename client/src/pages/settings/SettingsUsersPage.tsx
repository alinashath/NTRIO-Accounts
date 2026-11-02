import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/api/http";
import { Card, Button, ChoiceList, TextField } from "@/components/ui";
import { useAuthStore } from "@/store/auth";
import type { SettingsUserDto } from "../../../../shared/types";
import { SettingsSubpage } from "./SettingsSubpage";

type AddMode = "create" | "add_existing";

export function SettingsUsersPage() {
  const session = useAuthStore((s) => s.session);
  const myId = session?.user?.id ?? "";
  const [users, setUsers] = useState<SettingsUserDto[]>([]);
  const [usersError, setUsersError] = useState<string | null>(null);

  const refreshUsers = useCallback(async () => {
    setUsersError(null);
    try {
      const list = await apiFetch<SettingsUserDto[]>("/api/settings/users");
      setUsers(list);
    } catch (e) {
      setUsers([]);
      setUsersError(e instanceof Error ? e.message : "Could not load users");
    }
  }, []);

  useEffect(() => {
    void refreshUsers();
  }, [refreshUsers]);

  return (
    <SettingsSubpage
      title="App users"
      caption="Members of your organization. Create a new login or add someone who already has an account."
    >
      {usersError ? <p className="text-sm text-debit">{usersError}</p> : null}

      <Card>
        <h3 className="text-section text-ink">Add to organization</h3>
        <AddOrgUserForm
          onCreated={() => {
            void refreshUsers();
          }}
          onError={setUsersError}
        />
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-section text-ink">Members</h3>
          <p className="mt-0.5 text-caption">
            {users.length} user{users.length === 1 ? "" : "s"}
          </p>
        </div>
        <ul className="divide-y divide-border">
          {users.map((u) => {
            const isYou = u.id === myId;
            return (
              <li
                key={u.id}
                className="flex min-h-11 flex-wrap items-baseline justify-between gap-2 px-4 py-3"
              >
                <span className="min-w-0">
                  <span className="text-sm font-medium text-ink">{u.email ?? u.id}</span>
                  {isYou ? (
                    <span className="ml-2 rounded-xs bg-neutral-bg px-1.5 py-0.5 text-[11px] font-semibold text-neutral-ink">
                      You
                    </span>
                  ) : null}
                </span>
                <span className="text-caption">{new Date(u.created_at).toLocaleString()}</span>
              </li>
            );
          })}
          {!users.length && !usersError ? (
            <li className="px-4 py-6 text-center text-caption">No users in this organization yet.</li>
          ) : null}
        </ul>
      </Card>
    </SettingsSubpage>
  );
}

function AddOrgUserForm({
  onCreated,
  onError,
}: {
  onCreated: () => void;
  onError: (s: string | null) => void;
}) {
  const [mode, setMode] = useState<AddMode>("create");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    onError(null);
    setDoneMsg(null);
    try {
      const res = await apiFetch<{ id: string; email: string; created?: boolean; attached?: boolean }>(
        "/api/settings/users",
        {
          method: "POST",
          body: JSON.stringify({
            mode,
            email: email.trim(),
            ...(mode === "create" ? { password } : {}),
          }),
        },
      );
      setEmail("");
      setPassword("");
      setDoneMsg(
        mode === "create"
          ? `Created ${res.email}. Share the password so they can sign in.`
          : `Added ${res.email} to this organization.`,
      );
      onCreated();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mt-4 flex flex-col gap-form" onSubmit={(e) => void submit(e)}>
      <ChoiceList
        name="add_user_mode"
        label="How to add"
        value={mode}
        onChange={setMode}
        options={[
          {
            value: "create",
            label: "Create new account",
            hint: "New email + temporary password for someone who is not signed up yet",
          },
          {
            value: "add_existing",
            label: "Add existing account",
            hint: "Attach an existing login — they can keep memberships in other orgs too",
          },
        ]}
      />
      <TextField
        label="Email"
        type="email"
        autoComplete="off"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      {mode === "create" ? (
        <TextField
          label="Temporary password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          hint="Share this with them. They can change it later under Settings → Account."
        />
      ) : (
        <p className="text-caption">
          They keep their current password. After you add them, they belong to this organization.
        </p>
      )}
      <Button type="submit" className="w-full sm:w-auto" disabled={busy}>
        {busy ? "Saving…" : mode === "create" ? "Create & add" : "Add to organization"}
      </Button>
      {doneMsg ? <p className="text-sm text-credit">{doneMsg}</p> : null}
    </form>
  );
}
