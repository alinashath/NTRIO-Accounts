-- Multi-org membership: one login can belong to many organizations
CREATE TABLE IF NOT EXISTS "organization_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- Backfill from users.organization_id
INSERT INTO "organization_members" ("id", "user_id", "organization_id", "created_at")
SELECT gen_random_uuid(), u."id", u."organization_id", CURRENT_TIMESTAMP
FROM "users" u
WHERE u."organization_id" IS NOT NULL
ON CONFLICT DO NOTHING;

-- Unique after backfill (ignore duplicates if re-run)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organization_members_user_id_organization_id_key'
  ) THEN
    -- Deduplicate first
    DELETE FROM "organization_members" a
    USING "organization_members" b
    WHERE a."user_id" = b."user_id"
      AND a."organization_id" = b."organization_id"
      AND a."id" > b."id";

    ALTER TABLE "organization_members"
      ADD CONSTRAINT "organization_members_user_id_organization_id_key"
      UNIQUE ("user_id", "organization_id");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organization_members_user_id_fkey'
  ) THEN
    ALTER TABLE "organization_members"
      ADD CONSTRAINT "organization_members_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organization_members_organization_id_fkey'
  ) THEN
    ALTER TABLE "organization_members"
      ADD CONSTRAINT "organization_members_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "organization_members_organization_id_idx"
  ON "organization_members"("organization_id");
