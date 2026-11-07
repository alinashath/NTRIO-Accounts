/** Server-rendered OAuth login (light canvas + yellow primary). */

export function renderLoginPage(opts: {
  error?: string | null;
  formAction: string;
  hiddenFields: Record<string, string>;
}): string {
  const err = opts.error
    ? `<p class="err" role="alert">${escapeHtml(opts.error)}</p>`
    : "";
  const hiddens = Object.entries(opts.hiddenFields)
    .map(
      ([k, v]) =>
        `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}" />`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>NTRIO MCP sign-in</title>
  <style>
    :root {
      --ground: #fafafa;
      --surface: #ffffff;
      --ink: #181a20;
      --muted: #707a8a;
      --border: #eaecef;
      --action: #FCD535;
      --action-active: #f0b90b;
      --debit: #f6465d;
      --radius: 8px;
      --font: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100dvh; display: flex; align-items: center; justify-content: center;
      background: var(--ground); color: var(--ink); font-family: var(--font);
      padding: 16px;
    }
    .card {
      width: 100%; max-width: 400px; background: var(--surface);
      border: 1px solid var(--border); border-radius: 12px; padding: 24px;
    }
    h1 { margin: 0 0 4px; font-size: 20px; font-weight: 600; }
    .cap { margin: 0 0 20px; font-size: 12px; color: var(--muted); line-height: 1.4; }
    label { display: block; font-size: 12px; font-weight: 500; color: var(--muted); margin-bottom: 6px; }
    input[type=text], input[type=password] {
      width: 100%; height: 44px; border: 1px solid #cdd1d6; border-radius: 6px;
      padding: 0 12px; font-size: 14px; margin-bottom: 16px; background: #fff; color: var(--ink);
    }
    button {
      width: 100%; min-height: 44px; border: none; border-radius: 6px;
      background: var(--action); color: var(--ink); font-size: 14px; font-weight: 600; cursor: pointer;
    }
    button:active { background: var(--action-active); }
    .err { color: var(--debit); font-size: 13px; margin: 0 0 12px; }
  </style>
</head>
<body>
  <main class="card">
    <h1>MCP access</h1>
    <p class="cap">Sign in with an organization MCP username and password from Settings → MCP access.</p>
    ${err}
    <form method="post" action="${escapeHtml(opts.formAction)}" autocomplete="on">
      ${hiddens}
      <label for="username">Username</label>
      <input id="username" name="username" type="text" autocomplete="username" required autofocus />
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required />
      <button type="submit">Allow access</button>
    </form>
  </main>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
