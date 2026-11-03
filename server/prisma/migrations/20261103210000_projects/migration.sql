-- Optional Projects feature: settings flag + projects + entry FKs.

ALTER TABLE "user_settings"
ADD COLUMN IF NOT EXISTS "projects_enabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "projects" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "projects_user_id_idx" ON "projects"("user_id");

DO $$ BEGIN
  ALTER TABLE "projects"
    ADD CONSTRAINT "projects_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "income_entries"
ADD COLUMN IF NOT EXISTS "project_id" UUID;

ALTER TABLE "expense_entries"
ADD COLUMN IF NOT EXISTS "project_id" UUID;

CREATE INDEX IF NOT EXISTS "income_entries_project_id_idx" ON "income_entries"("project_id");
CREATE INDEX IF NOT EXISTS "expense_entries_project_id_idx" ON "expense_entries"("project_id");

DO $$ BEGIN
  ALTER TABLE "income_entries"
    ADD CONSTRAINT "income_entries_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "expense_entries"
    ADD CONSTRAINT "expense_entries_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
