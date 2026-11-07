/**
 * Accept DCR redirect URIs for known AI MCP clients (Cursor, Claude, ChatGPT, Grok)
 * plus RFC 8252 loopback. Store exact URIs; authorize matches exactly.
 */

const HTTPS_HOSTS = new Set([
  "claude.ai",
  "claude.com",
  "chatgpt.com",
  "openai.com",
  "grok.com",
  "x.ai",
  "www.cursor.com",
  "cursor.com",
]);

export function isAllowedRedirectUri(uri: string): boolean {
  const trimmed = uri.trim();
  if (!trimmed) return false;

  // Cursor private-scheme callback
  if (trimmed === "cursor://anysphere.cursor-mcp/oauth/callback") {
    return true;
  }

  try {
    const u = new URL(trimmed);

    // Claude Code / Cursor desktop loopback (any port)
    if (u.protocol === "http:") {
      const host = u.hostname.toLowerCase();
      if (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1") {
        return u.pathname.length > 0;
      }
      return false;
    }

    if (u.protocol === "https:") {
      const host = u.hostname.toLowerCase();
      if (HTTPS_HOSTS.has(host)) return true;
      // Allow subdomains of known AI hosts (e.g. www.claude.ai already covered)
      for (const allowed of HTTPS_HOSTS) {
        if (host === allowed || host.endsWith(`.${allowed}`)) return true;
      }
      return false;
    }

    return false;
  } catch {
    return false;
  }
}

export function filterAllowedRedirectUris(uris: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const uri of uris) {
    if (!isAllowedRedirectUri(uri)) continue;
    if (seen.has(uri)) continue;
    seen.add(uri);
    out.push(uri);
  }
  return out;
}
