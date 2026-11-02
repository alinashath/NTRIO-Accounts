/*
  Warnings:

  - You are about to drop the column `organization_id` on the `users` table. All the data in the column will be lost.
  - You are about to drop the `organizations` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_organization_id_fkey";

-- DropIndex
DROP INDEX "users_organization_id_idx";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "organization_id";

-- DropTable
DROP TABLE "organizations";

-- CreateIndex
CREATE INDEX "income_entries_user_id_received_date_idx" ON "income_entries"("user_id", "received_date");

-- RenameIndex
ALTER INDEX "breakfast_orders_user_id_room_id_breakfast_date_guest_number_ke" RENAME TO "breakfast_orders_user_id_room_id_breakfast_date_guest_numbe_key";

-- RenameIndex
ALTER INDEX "expense_entries_user_pay_later_idx" RENAME TO "expense_entries_user_id_pay_later_idx";
