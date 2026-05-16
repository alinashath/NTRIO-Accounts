# NTRIO Accounts

Mobile-first small business accounting built on [pgledger](https://github.com/pgr0ss/pgledger) — a double-entry ledger in PostgreSQL.

## Stack

- **Database**: PostgreSQL (Supabase) with pgledger core + NTRIO business layer
- **App**: Next.js 15, React 19, Tailwind CSS 4

## Database structure

Migrations run in order:

1. `20250516000001_ulid_helpers.sql` — ULID/UUID helpers (from scoville/pgsql-ulid)
2. `20250516000002_pgledger.sql` — Full pgledger double-entry ledger ([source](https://github.com/pgr0ss/pgledger/blob/main/pgledger.sql))
3. `20250516000003_ntrio_business_layer.sql` — Small business chart of accounts, views, and RPCs

### pgledger (core)

| Object | Purpose |
|--------|---------|
| `pgledger_accounts` | Ledger accounts with balance, version, currency |
| `pgledger_transfers` | Money movement between two accounts |
| `pgledger_entries` | Double-entry lines with running balances |
| `pgledger_create_account()` | Create account |
| `pgledger_create_transfer()` | Post a transfer atomically |

### NTRIO layer

| Object | Purpose |
|--------|---------|
| `businesses` | Company profile |
| `business_accounts` | Maps chart-of-accounts codes to pgledger accounts |
| `transaction_details` | Labels transfers as income / expense / transfer |
| `ntrio_create_business()` | Bootstrap business + standard COA |
| `ntrio_record_income()` | Sales → Cash |
| `ntrio_record_expense()` | Cash → Expense account |
| `ntrio_record_transfer()` | Asset-to-asset transfer |

## Features

- **Email auth** — sign up, sign in, password reset (Supabase Auth)
- **Multi-business** — switch businesses from the header; plan limits how many you can create
- **Subscriptions** — 14-day trial on signup; Starter / Pro / Firm plans with `ntrio_change_plan()` (Stripe-ready columns)

## Setup

1. Create a [Supabase](https://supabase.com) project.

2. In **Authentication → Providers**, enable **Email** (confirm email recommended for production).

3. In **Authentication → URL configuration**, set:
   - Site URL: `http://localhost:3000`
   - Redirect URLs: `http://localhost:3000/auth/callback`

4. Apply migrations (in order):

   ```bash
   npx supabase link --project-ref YOUR_REF
   npx supabase db push
   ```

5. Copy env and install:

   ```bash
   cp .env.local.example .env.local
   npm install
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) → **Sign up** → confirm email → create your first business.

### Subscription plans

| Plan    | Businesses | Price   |
|---------|------------|---------|
| Starter | 1          | $19/mo  |
| Pro     | 5          | $49/mo  |
| Firm    | Unlimited  | $99/mo  |

New users get a **14-day Starter trial** automatically (`handle_new_user` trigger).

## License

pgledger is MIT licensed. See [pgledger LICENSE](https://github.com/pgr0ss/pgledger/blob/main/LICENSE).
