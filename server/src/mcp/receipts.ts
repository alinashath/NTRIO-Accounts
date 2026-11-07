import { randomUUID } from "node:crypto";
import { createServiceRoleSupabase } from "../lib/supabaseService.js";

const bucket = () =>
  process.env.VITE_SUPABASE_RECEIPTS_BUCKET?.trim() ||
  process.env.SUPABASE_RECEIPTS_BUCKET?.trim() ||
  "receipts";

export async function uploadReceiptBase64(opts: {
  dataOwnerId: string;
  filename?: string;
  contentType?: string;
  base64: string;
}): Promise<{ url: string; path: string }> {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Server missing Supabase configuration");
  }
  const supabase = createServiceRoleSupabase(url, serviceKey);
  const raw = opts.base64.includes(",") ? opts.base64.split(",").pop()! : opts.base64;
  const buf = Buffer.from(raw, "base64");
  if (!buf.length) throw new Error("Empty file");
  if (buf.length > 8 * 1024 * 1024) throw new Error("File too large (max 8MB)");

  const name = opts.filename?.trim() || "receipt.bin";
  const ext = name.split(".").pop()?.replace(/[^a-z0-9]/gi, "") || "bin";
  const path = `${opts.dataOwnerId}/${randomUUID()}.${ext}`;
  const contentType =
    opts.contentType && opts.contentType.length > 0
      ? opts.contentType
      : "application/octet-stream";

  const { error } = await supabase.storage.from(bucket()).upload(path, buf, {
    cacheControl: "3600",
    upsert: false,
    contentType,
  });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(bucket()).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

export async function fetchReceipt(url: string): Promise<{
  contentType: string;
  bytes: Buffer;
}> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Could not fetch receipt (${res.status})`);
  const contentType = res.headers.get("content-type") || "application/octet-stream";
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > 12 * 1024 * 1024) throw new Error("Receipt too large");
  return { contentType, bytes };
}
