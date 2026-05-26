-- Receipts storage for NTRIO Accounts (Supabase SQL Editor → run as postgres)
-- Client uploads to `{userId}/{uuid}.ext` via anon + user JWT; public URLs stored on income/expense/debt rows.
-- Optional env: VITE_SUPABASE_RECEIPTS_BUCKET (default bucket id/name: receipts)

INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "receipts_select_public" ON storage.objects;
CREATE POLICY "receipts_select_public"
ON storage.objects FOR SELECT
USING (bucket_id = 'receipts');

DROP POLICY IF EXISTS "receipts_insert_own_folder" ON storage.objects;
CREATE POLICY "receipts_insert_own_folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'receipts'
  AND split_part(name, '/', 1) = auth.uid()::text
);

DROP POLICY IF EXISTS "receipts_update_own" ON storage.objects;
CREATE POLICY "receipts_update_own"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'receipts' AND split_part(name, '/', 1) = auth.uid()::text);

DROP POLICY IF EXISTS "receipts_delete_own" ON storage.objects;
CREATE POLICY "receipts_delete_own"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'receipts' AND split_part(name, '/', 1) = auth.uid()::text);
