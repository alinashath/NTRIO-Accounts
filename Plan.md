# Income & Expense Management System — Cursor Project Plan

## Project Overview

Build a web-based personal finance management system. Users can track income and expenses by category, settle every transaction against a real account (bank or cash), manage debts and repayments, and generate flexible PnL reports.

---

## Tech Stack

- **Frontend**: React + TypeScript, Tailwind CSS, Recharts
- **Backend**: Node.js + Express, REST API
- **Database**: PostgreSQL with Prisma ORM
- **Auth**: Supabase Auth (email/password + Google OAuth)
- **File Storage**: Supabase Storage (receipt attachments)
- **PDF Export**: react-pdf
- **State Management**: Zustand
- **Date handling**: date-fns

---

## Project Structure

```
/
├── client/                        # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── accounts/
│   │   │   ├── income/
│   │   │   ├── expenses/
│   │   │   ├── debts/
│   │   │   ├── reports/
│   │   │   └── shared/
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Accounts.tsx
│   │   │   ├── Income.tsx
│   │   │   ├── Expenses.tsx
│   │   │   ├── Debts.tsx
│   │   │   └── Reports.tsx
│   │   ├── hooks/
│   │   ├── store/
│   │   ├── types/
│   │   └── lib/
├── server/                        # Express backend
│   ├── routes/
│   │   ├── accounts.ts
│   │   ├── income.ts
│   │   ├── expenses.ts
│   │   ├── debts.ts
│   │   └── reports.ts
│   ├── controllers/
│   ├── middleware/
│   └── prisma/
│       └── schema.prisma
└── shared/
    └── types.ts
```

---

## Database Schema

### accounts
```sql
id          UUID PRIMARY KEY
user_id     UUID REFERENCES users
name        TEXT NOT NULL
type        ENUM('bank', 'cash', 'wallet')
currency    TEXT DEFAULT 'USD'
balance     DECIMAL(15,2) DEFAULT 0
opened_at   DATE
created_at  TIMESTAMP
```

### categories
```sql
id          UUID PRIMARY KEY
user_id     UUID REFERENCES users
name        TEXT NOT NULL
type        ENUM('income', 'expense')
color       TEXT
icon        TEXT
created_at  TIMESTAMP
```

### income_entries
```sql
id              UUID PRIMARY KEY
user_id         UUID REFERENCES users
amount          DECIMAL(15,2) NOT NULL
date            DATE NOT NULL
description     TEXT
category_id     UUID REFERENCES categories
account_id      UUID REFERENCES accounts
source          TEXT
notes           TEXT
tags            TEXT[]
attachment_url  TEXT
recurring_id    UUID REFERENCES recurring_schedules
created_at      TIMESTAMP
updated_at      TIMESTAMP
```

### expense_entries
```sql
id              UUID PRIMARY KEY
user_id         UUID REFERENCES users
amount          DECIMAL(15,2) NOT NULL
date            DATE NOT NULL
description     TEXT
category_id     UUID REFERENCES categories
account_id      UUID REFERENCES accounts
merchant        TEXT
notes           TEXT
tags            TEXT[]
attachment_url  TEXT
recurring_id    UUID REFERENCES recurring_schedules
created_at      TIMESTAMP
updated_at      TIMESTAMP
```

### expense_splits
```sql
id              UUID PRIMARY KEY
expense_id      UUID REFERENCES expense_entries
category_id     UUID REFERENCES categories
amount          DECIMAL(15,2)
percentage      DECIMAL(5,2)
```

### recurring_schedules
```sql
id           UUID PRIMARY KEY
user_id      UUID REFERENCES users
type         ENUM('income', 'expense')
frequency    ENUM('daily','weekly','fortnightly','monthly','quarterly','annually')
next_date    DATE
end_date     DATE
is_active    BOOLEAN DEFAULT true
template     JSONB
```

### debts
```sql
id              UUID PRIMARY KEY
user_id         UUID REFERENCES users
direction       ENUM('i_owe', 'owed_to_me')
contact_name    TEXT NOT NULL
principal       DECIMAL(15,2) NOT NULL
interest_rate   DECIMAL(5,2) DEFAULT 0
due_date        DATE
notes           TEXT
status          ENUM('open', 'settled') DEFAULT 'open'
created_at      TIMESTAMP
```

### debt_payments
```sql
id          UUID PRIMARY KEY
debt_id     UUID REFERENCES debts
account_id  UUID REFERENCES accounts
amount      DECIMAL(15,2) NOT NULL
date        DATE NOT NULL
notes       TEXT
created_at  TIMESTAMP
```

### account_transfers
```sql
id              UUID PRIMARY KEY
user_id         UUID REFERENCES users
from_account_id UUID REFERENCES accounts
to_account_id   UUID REFERENCES accounts
amount          DECIMAL(15,2) NOT NULL
date            DATE NOT NULL
notes           TEXT
created_at      TIMESTAMP
```

---

## Core Business Logic Rules

These rules must be enforced at the service layer, not just the UI:

1. **Every income entry credits its linked account balance.**
2. **Every expense entry debits its linked account balance.**
3. **Every debt repayment debits the account (i_owe) or credits the account (owed_to_me).**
4. **Account transfers are neutral — they debit one account and credit another by the same amount.**
5. **Deleting or editing any entry must recalculate the affected account balance immediately.**
6. **A debt status auto-updates to `settled` when total payments >= principal.**
7. **Recurring entries generate the next entry only after the previous one is confirmed.**

---

## API Endpoints

### Accounts
```
GET    /api/accounts                  — list all accounts with live balances
POST   /api/accounts                  — create account
PUT    /api/accounts/:id              — update account
DELETE /api/accounts/:id              — delete (block if has transactions)
GET    /api/accounts/:id/ledger       — paginated transaction ledger
POST   /api/accounts/transfer         — create account-to-account transfer
```

### Income
```
GET    /api/income                    — list with filters (date, category, account)
POST   /api/income                    — create entry + credit account
PUT    /api/income/:id                — update entry + recalculate balance
DELETE /api/income/:id                — delete entry + recalculate balance
```

### Expenses
```
GET    /api/expenses                  — list with filters
POST   /api/expenses                  — create entry + debit account
PUT    /api/expenses/:id              — update entry + recalculate balance
DELETE /api/expenses/:id              — delete entry + recalculate balance
```

### Categories
```
GET    /api/categories                — list all (optionally filter by type)
POST   /api/categories                — create
PUT    /api/categories/:id            — update
DELETE /api/categories/:id            — delete (block if has linked entries)
```

### Debts
```
GET    /api/debts                     — list with status filter
POST   /api/debts                     — create debt record
POST   /api/debts/merge                — merge debts (same direction & currency): keep one, move payments & charges, sum principals
POST   /api/debts/:id/add-principal    — increase principal on an existing debt (+ optional audit note)
PUT    /api/debts/:id                 — update debt
POST   /api/debts/:id/payments        — record repayment + adjust account balance
GET    /api/debts/:id/payments        — payment history for a debt
```

### Reports
```
GET    /api/reports/pnl               — PnL for a date range, optional filters
GET    /api/reports/cashflow          — account-level cashflow
GET    /api/reports/net-worth         — net worth snapshot at a date
GET    /api/reports/category-breakdown — category totals for a period
POST   /api/reports/export            — generate PDF or CSV export
```

---

## Pages & Components

### Dashboard (`/`)
- Net worth summary card
- Current month income / expenses / net profit cards
- Income vs expense trend chart (last 30 days, bar chart)
- Top 5 expense categories (donut chart)
- Recent transactions list (last 10)
- Upcoming recurring entries (next 7 days)
- Overdue debts alert strip

### Accounts (`/accounts`)
- Account cards grid (balance, type, account name)
- "New Account" button
- Click account → open ledger drawer (full transaction history with running balance)
- Transfer button between accounts

### Income (`/income`)
- Date range filter + category filter + account filter
- Income entries table (date, description, category badge, amount, account)
- Category breakdown chart (side panel or toggle)
- "New Income" form (amount, date, category, account, notes, attachment, recurring toggle)

### Expenses (`/expenses`)
- Same filters as income
- Expense entries table
- Budget progress bars per category (if budgets set)
- "New Expense" form (same fields + merchant, split expense option)

### Debts (`/debts`)
- Summary row: total I owe, total owed to me, net
- Two tabs: "I Owe" and "Owed to Me"
- Debt card per record: contact, principal, paid, outstanding, progress bar, due date badge
- "Record Payment" modal → select account, amount, date
- Settled debts archived section (collapsible)

### Reports (`/reports`)
- Period selector: Today / This Week / This Month / This Quarter / This Year / Custom
- Account filter, category filter, tag filter
- PnL summary table: total income, total expenses, gross profit, net
- Category breakdown table with % column
- Trend chart: income vs expenses vs net (line chart, auto-grouped)
- Compare periods toggle (side-by-side)
- Export as PDF / CSV buttons

### Settings (`/settings`)
- Manage income categories (CRUD, color, icon)
- Manage expense categories (CRUD, color, icon, budget limit)
- Manage tags
- Default currency
- Data export (full JSON)

---

## Component List

```
AccountCard
AccountLedgerDrawer
TransferModal
IncomeForm
ExpenseForm
ExpenseSplitInput
CategoryBadge
CategoryPicker
AccountPicker
RecurringToggle
AttachmentUpload
DebtCard
DebtPaymentModal
DebtProgressBar
PnlSummaryTable
CategoryBreakdownTable
TrendChart             (Recharts LineChart or BarChart)
CategoryDonutChart     (Recharts PieChart)
BudgetProgressBar
PeriodSelector
DateRangePicker
ReportExportButton
FilterBar
TransactionTable
SummaryStatCard
AlertBanner
```

---

## Key Implementation Notes

- **Balance recalculation**: When an entry is edited or deleted, recompute the account balance from scratch using a DB aggregate query (`SUM of all credits - SUM of all debits`) rather than storing deltas. This prevents drift.
- **Soft deletes**: Never hard-delete transactions — add a `deleted_at` column. This preserves audit history.
- **Recurring entries**: Store a `recurring_schedules` template. A cron job (or on-login check) generates the next entry when `next_date <= today`.
- **Report queries**: Run all PnL and cashflow reports as a single aggregated SQL query with GROUP BY category — avoid fetching all rows into memory.
- **Debt auto-settle**: After inserting a `debt_payment`, run a check: if `SUM(payments) >= debt.principal`, set `debt.status = 'settled'`.
- **Transfers**: Record as two rows — one debit on `from_account`, one credit on `to_account` — linked by the same `transfer_id`. Do NOT appear in income/expense PnL.
- **Currency**: Store all amounts in the account's base currency. If multi-currency is added later, store `original_amount`, `original_currency`, `exchange_rate` alongside the base amount.

---

## Build Order (Suggested Phases)

### Phase 1 — Foundation
- [ ] Project scaffolding (Vite + React + TypeScript + Tailwind)
- [ ] Supabase project setup (auth + database)
- [ ] Prisma schema + migrations
- [ ] Auth flow (sign up, sign in, protected routes)
- [ ] Account CRUD + balance calculation logic

### Phase 2 — Core Transactions
- [ ] Category CRUD (income + expense)
- [ ] Income entry CRUD + account balance update
- [ ] Expense entry CRUD + account balance update
- [ ] Account-to-account transfers
- [ ] Basic transaction lists with filters

### Phase 3 — Debts
- [ ] Debt record CRUD
- [ ] Debt payment recording + account adjustment
- [ ] Auto-settle logic
- [ ] Debt dashboard with summary cards

### Phase 4 — Reports
- [ ] PnL query + PnL summary page
- [ ] Category breakdown table + chart
- [ ] Trend chart (income vs expenses over time)
- [ ] Period selector + custom date range
- [ ] PDF and CSV export

### Phase 5 — Polish
- [ ] Recurring income/expense schedules
- [ ] Budget limits per expense category
- [ ] Expense split across categories
- [ ] File attachments (receipts)
- [ ] Duplicate expense detection
- [ ] Period-over-period comparison in reports
- [ ] Mobile responsive pass
- [ ] Full keyboard navigation

---

## Environment Variables

```env
DATABASE_URL=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=receipts
JWT_SECRET=
PORT=3001
```

---

## Notes for Cursor

- Use **Prisma** for all DB queries — never write raw SQL except for complex report aggregations.
- Keep business logic (balance updates, debt auto-settle) in **service files**, not in route handlers or React components.
- All monetary values are `DECIMAL(15,2)` in the DB and `number` (rounded to 2dp) in TypeScript — never use floats for currency math; use a helper `toMoney(n: number): number => Math.round(n * 100) / 100`.
- Every API route must validate input with **Zod** before touching the database.
- React components should be **dumb** — they receive data via props or hooks, they do not call the API directly. All API calls go through a `hooks/use*.ts` file.