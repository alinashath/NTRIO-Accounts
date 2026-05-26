-- Baseline: full schema (from current Prisma schema). Must run before any ALTER-only migrations.
CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "AccountType" AS ENUM ('bank', 'cash', 'wallet');
CREATE TYPE "CategoryKind" AS ENUM ('income', 'expense');
CREATE TYPE "RecurringType" AS ENUM ('income', 'expense');
CREATE TYPE "RecurringFrequency" AS ENUM ('daily', 'weekly', 'fortnightly', 'monthly', 'quarterly', 'annually');
CREATE TYPE "DebtDirection" AS ENUM ('i_owe', 'owed_to_me');
CREATE TYPE "DebtStatus" AS ENUM ('open', 'settled');
CREATE TYPE "ContactKind" AS ENUM ('vendor', 'customer', 'other');

CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contacts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ContactKind" NOT NULL DEFAULT 'other'::"ContactKind",
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "opening_balance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "opened_at" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CategoryKind" NOT NULL,
    "color" TEXT,
    "icon" TEXT,
    "budget_limit" DECIMAL(15,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "recurring_schedules" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "RecurringType" NOT NULL,
    "frequency" "RecurringFrequency" NOT NULL,
    "next_date" DATE,
    "end_date" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "template" JSONB NOT NULL,
    CONSTRAINT "recurring_schedules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "debts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "direction" "DebtDirection" NOT NULL,
    "contact_name" TEXT NOT NULL,
    "principal" DECIMAL(15,2) NOT NULL,
    "interest_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "due_date" DATE,
    "notes" TEXT,
    "status" "DebtStatus" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "debts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "income_entries" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT,
    "category_id" UUID,
    "account_id" UUID NOT NULL,
    "source" TEXT,
    "notes" TEXT,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "attachment_url" TEXT,
    "contact_id" UUID,
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "recurring_id" UUID,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "income_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "expense_entries" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT,
    "category_id" UUID,
    "account_id" UUID NOT NULL,
    "merchant" TEXT,
    "notes" TEXT,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "attachment_url" TEXT,
    "contact_id" UUID,
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "recurring_id" UUID,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "expense_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "expense_splits" (
    "id" UUID NOT NULL,
    "expense_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "percentage" DECIMAL(5,2),
    CONSTRAINT "expense_splits_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "debt_payments" (
    "id" UUID NOT NULL,
    "debt_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "date" DATE NOT NULL,
    "notes" TEXT,
    "attachment_url" TEXT,
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "debt_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "account_transfers" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "from_account_id" UUID NOT NULL,
    "to_account_id" UUID NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "exchange_rate" DECIMAL(18,8),
    "date" DATE NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "account_transfers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "contacts_user_id_idx" ON "contacts"("user_id");
CREATE INDEX "contacts_user_id_kind_idx" ON "contacts"("user_id", "kind");
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");
CREATE INDEX "categories_user_id_type_idx" ON "categories"("user_id", "type");
CREATE INDEX "recurring_schedules_user_id_idx" ON "recurring_schedules"("user_id");
CREATE INDEX "debts_user_id_status_idx" ON "debts"("user_id", "status");
CREATE INDEX "income_entries_user_id_date_idx" ON "income_entries"("user_id", "date");
CREATE INDEX "income_entries_account_id_idx" ON "income_entries"("account_id");
CREATE INDEX "income_entries_contact_id_idx" ON "income_entries"("contact_id");
CREATE INDEX "expense_entries_user_id_date_idx" ON "expense_entries"("user_id", "date");
CREATE INDEX "expense_entries_account_id_idx" ON "expense_entries"("account_id");
CREATE INDEX "expense_entries_contact_id_idx" ON "expense_entries"("contact_id");
CREATE INDEX "expense_splits_expense_id_idx" ON "expense_splits"("expense_id");
CREATE INDEX "debt_payments_debt_id_idx" ON "debt_payments"("debt_id");
CREATE INDEX "account_transfers_user_id_date_idx" ON "account_transfers"("user_id", "date");

ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recurring_schedules" ADD CONSTRAINT "recurring_schedules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "debts" ADD CONSTRAINT "debts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "income_entries" ADD CONSTRAINT "income_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "income_entries" ADD CONSTRAINT "income_entries_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "income_entries" ADD CONSTRAINT "income_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "income_entries" ADD CONSTRAINT "income_entries_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "income_entries" ADD CONSTRAINT "income_entries_recurring_id_fkey" FOREIGN KEY ("recurring_id") REFERENCES "recurring_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "expense_entries" ADD CONSTRAINT "expense_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expense_entries" ADD CONSTRAINT "expense_entries_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "expense_entries" ADD CONSTRAINT "expense_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense_entries" ADD CONSTRAINT "expense_entries_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "expense_entries" ADD CONSTRAINT "expense_entries_recurring_id_fkey" FOREIGN KEY ("recurring_id") REFERENCES "recurring_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "expense_splits" ADD CONSTRAINT "expense_splits_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expense_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expense_splits" ADD CONSTRAINT "expense_splits_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_debt_id_fkey" FOREIGN KEY ("debt_id") REFERENCES "debts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "account_transfers" ADD CONSTRAINT "account_transfers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "account_transfers" ADD CONSTRAINT "account_transfers_from_account_id_fkey" FOREIGN KEY ("from_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "account_transfers" ADD CONSTRAINT "account_transfers_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
