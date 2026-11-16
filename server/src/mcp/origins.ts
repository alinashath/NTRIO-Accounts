/**
 * Allowed public origins for MCP / OAuth (multi-domain).
 * MCP accepts any Host that reaches this app (custom domains, Railway, localhost).
 * CLIENT_ORIGIN + Railway public domain are still listed for settings / CORS hints.
 */

function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

function normalizeOrigin(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return stripTrailingSlash(`${u.protocol}//${u.host}`);
  } catch {
    return null;
  }
}

/** Configured / known origins (CORS + Settings “also allowed” list). */
export function listAllowedOrigins(): string[] {
  const out = new Set<string>();

  const raw = process.env.CLIENT_ORIGIN?.trim();
  if (raw) {
    for (const part of raw.split(",")) {
      const o = normalizeOrigin(part);
      if (o) out.add(o);
    }
  }

  const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railway) {
    const o = normalizeOrigin(`https://${railway}`);
    if (o) out.add(o);
  }

  if (process.env.NODE_ENV !== "production") {
    out.add("http://localhost:3001");
    out.add("http://127.0.0.1:3001");
    out.add("http://localhost:5173");
    out.add("http://127.0.0.1:5173");
  }

  return [...out];
}

export function listAllowedHostnames(): string[] {
  const hosts = new Set<string>();
  for (const origin of listAllowedOrigins()) {
    try {
      hosts.add(new URL(origin).hostname.toLowerCase());
    } catch {
      /* ignore */
    }
  }
  return [...hosts];
}

/**
 * Resolve request origin from Host / X-Forwarded-*.
 * Any domain that reaches this app is accepted so MCP/OAuth work on every mapped custom domain.
 */
export function resolveRequestOrigin(req: {
  protocol?: string;
  headers: Record<string, string | string[] | undefined>;
}): string | null {
  const xfProto = headerFirst(req.headers["x-forwarded-proto"]);
  const proto = (xfProto?.split(",")[0]?.trim() || req.protocol || "http").replace(/:$/, "");
  const host = headerFirst(req.headers["x-forwarded-host"]) || headerFirst(req.headers.host);
  if (!host) return null;
  return normalizeOrigin(`${proto}://${host}`);
}

export function mcpResourceUrl(origin: string): string {
  return `${stripTrailingSlash(origin)}/mcp`;
}

export function issuerUrl(origin: string): string {
  return stripTrailingSlash(origin);
}

function headerFirst(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}
