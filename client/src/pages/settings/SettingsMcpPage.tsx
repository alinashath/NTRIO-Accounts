import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/api/http";
import { Button, Card, TextField } from "@/components/ui";
import { ChangeTag } from "@/components/design";
import type { McpMetaDto, McpUserDto } from "../../../../shared/types";
import { SettingsSubpage } from "./SettingsSubpage";

export function SettingsMcpPage() {
  const [users, setUsers] = useState<McpUserDto[]>([]);
  const [meta, setMeta] = useState<McpMetaDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdPassword, setCreatedPassword] = useState<{
    username: string;
    password: string;
  } | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [list, m] = await Promise.all([
        apiFetch<McpUserDto[]>("/api/settings/mcp-users"),
        apiFetch<McpMetaDto>("/api/settings/mcp-meta"),
      ]);
      setUsers(list);
      setMeta(m);
    } catch (e) {
      setUsers([]);
      setMeta(null);
      setError(e instanceof Error ? e.message : "Could not load MCP settings");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <SettingsSubpage
      title="MCP access"
      caption="Let AI clients (Cursor, Claude, ChatGPT, Grok) control this organization through MCP with OAuth."
    >
      {error ? <p className="text-sm text-debit">{error}</p> : null}

      <Card>
        <h3 className="text-section text-ink">Connect an AI client</h3>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-body">
          <li>Create an MCP username and password below.</li>
          <li>
            In the AI client, add a remote MCP server URL (any allowed domain), then sign in with
            that username and password.
          </li>
          <li>Approve access when the browser opens the NTRIO sign-in page.</li>
        </ol>
        {meta ? (
          <div className="mt-4 space-y-2">
            <p className="text-label uppercase text-muted">MCP URL for this domain</p>
            <code className="block break-all rounded-md bg-surface-elevated px-3 py-2 text-sm font-num text-ink">
              {meta.mcp_url}
            </code>
            {meta.mcp_urls.length > 1 ? (
              <div className="mt-3">
                <p className="text-label uppercase text-muted">Also allowed</p>
                <ul className="mt-1 space-y-1">
                  {meta.mcp_urls
                    .filter((u) => u !== meta.mcp_url)
                    .map((u) => (
                      <li key={u}>
                        <code className="break-all text-caption font-num text-body">{u}</code>
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

      <Card>
        <h3 className="text-section text-ink">Create MCP user</h3>
        <CreateMcpUserForm
          onCreated={(username, password) => {
            setCreatedPassword({ username, password });
            void refresh();
          }}
          onError={setError}
        />
        {createdPassword ? (
          <div className="mt-4 rounded-md border border-border bg-surface-elevated px-3 py-3">
            <p className="text-sm font-medium text-ink">
              Created {createdPassword.username}. Copy the password now — it will not be shown
              again.
            </p>
            <code className="mt-2 block break-all font-num text-sm text-ink">
              {createdPassword.password}
            </code>
          </div>
        ) : null}
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-section text-ink">MCP users</h3>
          <p className="mt-0.5 text-caption">
            {users.length} user{users.length === 1 ? "" : "s"}
          </p>
        </div>
        <ul className="divide-y divide-border">
          {users.map((u) => (
            <li key={u.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <span className="text-sm font-medium text-ink">{u.username}</span>
                <span className="ml-2 inline-flex align-middle">
                  {u.disabled ? (
                    <ChangeTag variant="neutral">Disabled</ChangeTag>
                  ) : (
                    <ChangeTag variant="positive">Active</ChangeTag>
                  )}
                </span>
                <p className="text-caption">{new Date(u.created_at).toLocaleString()}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11"
                  onClick={() => {
                    void (async () => {
                      setError(null);
                      try {
                        const res = await apiFetch<{ id: string; password: string }>(
                          `/api/settings/mcp-users/${u.id}/reset-password`,
                          { method: "POST", body: JSON.stringify({}) },
                        );
                        setCreatedPassword({ username: u.username, password: res.password });
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Reset failed");
                      }
                    })();
                  }}
                >
                  Reset password
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11"
                  onClick={() => {
                    void (async () => {
                      setError(null);
                      try {
                        await apiFetch(`/api/settings/mcp-users/${u.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({ disabled: !u.disabled }),
                        });
                        void refresh();
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Update failed");
                      }
                    })();
                  }}
                >
                  {u.disabled ? "Enable" : "Disable"}
                </Button>
              </div>
            </li>
          ))}
          {!users.length && !error ? (
            <li className="px-4 py-6 text-center text-caption">No MCP users yet.</li>
          ) : null}
        </ul>
      </Card>
    </SettingsSubpage>
  );
}

function CreateMcpUserForm({
  onCreated,
  onError,
}: {
  onCreated: (username: string, password: string) => void;
  onError: (s: string | null) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    onError(null);
    try {
      const res = await apiFetch<{ username: string; password: string }>("/api/settings/mcp-users", {
        method: "POST",
        body: JSON.stringify({
          username: username.trim(),
          ...(password.trim() ? { password: password.trim() } : {}),
        }),
      });
      setUsername("");
      setPassword("");
      onCreated(res.username, res.password);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mt-4 flex flex-col gap-form" onSubmit={(e) => void submit(e)}>
      <TextField
        label="Username"
        autoComplete="off"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        required
        minLength={3}
        hint="Letters, numbers, ., _, - — globally unique"
      />
      <TextField
        label="Password (optional)"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        minLength={8}
        hint="Leave blank to generate a strong password"
      />
      <Button type="submit" className="w-full sm:w-auto" disabled={busy}>
        {busy ? "Creating…" : "Create MCP user"}
      </Button>
    </form>
  );
}
