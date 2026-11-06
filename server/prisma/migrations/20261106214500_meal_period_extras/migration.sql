-- Independent fruits/extras per meal period (breakfast / lunch / dinner).
CREATE TYPE "MealPeriod" AS ENUM ('breakfast', 'lunch', 'dinner');

ALTER TABLE "room_day_extras"
  ADD COLUMN IF NOT EXISTS "meal_period" "MealPeriod" NOT NULL DEFAULT 'breakfast';

ALTER TABLE "room_day_extras"
  DROP CONSTRAINT IF EXISTS "room_day_extras_user_id_room_id_date_key";

CREATE UNIQUE INDEX IF NOT EXISTS "room_day_extras_user_id_room_id_date_meal_period_key"
  ON "room_day_extras" ("user_id", "room_id", "date", "meal_period");
