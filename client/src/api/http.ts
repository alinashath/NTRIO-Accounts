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

  const res = await fetch(resolveApiUrl(path), { ...init, headers });
  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

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
