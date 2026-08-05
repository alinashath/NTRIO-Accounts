# Dashboard — page overrides

Overrides `design-system/MASTER.md` for the home dashboard.

## Layout

- Max width: `max-w-5xl` (app shell)
- Order (mobile → desktop):
  1. Page title + period context
  2. Alert (overdue debts) if any
  3. KPI grid (2-col mobile, 4-col desktop)
  4. Cash / pay-later strip
  5. Trend chart (full width) then category ranking
  6. Accounts + recent activity (stacked mobile, 2-col `lg`)

## Charts

### Income vs expense (30 days)

- **Type:** Composed chart — grouped bars (income/expense) + net line
- **Why:** Trend over time + rate of change; net line surfaces the story bars alone miss
- **Mobile:** Aggregate to weekly buckets under ~480px; taller chart (`h-72`); fewer X ticks
- **A11y:** Legend + period totals row under chart (income / expense / net + burn rate)

### Top expense categories

- **Type:** Horizontal bar (not pie) — skill grade C for pie; bars AAA with value labels
- **Max categories:** 5 + optional “Other”
- **Always show:** amount, % of expense total, sorted descending
- **Fallback:** compact list under chart with same numbers

## KPI cards

- Tone: positive → near-black weight; negative → muted gray weight (monochrome)
- Optional delta vs prior period when available
- Dense padding; hint tooltips keep ≥44px hit target on mobile

## Color

- Monochrome only — no teal/green/orange accents on this page

## Avoid

- Donut/pie as sole category view
- Charts without numeric summary
- Glass overlays that reduce contrast on KPIs
- Hue-based status (use +/− prefixes, labels, and gray levels instead)