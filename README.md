# Income & expense system (from Plan.md)

Monorepo layout:

- `client/` — Vite + React + TypeScript + Tailwind v4 + Recharts + Zustand + Supabase Auth (browser)
- `server/` — Express + Zod + Prisma (PostgreSQL) + Supabase token verification (service role)
- `shared/types.ts` — shared DTO-style types for the client

This mirrors the plan’s **client / server / shared** split while using **Supabase for Auth** and **optional Storage** for receipt files (public bucket recommended). All business data lives in **your Postgres** via Prisma.

## Prerequisites

- Node 20+
- A Supabase project (for Auth). Copy **Project URL**, **anon key**, and **service role key**.
- Postgres URLs from Supabase (same DB as Auth): **`DATABASE_URL`** = pooled connection for the app; **`DIRECT_URL`** = direct connection for Prisma migrations (see `server/prisma/schema.prisma` `directUrl`).

## Setup

1. **Install**

   ```bash
   npm install
   ```

2. **Environment — `server/.env`**

   ```env
   DATABASE_URL="postgresql://…pooler…:6543/postgres?pgbouncer=true&…"
   DIRECT_URL="postgresql://postgres:PASSWORD@db.YOUR_PROJECT_REF.supabase.co:5432/postgres?sslmode=require"
   SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
   SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
   PORT=3001
   CLIENT_ORIGIN="http://localhost:5173"
   ```

3. **Environment — `client/.env`**

   ```env
   VITE_SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
   VITE_SUPABASE_ANON_KEY="your-anon-key"
   # When the UI and API are on different origins (LAN IP, production split, etc.):
   # VITE_API_BASE_URL="http://localhost:3001"
   # VITE_SUPABASE_RECEIPTS_BUCKET=receipts
   ```

4. **Database**

   **Fastest hard reset (dev / disposable DB)** — drops this app’s `public` tables + enums (not `auth.*`), then recreates from `schema.prisma` without Prisma’s migrate shadow DB:

   ```bash
   npm run db:nuke
   ```

   Same from `server/`: `npm run db:nuke`. Uses `DATABASE_URL` from `server/.env` (pooler is fine for `db execute` + `db push`).

   **If you need `_prisma_migrations` repopulated** after the drop (CI-style):

   ```bash
   npm run db:nuke:migrate -w server
   ```

   (`db:nuke:migrate` = same SQL + `prisma migrate deploy`.)

   Other commands: `npm run db:migrate -w server` (interactive migrate dev), `npm run db:deploy -w server`, `npm run db:reset -w server` (Prisma reset; can be slow / picky on Supabase).

   **Data-only reset (DELETE rows, keep tables and migrations):** [server/data/README.md](server/data/README.md) — `npm run db:clear-data -w server -- --user-id <your-auth-uuid>` (or `CONFIRM_CLEAR_ALL=yes npm run db:clear-data -w server -- --all` for every user’s app rows).

   **Migration files:** `server/prisma/migrations/` — baseline `20240101000000_init`. `npm run db:audit-migrations -w server` flags folders missing `migration.sql` (P3015). After pulling, run **`npm run db:deploy -w server`** so new columns (e.g. `debts.contact_id`, `expense_entries.pay_later`) exist — missing columns often surface as **500** on `/api/debts` and related routes. If deploy fails with **P3005**, the DB was never empty for the first migration (see below); **`db:deploy` alone is not enough** until you **`db:nuke:migrate`** or **`migrate resolve`** baseline.

   **If `prisma migrate dev` fails with P3015** (“Could not find the migration file at migration.sql”): `npm run db:migrate -w server` runs the audit first and prints the bad folder. Remove empty migration dirs with `npm run db:audit-migrations -w server -- --remove-empty`, or add the missing `migration.sql` yourself, then run migrate again.

   **If many `/api/*` routes return 500 or 503 after pulling:** the database is usually **behind** the Prisma schema (new columns such as `user_settings`, `expense_entries.pay_later`, `debts.contact_id`). **`npm run db:deploy -w server`** only works once Prisma is allowed to apply migrations (see **P3005** below). Use a correct **`DIRECT_URL`** (Supabase **direct** host `db.<ref>.supabase.co` on port **5432**). If `prisma migrate deploy` prints a datasource on **`pooler.*.supabase.com`** only, double-check **`DIRECT_URL`** in `server/.env` — migrations should hit the **direct** host, not the pooler. The API may respond with **503** and a JSON **`hint`**. Regenerate the client with **`cd server && npx prisma generate`** after schema changes. For a disposable dev DB only, **`npm run db:push -w server`** can sync the schema without migration files (avoid on shared/production databases).

   **If `prisma migrate deploy` fails with P3005** (“The database schema is not empty”): your **`public`** schema already has app tables, but Prisma has **not** recorded the initial migration on this database (common after **`db push`**, hand-built SQL, or an older setup). **`migrate deploy` cannot run the first migration** against a non-empty DB.

   - **Dev / you can wipe app tables:** run **`npm run db:nuke:migrate -w server`**. That drops this app’s tables, enums, and **`_prisma_migrations`**, then runs **`migrate deploy`** from a clean slate (Supabase **`auth.*`** is untouched; **your business rows in `public` are deleted**).
   - **Keep data:** baseline only migrations whose SQL is **already** true in your DB — from `server/`, run **`npx prisma migrate resolve --applied <folder_name>`** once per migration (no SQL is executed). Folder names under `prisma/migrations/` are: `20240101000000_init`, `20250524120000_account_transfer_exchange_rate`, `20250524140000_user_settings_debt_fx_expense_debt`, `20250525140000_debt_contact_pay_later_repair`. Mark as applied everything the DB already matches, then run **`npm run db:deploy -w server`** so any **remaining** migrations apply. If you mark too much as applied, the DB will stay wrong — when unsure, prefer **`db:nuke:migrate`** on a disposable DB or compare with [Prisma baselining](https://www.prisma.io/docs/guides/migrate/developing-with-prisma-migrate/add-prisma-migrate-to-a-project-with-a-baseline).

### Receipt uploads (Supabase Storage)

1. In the Supabase dashboard, open **SQL** and run **`server/scripts/storage-receipts-bucket.sql`**. That creates the public **`receipts`** bucket and RLS policies so authenticated users can upload only under **`{their_user_id}/…`**, with public read for URLs saved on rows.
2. Optional: set **`VITE_SUPABASE_RECEIPTS_BUCKET`** in `client/.env` if you use a different bucket name, then restart Vite.

The client uses the Supabase browser client + session to upload; the public object URL is stored in **`attachment_url`** on income, expense, and debt payment records.

### If `prisma migrate` fails with **P1001** (“Can’t reach database server”)

- **`DIRECT_URL`** should match Supabase **Project Settings → Database → Connection string → Direct** (host `db.<ref>.supabase.co`, user `postgres`), not a placeholder password. Add **`?sslmode=require`** if missing.
- **`DATABASE_URL`** should be the **transaction pooler** string (port **6543**, with **`pgbouncer=true`** as in the Supabase “Prisma” snippet), not the same as `DIRECT_URL`.
- **IPv6 / network**: direct host often uses IPv6; if your network blocks it, use Supabase’s **IPv4 add-on** or try another network. Outbound **5432** must be allowed (some corporate Wi‑Fi blocks it).
- Confirm the project is **not paused** and the DB password is the **current** database password from the dashboard.

5. **Run**

   ```bash
   npm run dev
   ```

   - API: `http://localhost:3001`
   - UI: `http://localhost:5173` (by default, `fetch("/api/…")` is proxied to the API). If the client runs on another host/port or you call the API directly, set **`VITE_API_BASE_URL`** to the API origin and add that UI origin to **`CLIENT_ORIGIN`** on the server (comma-separated) so CORS allows it.

## Implemented vs plan

| Area | Status |
|------|--------|
| Prisma schema (accounts, categories, income/expense, splits, recurring, debts, transfers, contacts) | Done |
| Balance recompute service | Done |
| Soft delete income/expense | Done |
| Void income/expense + void debt payments (excluded from balances & reports) | Done |
| Contacts + link to income/expense | Done |
| Debt payments + auto-settle | Done |
| REST routes from plan | Done (PDF export returns 501; add react-pdf on the client or a template engine on the server later) |
| Dashboard / Accounts / Contacts / Income / Expenses / Debts / Reports / Settings | Done (MVP UI) |
| Recurring generation cron | Not implemented (Phase 5) |
| Receipt attachments | Client upload to Supabase Storage + `attachment_url` (income, expense, debt payments) |

## Money helper

Server and client both use `toMoney` (2 decimal rounding) per the plan.

## Notes

- The `users` table stores `id` equal to Supabase `auth.users.id` and is upserted on each authenticated API call.
- **Google OAuth**: enable the provider in Supabase and add your site URL to redirect allowlist.
- If this repo previously contained another app (e.g. Next.js), keep that work on a branch; this scaffold is the Plan.md greenfield stack.
