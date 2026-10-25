---
description: Ntrio design system and mobile-first Home redesign. Apply to all UI work.
alwaysApply: true
---

# Ntrio UI spec (for Cursor)

Place this file at `.cursor/rules/ntrio-design.mdc` (or keep as `DESIGN.md` and reference it with `@DESIGN.md`).

## Task for Cursor

Redesign the Ntrio app UI mobile-first using the tokens, components and Home layout below. Keep all existing data, API calls and business logic. Change presentation only. Do not add shadows, gradients, animations or decorative elements. This is an accounting tool: numbers lead, colour only carries meaning.

Work in this order:
1. Add the tokens (CSS variables or Tailwind theme extension).
2. Build the shared components.
3. Rebuild Home using those components.
4. Apply the same components to Accounts, Contacts, Income, Spend, Debts, Reports, Settings.

## Principles

- Mobile first: design for 390px width, then scale up. Single column below 768px. At 768px+ use a max-width 960px container; KPI rows and cards may go to 2 columns.
- One screen = a stack of cards. Each card: heading, content, optional link.
- Every amount: tabular numerals, right aligned, sign shown (+ / −), currency code shown. Foreign value (USD) shown under the MVR value in caption style.
- Colour is never the only signal: pair with +/− sign, label or tag text.
- Touch targets at least 44px. Real `<button>` and `<a>` elements, `aria-label` on icon-only controls.
- Text contrast at least 4.5:1.

## Tokens

```css
:root {
  --font: 'Inter', system-ui, sans-serif;

  --ink: #111827;        /* text, headings */
  --muted: #4B5563;      /* labels, captions */
  --border: #E5E7EB;     /* dividers, card borders */
  --ground: #F6F7F9;     /* page background */
  --surface: #FFFFFF;    /* cards, nav */
  --action: #1D4ED8;     /* links, primary button */
  --credit: #047857;     /* income, money in */
  --debit: #B91C1C;      /* expense, money out */

  --credit-bg: #ECFDF5; --credit-ink: #065F46;
  --debit-bg:  #FEF2F2; --debit-ink:  #991B1B;
  --neutral-bg:#F3F4F6; --neutral-ink:#374151;

  --radius: 8px;         /* cards */
  --radius-sm: 6px;      /* buttons, inputs */
  --radius-xs: 4px;      /* tags */

  --s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px; --s6: 24px; --s8: 32px;
  --tap: 44px;
  --nav-h: 64px;
}
body { font-family: var(--font); font-size: 14px; line-height: 20px; color: var(--ink); background: var(--ground); font-variant-numeric: tabular-nums; }
```

Tailwind mapping: add the colours above under `theme.extend.colors`, `borderRadius: { DEFAULT: '8px', sm: '6px', xs: '4px' }`, and `fontFamily.sans = ['Inter', 'system-ui', 'sans-serif']`. Use the `tabular-nums` utility on all amounts.

## Type scale

| Role | Size / line | Weight | Notes |
|---|---|---|---|
| Amount large | 24/32 | 600 | tabular, nowrap |
| Page title | 20/28 | 700 | |
| Section heading | 16/24 | 600 | |
| Body, row text | 14/20 | 400 or 500 | |
| Label | 12/16 | 600 | uppercase, letter-spacing .04em, `--muted` |
| Caption | 12/16 | 400 | `--muted` |

## Components

**Card**: `background: var(--surface); border: 1px solid var(--border); border-radius: 8px;` no shadow. Header row: heading left (16/24 600), caption or link right, padding `16px 16px 8px`.

**ListRow** (the base for every list): padding `12px 16px`, `border-top: 1px solid var(--border)`. Left: primary text (500) with caption under it. Right: amount (600, right aligned) with caption under it.

**StatRow** (KPI): top line = Label left, ChangeTag right. Second line = value (Amount large) left, caption "Prior …" right.

**ChangeTag**: inline, `padding: 2px 6px; border-radius: 4px; font: 600 12/16`. Variants: `positive` (credit-bg / credit-ink), `negative` (debit-bg / debit-ink), `neutral` (neutral-bg / neutral-ink, also used for "New" and "0%"). Note: for expenses, an increase uses the `negative` variant (spent more), for income an increase uses `positive`.

**Amount**: `<span class="amount credit|debit">` with format `+MVR 5,600.00` for credit, `−MVR 840.00` for debit (use the true minus sign U+2212). Optional second line caption `US$280.00`.

**ProgressBar**: height 6px, radius 3px, track `--border`, fill `--ink` (spend share) or `--action` (account share) or `--credit` / `--debit` (income vs expense).

**Button**: min-height 44px, padding `0 16px`, radius 6px, weight 600. Primary: `--action` fill, white text. Secondary: white fill, `--action` text and border.

**SegmentedControl** (USD | MVR, All | Bank | Cash | Wallet): 1px `#D1D5DB` border, radius 6px, buttons min-height 44px, active = `--ink` fill with white text.

**TopBar**: white, bottom border, padding `12px 16px`. Left: wordmark "NTRIO" (12px, 700, tracked) and user email caption. Right: currency SegmentedControl. Sign out moves into More.

**BottomNav**: fixed bottom, height 64px, white, top border, 5 items: Home, Accounts, Add (opens add transaction sheet), Reports, More. Icon 20px stroke 1.8 plus 11px label. Active = `--action` and weight 600. Contacts, Income, Spend, Debts, Settings, Sign out live under More.

## Home layout (top to bottom, 16px gap between cards, 16px screen padding)

1. **TopBar**
2. **Title row**: "Home" (page title) left, date range button right (secondary button, e.g. `Oct 1 – Oct 25, 2026`). Opens a period picker sheet.
3. **This month** card, caption "vs <previous range>". Rows: StatRow Income, StatRow Expenses, StatRow Net (caption "34% of income kept"), then a caption row "Avg spend per day" with value.
4. **Balance position** card: three ListRows: Cash & accounts, Pay later unpaid (debit colour), Net worth (debit colour when negative). The "?" help icons become a tap-to-open info sheet.
5. **Cash movement** card: income bar (credit) and expense bar (debit) scaled to the larger value, with values. Footer row: trend sentence and a "Daily chart" link that opens the full interactive daily chart on its own screen (keep the existing chart component there, it must not be crammed into Home on mobile).
6. **Accounts** card: link "View all". Total balance (Amount large) with USD equivalent, MVR/USD held split as caption, then a ListRow per account: name, "Type · Currency · % of total", amount and USD equivalent. Remove the multi-colour icon tiles and the rainbow split bar; account type is in the caption text.
7. **Top expenses** card: caption "<range> vs <previous range>". Summary: Top 5 total, change tag, previous total caption. Then a row per category: name and amount, a ProgressBar, caption "Prev MVR x · n% of top 5" with a ChangeTag right. Footer caption explaining red = spent more.
8. **Recent transactions** card: link "View all". One TransactionRow per entry: date + description left, signed Amount right with USD caption. Group by date with a sticky date label when the list grows past one day.

## Data rules

- Percent change: `(current − prior) / prior`; if prior = 0 show tag `New`.
- Net = income − expenses. "Kept" = net / income.
- Show MVR as the base currency everywhere. USD toggle switches the primary line; the other currency is always the caption.
- Empty states: one line of caption text plus a secondary button (e.g. "Add first transaction").
- Loading: skeleton rows in `--border` colour, no spinners over content.

## Do not

- No shadows, gradients, glass effects, emoji or illustration.
- No more than three colours on a screen besides neutrals.
- No colour-only meaning. No amounts left aligned. No truncated amounts (wrap labels, never numbers).
- Do not change routes, API shapes or data models.

## Acceptance check

- At 390px width there is no horizontal scroll and every amount is fully visible.
- Every interactive element is 44px tall or has a 44px hit area.
- All amounts use tabular numerals and show currency plus sign.
- Home reads income → expenses → net → balances → accounts → top expenses → transactions without opening any sheet.
