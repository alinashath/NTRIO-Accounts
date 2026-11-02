-- Per-user organization wordmark (TopBar / Hub)
ALTER TABLE "user_settings"
  ADD COLUMN IF NOT EXISTS "organization_title" VARCHAR(64) NOT NULL DEFAULT 'NTRIO';
