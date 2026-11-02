-- Organization setup requests (multi-tenant onboarding, system-admin approval)
CREATE TYPE "OrgSetupRequestStatus" AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE IF NOT EXISTS "organization_setup_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "requester_user_id" UUID NOT NULL,
    "requester_email" TEXT NOT NULL,
    "organization_title" VARCHAR(64) NOT NULL,
    "contact_name" VARCHAR(120),
    "status" "OrgSetupRequestStatus" NOT NULL DEFAULT 'pending',
    "rejection_reason" TEXT,
    "reviewed_by_email" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_organization_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organization_setup_requests_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "organization_setup_requests"
  ADD CONSTRAINT "organization_setup_requests_requester_user_id_fkey"
  FOREIGN KEY ("requester_user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "organization_setup_requests_status_created_at_idx"
  ON "organization_setup_requests"("status", "created_at");

CREATE INDEX IF NOT EXISTS "organization_setup_requests_requester_user_id_idx"
  ON "organization_setup_requests"("requester_user_id");
