-- CreateEnum
CREATE TYPE "RecipeApplyTo" AS ENUM ('maldivian', 'continental', 'room_extras', 'custom');

-- CreateTable
CREATE TABLE "recipes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "apply_to" "RecipeApplyTo" NOT NULL DEFAULT 'custom',
    "code" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_lines" (
    "id" UUID NOT NULL,
    "recipe_id" UUID NOT NULL,
    "stock_item_id" UUID NOT NULL,
    "qty_per_serving" DECIMAL(15,4) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "recipe_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recipes_user_id_apply_to_idx" ON "recipes"("user_id", "apply_to");

-- CreateIndex
CREATE UNIQUE INDEX "recipes_user_id_code_key" ON "recipes"("user_id", "code");

-- CreateIndex
CREATE INDEX "recipe_lines_recipe_id_idx" ON "recipe_lines"("recipe_id");

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "stock_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
