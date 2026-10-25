-- CreateEnum
CREATE TYPE "BreakfastType" AS ENUM ('maldivian', 'continental');

-- CreateEnum
CREATE TYPE "EggStyle" AS ENUM ('omelette', 'fried', 'boiled', 'scrambled');

-- CreateEnum
CREATE TYPE "BreakfastOrderStatus" AS ENUM ('pending', 'served', 'cancelled');

-- CreateEnum
CREATE TYPE "StockItemKind" AS ENUM ('kitchen', 'other');

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_days" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "occupant_count" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "breakfast_orders" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "breakfast_date" DATE NOT NULL,
    "guest_number" INTEGER NOT NULL,
    "serving_time" TEXT NOT NULL,
    "outside_normal_window" BOOLEAN NOT NULL DEFAULT false,
    "breakfast_type" "BreakfastType" NOT NULL,
    "egg_style" "EggStyle" NOT NULL,
    "potato" BOOLEAN NOT NULL DEFAULT false,
    "juice" BOOLEAN NOT NULL DEFAULT false,
    "tea" BOOLEAN NOT NULL DEFAULT false,
    "coffee" BOOLEAN NOT NULL DEFAULT false,
    "milk" BOOLEAN NOT NULL DEFAULT false,
    "sugar" BOOLEAN NOT NULL DEFAULT false,
    "special_requests" TEXT,
    "status" "BreakfastOrderStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "breakfast_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_day_extras" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "fruits" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pancake" BOOLEAN NOT NULL DEFAULT false,
    "honey" BOOLEAN NOT NULL DEFAULT false,
    "nutella" BOOLEAN NOT NULL DEFAULT false,
    "cereal" BOOLEAN NOT NULL DEFAULT false,
    "water_bottle" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_day_extras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_items" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "kind" "StockItemKind" NOT NULL DEFAULT 'kitchen',
    "min_stock" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "use_notes" TEXT,
    "pack_info" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_ledger_days" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "stock_item_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "opening" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "received" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "used" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "waste" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "expenditure" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(15,4),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_ledger_days_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rooms_user_id_idx" ON "rooms"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_user_id_number_key" ON "rooms"("user_id", "number");

-- CreateIndex
CREATE INDEX "room_days_user_id_date_idx" ON "room_days"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "room_days_user_id_room_id_date_key" ON "room_days"("user_id", "room_id", "date");

-- CreateIndex
CREATE INDEX "breakfast_orders_user_id_breakfast_date_idx" ON "breakfast_orders"("user_id", "breakfast_date");

-- CreateIndex
CREATE UNIQUE INDEX "breakfast_orders_user_id_room_id_breakfast_date_guest_number_key" ON "breakfast_orders"("user_id", "room_id", "breakfast_date", "guest_number");

-- CreateIndex
CREATE INDEX "room_day_extras_user_id_date_idx" ON "room_day_extras"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "room_day_extras_user_id_room_id_date_key" ON "room_day_extras"("user_id", "room_id", "date");

-- CreateIndex
CREATE INDEX "stock_items_user_id_kind_idx" ON "stock_items"("user_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "stock_items_user_id_code_key" ON "stock_items"("user_id", "code");

-- CreateIndex
CREATE INDEX "stock_ledger_days_user_id_date_idx" ON "stock_ledger_days"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "stock_ledger_days_user_id_stock_item_id_date_key" ON "stock_ledger_days"("user_id", "stock_item_id", "date");

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_days" ADD CONSTRAINT "room_days_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_days" ADD CONSTRAINT "room_days_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breakfast_orders" ADD CONSTRAINT "breakfast_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breakfast_orders" ADD CONSTRAINT "breakfast_orders_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_day_extras" ADD CONSTRAINT "room_day_extras_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_day_extras" ADD CONSTRAINT "room_day_extras_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ledger_days" ADD CONSTRAINT "stock_ledger_days_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ledger_days" ADD CONSTRAINT "stock_ledger_days_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "stock_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
