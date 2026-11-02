-- Organizations: scope App users to members of the same org
CREATE TABLE IF NOT EXISTS "organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(64) NOT NULL DEFAULT 'NTRIO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "organization_id" UUID;

-- One private org per existing user (prevents unrelated accounts sharing a list).
-- Users created later from Settings join the creator's organization_id.
DO $$
DECLARE
  r RECORD;
  new_org_id UUID;
  org_title VARCHAR(64);
BEGIN
  FOR r IN
    SELECT u."id" AS user_id, us."organization_title" AS title
    FROM "users" u
    LEFT JOIN "user_settings" us ON us."user_id" = u."id"
    WHERE u."organization_id" IS NULL
  LOOP
    org_title := COALESCE(NULLIF(TRIM(r.title), ''), 'NTRIO');
    new_org_id := gen_random_uuid();
    INSERT INTO "organizations" ("id", "title", "created_at", "updated_at")
    VALUES (new_org_id, org_title, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    UPDATE "users" SET "organization_id" = new_org_id WHERE "id" = r.user_id;
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_organization_id_fkey'
  ) THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "users_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "users_organization_id_idx" ON "users"("organization_id");
