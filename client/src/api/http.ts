import { getStoredActiveOrganizationId } from "@/lib/orgStorage";
import { useAuthStore } from "@/store/auth";

/** Origin of the Express API (no trailing slash). Empty = same origin + Vite `/api` proxy in dev. */
const apiBase = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/$/, "");

function resolveApiUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  return apiBase ? `${apiBase}${p}` : p;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = useAuthStore.getState().session?.access_token;
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const orgId = getStoredActiveOrganizationId();
  if (orgId && !headers.has("X-Organization-Id")) {
    headers.set("X-Organization-Id", orgId);
  }

  const res = await fetch(resolveApiUrl(path), { ...init, headers });
  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let data: { error?: unknown; hint?: unknown } | null = null;
  if (text) {
    try {
      data = JSON.parse(text) as { error?: unknown; hint?: unknown };
    } catch {
      if (!res.ok) {
        throw new Error(
          res.status === 502 || res.status === 500
            ? "The accounts API is not running."
            : `Request failed (${res.status})`,
        );
      }
      throw new Error("The server returned an unreadable response.");
    }
  }

  if (!res.ok) {
    const msg =
      typeof data?.error === "string"
        ? data.error
        : `Request failed (${res.status})`;
    const hint = typeof data?.hint === "string" ? data.hint : "";
    throw new Error(hint ? `${msg}\n\n${hint}` : msg);
  }

  return data as T;
}

/** Binary download (e.g. Excel). Uses the same auth / org headers as apiFetch. */
export async function apiFetchBlob(
  path: string,
  init: RequestInit = {},
): Promise<{ blob: Blob; filename: string | null }> {
  const token = useAuthStore.getState().session?.access_token;
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const orgId = getStoredActiveOrganizationId();
  if (orgId && !headers.has("X-Organization-Id")) {
    headers.set("X-Organization-Id", orgId);
  }

  const res = await fetch(resolveApiUrl(path), { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    let msg = `Request failed (${res.status})`;
    try {
      const data = JSON.parse(text) as { error?: string; hint?: string };
      if (typeof data.error === "string") msg = data.error;
      if (typeof data.hint === "string" && data.hint) msg = `${msg}\n\n${data.hint}`;
    } catch {
      /* keep status message */
    }
    throw new Error(msg);
  }

  const cd = res.headers.get("Content-Disposition") ?? "";
  const match = /filename\*?=(?:UTF-8''|")?([^\";]+)/i.exec(cd);
  const filename = match ? decodeURIComponent(match[1].replace(/"/g, "")) : null;
  const blob = await res.blob();
  return { blob, filename };
}
