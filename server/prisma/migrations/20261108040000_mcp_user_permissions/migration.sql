-- AlterTable
ALTER TABLE "mcp_users" ADD COLUMN "can_read" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "mcp_users" ADD COLUMN "can_write" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "mcp_users" ADD COLUMN "enabled_modules" TEXT[] NOT NULL DEFAULT ARRAY['accounts', 'occupancy', 'kitchen', 'stock']::TEXT[];
