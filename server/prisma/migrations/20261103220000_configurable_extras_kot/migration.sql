-- AlterTable
ALTER TABLE "recipe_lines" ADD COLUMN "show_on_kot" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "room_day_extras" ADD COLUMN "selected_item_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];
