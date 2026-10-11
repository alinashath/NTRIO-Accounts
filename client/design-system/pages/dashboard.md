# Dashboard — page overrides

Overrides `design-system/MASTER.md` for the home dashboard.

## Layout (mobile-first)

1. Page title + full-width period control
2. Alert (overdue debts) if any
3. **Period pulse card** (primary): income + expenses with prior-period deltas, sparklines, net row
4. Balance snapshot: net worth · cash · pay-later
5. Cash movement chart + **Accounts** (prominent balances)
6. Top expenses + recent activity

## Period pulse card

- First viewport focus on mobile
- Two equal columns: Income / Expenses
- Each shows amount, prior amount, `% vs prior` badge (↑ good for income, ↓ good for expenses), sparkline
- Net strip with delta badge + small sparkline
- Footer: basis note + avg daily spend

## Charts

- **Sparklines:** Area (Recharts) on income / expense / net — trend only; numbers live beside
- **Cash movement (`CashMovementCard`)** — product mock:
  - Diverging bars (income above zero, expenses below)
  - Net curve (Fintech Emerald gradient) + dotted OLS trend line
  - Live readout (drag/hover day → In / Out / Net; idle shows trend)
  - Footer stats: Income · Expense · Net · Avg spend / day
- **Top expenses:** Horizontal bars with % labels (not pie)

## Components

- shadcn-style `Card` / `Badge` under `components/ui/`
- Existing `StatCard` for secondary KPIs
- Lucide for delta arrows (no emoji)

## Avoid

- Leading with net worth before period P&L
- Pie-only category view
- Charts without numeric summary
