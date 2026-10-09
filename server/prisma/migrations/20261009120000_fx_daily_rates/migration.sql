-- CreateTable
CREATE TABLE "fx_daily_rates" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "rate_date" DATE NOT NULL,
    "usd_mvr_rate" DECIMAL(18,8) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fx_daily_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fx_daily_rates_user_id_rate_date_idx" ON "fx_daily_rates"("user_id", "rate_date");

-- CreateIndex
CREATE UNIQUE INDEX "fx_daily_rates_user_id_rate_date_key" ON "fx_daily_rates"("user_id", "rate_date");

-- AddForeignKey
ALTER TABLE "fx_daily_rates" ADD CONSTRAINT "fx_daily_rates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Change default for current FX rate to 20
ALTER TABLE "user_settings" ALTER COLUMN "global_usd_mvr_rate" SET DEFAULT 20;

-- Backfill: historical baseline 1 USD = 20 MVR for every user that has settings
INSERT INTO "fx_daily_rates" ("id", "user_id", "rate_date", "usd_mvr_rate", "created_at", "updated_at")
SELECT gen_random_uuid(), us."user_id", DATE '1970-01-01', 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "user_settings" us
ON CONFLICT ("user_id", "rate_date") DO NOTHING;

-- Preserve current behavior going forward: seed today's rate from existing settings
INSERT INTO "fx_daily_rates" ("id", "user_id", "rate_date", "usd_mvr_rate", "created_at", "updated_at")
SELECT gen_random_uuid(), us."user_id", CURRENT_DATE, us."global_usd_mvr_rate", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "user_settings" us
ON CONFLICT ("user_id", "rate_date") DO NOTHING;
