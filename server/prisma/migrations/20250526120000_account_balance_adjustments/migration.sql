-- CreateTable
CREATE TABLE "account_balance_adjustments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_balance_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "account_balance_adjustments_account_id_date_idx" ON "account_balance_adjustments"("account_id", "date");

-- CreateIndex
CREATE INDEX "account_balance_adjustments_user_id_account_id_idx" ON "account_balance_adjustments"("user_id", "account_id");

-- AddForeignKey
ALTER TABLE "account_balance_adjustments" ADD CONSTRAINT "account_balance_adjustments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_balance_adjustments" ADD CONSTRAINT "account_balance_adjustments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
