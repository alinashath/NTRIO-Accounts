import { supabase } from "./supabase";

const bucket =
  (import.meta.env as { VITE_SUPABASE_RECEIPTS_BUCKET?: string }).VITE_SUPABASE_RECEIPTS_BUCKET?.trim() ||
  "receipts";

/**
 * Uploads a file to Supabase Storage (public bucket recommended).
 * Create bucket `receipts` (or set VITE_SUPABASE_RECEIPTS_BUCKET) with policies
 * allowing authenticated users to upload under `{userId}/…`.
 */
export async function uploadReceiptFile(file: File, userId: string): Promise<string> {
  const ext = file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "") || "bin";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type && file.type.length > 0 ? file.type : "application/octet-stream",
  });
  if (error) {
    throw new Error(
      error.message.includes("Bucket not found")
        ? `Storage bucket "${bucket}" is missing — create it in Supabase (public read) or set VITE_SUPABASE_RECEIPTS_BUCKET.`
        : error.message,
    );
  }
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
