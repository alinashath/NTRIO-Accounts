# Accounting Specification — NTRIO Accounts

| Field | Value |
|-------|--------|
| **Document** | Standard accounting specification |
| **Product** | NTRIO Accounts |
| **Scope** | Rules · Functionality · Data |
| **Excluded** | User interface design, screens, navigation, and presentation rules |
| **Version** | 2026-07-30 |

---

## 1. Purpose

This specification defines the **accounting rules**, **system functionality**, and **data** for NTRIO Accounts: a multi-user income, expense, account, and debt ledger.

It does **not** specify UI layout, interaction patterns, or presentation.

---

## 2. Accounting principles

### 2.1 Books of record

| Book | Purpose |
|------|---------|
| **Accounts** | Cash and near-cash holdings (bank, cash, wallet) with a running balance |
| **Income** | Revenue / receipts recognition (accrual and cash dates) |
| **Expenses** | Costs / disbursements recognition (accrual and cash dates) |
| **Debts** | Amounts the user owes, or that are owed to the user |
| **Contacts** | Counterparties (vendors, customers, other) linked to entries |
| **Categories** | Classification of income and expense for reporting |
| **Transfers** | Movement of value between accounts (not income or expense) |
| **Adjustments** | Manual reconciliation deltas on an account |

### 2.2 Recognition bases

| Basis | Definition |
|-------|------------|
| **Accrual** | Income recognized on earned / invoice date; expense recognized on bill date (includes unpaid pay-later bills) |
| **Cash** | Income when deposited to an account (`received_date`); expense when paid from an account (`paid_date`) |
| **Point-in-time** | Net worth / balance sheet as of a chosen date |

### 2.3 Currency

1. Every monetary amount is denominated in a **currency code** chosen by the user (ISO 4217 style strings, e.g. `USD`, `MVR`, `EUR`).
2. Each **account**, **income entry**, **expense bill**, and **debt** carries its own currency.
3. The user may **set or change currencies at any time** (account currency, entry currency, debt currency, and display/reporting preferences). The system must support conversion when movements cross currencies.
4. Cross-currency **transfers** require an exchange rate: units of destination currency per 1 unit of source currency.
5. Cross-currency **debt payments** record both the debt reduction (debt currency) and the cash movement (account currency), with a derived or supplied rate.
6. Users maintain a **daily FX rate history** (sparse: a rate saved for date `D` applies to all dates from `D` until the next saved rate). Display and report conversion uses the rate effective on each amount’s recognition date. If no rate exists on or before that date, the system uses **20 MVR per 1 USD**. The current Settings rate is the latest/current value used for undated amounts and transfer defaults.
7. All stored money amounts use fixed precision of **2 decimal places**. Exchange rates may use higher precision.

### 2.4 Money arithmetic

- Database amounts: decimal with scale 2.
- Application rounding: round half-up style to 2 decimal places (`toMoney`).
- Account balances are **recomputed from aggregates**, not maintained only as incremental deltas, so they do not drift.

---

## 3. Functionality

### 3.1 Identity and tenancy

| Function | Description |
|----------|-------------|
| Authenticate | User identity via external auth provider; all ledger data is scoped to that user |
| Provision user | Local user profile created/updated on authenticated use (`id` = auth subject) |
| Optional user admin | Designated admins may create additional auth users for the deployment |

### 3.2 Accounts

| Function | Description |
|----------|-------------|
| Create / update / delete account | Name, type (`bank` \| `cash` \| `wallet`), currency, opening balance, opened date |
| Change currency | User may change an account’s currency at any time |
| List accounts | Live balances |
| Account ledger | Chronological statement with running balance (income, expense, transfer in/out, debt cash, adjustments) |
| Transfer | Move value from one account to another; same-currency or cross-currency with rate |
| Adjust balance | Signed reconciliation entry (fees, rounding, true-up) |

**Delete constraint:** An account may not be deleted while it has live (non-deleted, non-voided) linked activity.

### 3.3 Categories

| Function | Description |
|----------|-------------|
| Create / update / delete | Income or expense category; optional color, icon; optional budget limit (expense) |
| Filter by type | List income vs expense categories |

**Delete constraint:** Blocked while linked to non-deleted income or expense entries.

### 3.4 Contacts

| Function | Description |
|----------|-------------|
| Create / update / delete | Name, kind (`vendor` \| `customer` \| `other`), email, phone, tax id, notes |
| Contact statement | Combined income and expense lines for that contact |
| Settle pay-later bills | For a vendor: pay selected unpaid bills from one account on a paid date (same bill currency; account currency must match) |
| Merge pay-later bills | For a vendor: combine multiple unpaid bills into one (same currency) |

### 3.5 Income

| Function | Description |
|----------|-------------|
| Create / update | Amount, currency, earned date, optional received date, category, contact, notes, tags, attachment reference, optional recurring link |
| Pending receivable | Income with no deposit account yet; cash does not affect any account until received |
| Mark received | Assign account and received date; amount currency must match account currency at deposit |
| Soft delete | Hide from books; recalculate balances |
| Void / unvoid | Exclude or restore from balances and reports without removing the record |

### 3.6 Expenses

| Function | Description |
|----------|-------------|
| Create / update | Amount, bill date, optional paid date, category, contact, merchant, notes, tags, attachment, optional splits |
| Settlement modes (exactly one) | (a) Pay from **account**, (b) Charge to **i_owe debt**, (c) **Pay later** (unpaid bill) |
| Category splits | Optional split lines; split amounts must equal expense total |
| Soft delete / void / unvoid | Same semantics as income |

### 3.7 Debts

| Function | Description |
|----------|-------------|
| Create / update | Direction (`i_owe` \| `owed_to_me`), principal, currency, optional contact, interest rate, due date, notes |
| Change currency | User may change debt currency at any time |
| Add principal | Increase principal with optional audit note |
| Merge debts | Merge debts of the same direction and currency into one kept debt |
| Record payment | Reduce debt; optionally different account currency with explicit cash amount / rate |
| Void / unvoid payment | Exclude or restore payment from outstanding and account cash |
| Auto-settle | When outstanding ≤ 0, status is `settled`; otherwise `open` |

**Outstanding** = principal + non-voided expense charges on the debt − non-voided payments (all in debt currency).

Expense charges onto debt are allowed only for direction `i_owe`.

### 3.8 Attachments

| Function | Description |
|----------|-------------|
| Store reference | Persist attachment URL on income, expense, or debt payment |
| Upload store | Binary objects in external object storage; ledger stores URL only |

### 3.9 Reporting

| Function | Description |
|----------|-------------|
| Profit & loss (accrual) | Total income, total expenses, net for a date range; optional category filters |
| Category breakdown | Totals by category; optional prior-period comparison |
| Category detail | Trend and transaction list for one category (or uncategorized) |
| Cashflow | Per-account cash in / out / net for a date range |
| Net worth / balance sheet | Cash positions and debt outstanding as of a date; pay-later unpaid as liability where applicable |
| Export | Machine-readable export of period income and expense (e.g. CSV). PDF optional / future |

Reports may convert amounts into a **user-selected display currency** using the FX rate effective on each amount’s date (daily history with carry-forward; default 20 MVR per 1 USD when no prior rate exists).

### 3.10 Settings

| Function | Description |
|----------|-------------|
| FX rates | Daily USD↔MVR rate history; saving a rate for a date carries forward until the next change; editable anytime |
| Categories maintenance | As in §3.3 |
| User administration | List / create users when admin policy allows |

### 3.11 Deferred / not required by this specification

| Item | Note |
|------|------|
| Recurring schedule generation | Data model may exist; automatic posting is optional future work |
| PDF export | Optional |

---

## 4. Accounting rules

| ID | Rule |
|----|------|
| AR-1 | Posted income **credits** the linked account balance. |
| AR-2 | Account-settled expense **debits** the linked account balance. |
| AR-3 | Debt payment cash: `i_owe` **debits** the account; `owed_to_me` **credits** the account. |
| AR-4 | Transfers are **not** income or expense: debit source account, credit destination account (apply FX when currencies differ). |
| AR-5 | Creating, updating, soft-deleting, voiding, or unvoiding a money-affecting record **recalculates** all affected account balances from opening balance plus live flows. |
| AR-6 | Soft-deleted and voided income, expenses, and debt payments are **excluded** from balances and reports. |
| AR-7 | Voided income/expense records are not editable until unvoided. |
| AR-8 | Pending receivable income has no account; once deposited, it remains a posted income against that account. |
| AR-9 | An expense uses exactly one settlement mode: account **xor** debt **xor** pay later. |
| AR-10 | Only `i_owe` debts may receive expense charges. |
| AR-11 | Debt outstanding = principal + expense charges − payments; status `settled` iff outstanding ≤ 0. |
| AR-12 | Cross-currency transfer requires a positive exchange rate (destination units per 1 source unit). |
| AR-13 | Cross-currency debt payment records debt reduction and account cash amount (and rate). |
| AR-14 | Account and category deletion are blocked while live linked activity exists. |
| AR-15 | Currencies on accounts, entries, debts, and FX preferences are **user-chosen and changeable at any time**. |
| AR-16 | Accrual reports use earned date (income) and bill date (expense). Cashflow uses received/paid dates plus transfers and debt cash. Net worth reconstructs positions as of a date. |
| AR-17 | Balance adjustments are signed: positive increases account balance; negative decreases it. |
| AR-18 | All ledger queries are restricted to the authenticated user’s data. |

### 4.1 Balance formula (per account)

```
balance =
  opening_balance
  + Σ income (not deleted, not voided, this account)
  − Σ expenses (not deleted, not voided, this account)
  − Σ transfers out (amount in this account’s currency)
  + Σ transfers in (amount, or amount × rate when credited from another currency)
  + Σ debt payment cash effects (signed by debt direction; use account_amount when set)
  + Σ balance adjustments
```

---

## 5. Data

### 5.1 Entity relationship (logical)

```
User
 ├── Account
 │    ├── IncomeEntry (when deposited)
 │    ├── ExpenseEntry (when paid from account)
 │    ├── DebtPayment
 │    ├── AccountTransfer (from / to)
 │    └── AccountBalanceAdjustment
 ├── Category ── IncomeEntry / ExpenseEntry / ExpenseSplit
 ├── Contact ─── IncomeEntry / ExpenseEntry / Debt
 ├── Debt ────── DebtPayment / ExpenseEntry (charges)
 ├── RecurringSchedule ── IncomeEntry / ExpenseEntry (optional)
 ├── UserSettings (current FX)
 └── FxDailyRate (sparse daily FX history)
```

### 5.2 Entities and attributes

#### User
| Attribute | Type | Notes |
|-----------|------|--------|
| id | UUID | Equals auth provider subject |
| email | string? | Mirror for administration |
| created_at | timestamp | |

#### UserSettings
| Attribute | Type | Notes |
|-----------|------|--------|
| user_id | UUID PK | |
| global_usd_mvr_rate | decimal(18,8) | Current MVR per 1 USD (header / defaults); default 20 |
| updated_at | timestamp | |

#### FxDailyRate
| Attribute | Type | Notes |
|-----------|------|--------|
| id | UUID | |
| user_id | UUID | |
| rate_date | date | Day the rate becomes effective |
| usd_mvr_rate | decimal(18,8) | MVR units per 1 USD |
| created_at / updated_at | timestamp | |

*Sparse history: unique `(user_id, rate_date)`. Lookup = latest row with `rate_date ≤ as-of`; else 20. Baseline row at 1970-01-01 with rate 20 may be seeded per user.*

#### Account
| Attribute | Type | Notes |
|-----------|------|--------|
| id | UUID | |
| user_id | UUID | |
| name | string | |
| type | enum | `bank`, `cash`, `wallet` |
| currency | string | User-chosen; changeable anytime |
| opening_balance | decimal(15,2) | |
| balance | decimal(15,2) | Cached; recomputed |
| opened_at | date? | |
| created_at | timestamp | |

#### AccountBalanceAdjustment
| Attribute | Type | Notes |
|-----------|------|--------|
| id | UUID | |
| user_id | UUID | |
| account_id | UUID | |
| date | date | |
| amount | decimal(15,2) | Signed |
| note | string? | |
| created_at | timestamp | |

#### Category
| Attribute | Type | Notes |
|-----------|------|--------|
| id | UUID | |
| user_id | UUID | |
| name | string | |
| type | enum | `income`, `expense` |
| color | string? | |
| icon | string? | |
| budget_limit | decimal(15,2)? | Expense only |
| created_at | timestamp | |

#### Contact
| Attribute | Type | Notes |
|-----------|------|--------|
| id | UUID | |
| user_id | UUID | |
| name | string | |
| kind | enum | `vendor`, `customer`, `other` |
| email | string? | |
| phone | string? | |
| tgst_number | string? | Tax / registration id |
| notes | string? | |
| created_at | timestamp | |

#### IncomeEntry
| Attribute | Type | Notes |
|-----------|------|--------|
| id | UUID | |
| user_id | UUID | |
| amount | decimal(15,2) | |
| date | date | Earned / invoice (accrual) |
| received_date | date? | Null while receivable |
| currency | string | User-chosen; must align with account when deposited |
| description | string? | |
| category_id | UUID? | |
| account_id | UUID? | Null = pending receivable |
| source | string? | |
| notes | string? | |
| tags | string[] | |
| attachment_url | string? | |
| contact_id | UUID? | |
| voided_at / void_reason | timestamp? / string? | |
| recurring_id | UUID? | |
| deleted_at | timestamp? | Soft delete |
| created_at / updated_at | timestamp | |

#### ExpenseEntry
| Attribute | Type | Notes |
|-----------|------|--------|
| id | UUID | |
| user_id | UUID | |
| amount | decimal(15,2) | |
| date | date | Effective sort date = coalesce(paid_date, bill_date) |
| bill_date | date | Accrual |
| paid_date | date? | Cash; null while pay later unpaid |
| description | string? | |
| category_id | UUID? | |
| account_id | UUID? | |
| debt_id | UUID? | |
| pay_later | boolean | Unpaid bill mode |
| bill_currency | string | Currency of amount when pay later / bill |
| merchant | string? | |
| notes | string? | |
| tags | string[] | |
| attachment_url | string? | |
| contact_id | UUID? | |
| voided_at / void_reason | timestamp? / string? | |
| recurring_id | UUID? | |
| deleted_at | timestamp? | |
| created_at / updated_at | timestamp | |

#### ExpenseSplit
| Attribute | Type | Notes |
|-----------|------|--------|
| id | UUID | |
| expense_id | UUID | |
| category_id | UUID | |
| amount | decimal(15,2) | |
| percentage | decimal(5,2)? | |

#### Debt
| Attribute | Type | Notes |
|-----------|------|--------|
| id | UUID | |
| user_id | UUID | |
| direction | enum | `i_owe`, `owed_to_me` |
| contact_name | string | Display counterparty |
| contact_id | UUID? | Optional link to Contact |
| principal | decimal(15,2) | |
| currency | string | User-chosen; changeable anytime |
| interest_rate | decimal(5,2) | Default 0 |
| due_date | date? | |
| notes | string? | |
| status | enum | `open`, `settled` |
| created_at | timestamp | |

#### DebtPayment
| Attribute | Type | Notes |
|-----------|------|--------|
| id | UUID | |
| debt_id | UUID | |
| account_id | UUID | |
| amount | decimal(15,2) | Reduction in debt currency |
| account_amount | decimal(15,2)? | Cash in account currency if different |
| exchange_rate | decimal(18,8)? | Debt units per 1 account unit when cross-currency |
| date | date | |
| notes | string? | |
| attachment_url | string? | |
| voided_at / void_reason | timestamp? / string? | |
| created_at | timestamp | |

#### AccountTransfer
| Attribute | Type | Notes |
|-----------|------|--------|
| id | UUID | |
| user_id | UUID | |
| from_account_id | UUID | |
| to_account_id | UUID | |
| amount | decimal(15,2) | Debited from source (source currency) |
| exchange_rate | decimal(18,8)? | Destination units per 1 source unit when currencies differ |
| date | date | |
| notes | string? | |
| created_at | timestamp | |

#### RecurringSchedule (optional / future posting)
| Attribute | Type | Notes |
|-----------|------|--------|
| id | UUID | |
| user_id | UUID | |
| type | enum | `income`, `expense` |
| frequency | enum | daily … annually |
| next_date / end_date | date? | |
| is_active | boolean | |
| template | JSON | Entry template |

### 5.3 Lifecycle flags

| Flag | Applies to | Meaning |
|------|------------|---------|
| `deleted_at` | Income, expense | Soft delete; excluded from books |
| `voided_at` | Income, expense, debt payment | Reversible exclusion from books |
| Hard delete | Account, category, contact, merged debts | Permanent removal when allowed |

### 5.4 Indexes (logical)

- User-scoped lists: `(user_id)`, `(user_id, date)`, `(user_id, status)`, `(user_id, type)`
- Foreign keys: account, debt, contact, category on entries and payments

---

## 6. Interface boundary (non-UI)

The system exposes a **user-authenticated API** for all functionality in §3. Presentation clients are out of scope for this document.

Cross-cutting API expectations:

- Authenticate every mutating and reading ledger call.
- Validate inputs before persistence.
- Return actionable errors when the data store schema is behind the application.
- Health check for operational readiness.

---

## 7. Glossary

| Term | Definition |
|------|------------|
| Pending receivable | Income not yet deposited to an account |
| Pay later | Expense billed but not yet paid from an account or charged to debt |
| Void | Reversible exclusion from balances and reports |
| Outstanding (debt) | Principal + charges − payments |
| Accrual | Recognition on earned / bill date |
| Cash basis | Recognition when cash hits an account |
| Display currency | User-selected currency for aggregated reporting |
| Exchange rate | Conversion factor between two currencies; display FX uses dated daily history (carry-forward), while transfers/debt payments may store a transaction-local rate |

---

## 8. Document control

| Change | Guidance |
|--------|----------|
| Rules | Update §4 when balance, settlement, debt, or currency behaviour changes |
| Functionality | Update §3 when capabilities are added or removed |
| Data | Update §5 when entities or attributes change |
| UI | Do not add UI rules to this document |
