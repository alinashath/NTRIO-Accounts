-- Hot-path FK / filter indexes for ledger, kitchen, and stock queries.

CREATE INDEX IF NOT EXISTS "income_entries_category_id_idx" ON "income_entries"("category_id");
CREATE INDEX IF NOT EXISTS "income_entries_recurring_id_idx" ON "income_entries"("recurring_id");

CREATE INDEX IF NOT EXISTS "expense_entries_user_id_bill_date_idx" ON "expense_entries"("user_id", "bill_date");
CREATE INDEX IF NOT EXISTS "expense_entries_user_id_paid_date_idx" ON "expense_entries"("user_id", "paid_date");
CREATE INDEX IF NOT EXISTS "expense_entries_category_id_idx" ON "expense_entries"("category_id");
CREATE INDEX IF NOT EXISTS "expense_entries_recurring_id_idx" ON "expense_entries"("recurring_id");

CREATE INDEX IF NOT EXISTS "expense_splits_category_id_idx" ON "expense_splits"("category_id");

CREATE INDEX IF NOT EXISTS "debt_payments_account_id_idx" ON "debt_payments"("account_id");

CREATE INDEX IF NOT EXISTS "account_transfers_from_account_id_idx" ON "account_transfers"("from_account_id");
CREATE INDEX IF NOT EXISTS "account_transfers_to_account_id_idx" ON "account_transfers"("to_account_id");

CREATE INDEX IF NOT EXISTS "room_stays_room_id_idx" ON "room_stays"("room_id");
CREATE INDEX IF NOT EXISTS "room_days_room_id_idx" ON "room_days"("room_id");
CREATE INDEX IF NOT EXISTS "breakfast_orders_room_id_idx" ON "breakfast_orders"("room_id");
CREATE INDEX IF NOT EXISTS "breakfast_orders_menu_id_idx" ON "breakfast_orders"("menu_id");
CREATE INDEX IF NOT EXISTS "room_day_extras_room_id_idx" ON "room_day_extras"("room_id");

CREATE INDEX IF NOT EXISTS "stock_items_user_id_is_active_idx" ON "stock_items"("user_id", "is_active");
CREATE INDEX IF NOT EXISTS "stock_items_user_id_sort_order_idx" ON "stock_items"("user_id", "sort_order");

CREATE INDEX IF NOT EXISTS "stock_products_user_id_is_active_idx" ON "stock_products"("user_id", "is_active");
CREATE INDEX IF NOT EXISTS "stock_products_user_id_stock_item_id_idx" ON "stock_products"("user_id", "stock_item_id");
CREATE INDEX IF NOT EXISTS "stock_products_stock_item_id_is_active_idx" ON "stock_products"("stock_item_id", "is_active");

-- Drop superseded single-column user_id index if Prisma previously created it.
DROP INDEX IF EXISTS "stock_products_user_id_idx";

CREATE INDEX IF NOT EXISTS "recipe_lines_stock_item_id_idx" ON "recipe_lines"("stock_item_id");
CREATE INDEX IF NOT EXISTS "meal_menu_lines_stock_item_id_idx" ON "meal_menu_lines"("stock_item_id");
CREATE INDEX IF NOT EXISTS "meal_menu_lines_component_recipe_id_idx" ON "meal_menu_lines"("component_recipe_id");

CREATE INDEX IF NOT EXISTS "stock_ledger_days_stock_item_id_date_idx" ON "stock_ledger_days"("stock_item_id", "date");
