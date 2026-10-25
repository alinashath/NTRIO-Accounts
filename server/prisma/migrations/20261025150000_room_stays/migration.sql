-- CreateTable
CREATE TABLE "room_stays" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,
    "occupant_count" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_stays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "room_stays_user_id_from_date_to_date_idx" ON "room_stays"("user_id", "from_date", "to_date");

-- CreateIndex
CREATE INDEX "room_stays_user_id_room_id_idx" ON "room_stays"("user_id", "room_id");

-- AddForeignKey
ALTER TABLE "room_stays" ADD CONSTRAINT "room_stays_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_stays" ADD CONSTRAINT "room_stays_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
