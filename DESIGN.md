---
description: Ntrio design system — Binance-inspired trading UI. Apply to all UI work.
alwaysApply: true
---

# Ntrio UI spec (for Cursor)

Binance-inspired financial platform language adapted for Ntrio accounting. **Light transactional canvas by default.** Single accent (Binance Yellow). Presentation only — do not change routes, API shapes, or business logic.

## Principles

- **Light product default**: canvas `#fafafa`, cards `#ffffff`, elevated `#f5f5f5`, hairline `#eaecef`.
- **Single brand accent**: `#FCD535` (primary CTAs, wordmark, active nav tint, links). Black text on yellow — never white on yellow.
- **Trading semantics**: credit / income / up = `#0ECB81` (text); debit / expense / down = `#F6465D` (text). Not card fill backgrounds.
- **Type**: Inter (≈ BinanceNova) for UI copy; IBM Plex Sans (≈ BinancePlex) for every number/amount.
- Mobile first (390px), 44px touch targets, tabular amounts with currency and +/−. Colour is never the only signal.
- Flat color-block elevation — no shadows, mesh gradients, glass, or emoji. Depth = ground vs card contrast.

## Tokens

```css
:root {
  --font: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-num: 'IBM Plex Sans', 'Inter', system-ui, sans-serif;

  --ground: #fafafa;
  --surface: #ffffff;
  --surface-elevated: #f5f5f5;
  --ink: #181a20;
  --body: #181a20;
  --muted: #707a8a;
  --border: #eaecef;
  --action: #FCD535;
  --action-active: #f0b90b;
  --on-primary: #181a20;
  --credit: #0ecb81;
  --debit: #f6465d;
  --credit-bg: rgb(14 203 129 / 0.1); --credit-ink: #0ecb81;
  --debit-bg:  rgb(246 70 93 / 0.1);  --debit-ink:  #f6465d;
  --neutral-bg: #f5f5f5; --neutral-ink: #374151;
  --info: #3b82f6;

  --radius-xs: 2px; --radius-sm: 4px; --radius-md: 6px;
  --radius: 8px; --radius-xl: 12px; --sheet-radius: 16px;

  --s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px; --s6: 24px; --s8: 32px;
  --tap: 44px; --input-h: 44px; --nav-h: 64px;
  --content-max: 1280px; --content-pad: 16px; /* 24px from 768px */
  --form-gap: 16px; --sheet-max: 92dvh; --overlay: rgb(17 24 39 / 0.48);
  --control-border: #cdd1d6;
}
```

## Type scale

| Role | Size / line | Weight | Face | Use |
|---|---|---|---|---|
| Amount large | 24 / 1.2 | 700 | IBM Plex | KPI values |
| Number display | 40 / 1.1 | 700 | IBM Plex | Hero stats |
| Page title | 20 / 1.35 | 600 | Inter | Screen titles |
| Section heading | 16 / 1.4 | 600 | Inter | Card titles |
| Body | 14 / 1.5 | 400–500 | Inter | Rows, copy |
| Label | 12 / 1.4 | 500 | Inter | Uppercase muted labels |
| Caption | 12 / 1.4 | 400 | Inter | Secondary lines |
| Button | 14 / 1 | 600 | Inter | CTA labels |

## Components

**Button primary**: bg `--action`, text `--on-primary`, radius 6px, min-height 44px. Press → `--action-active`. Never invert to white-on-yellow.

**Button secondary**: bg `--surface`, text `--ink`, hairline `--border`. Not yellow outline.

**Button tertiary**: text-only; links use `--action`.

**Card / PanelCard**: bg `--surface`, border `--border`, radius 12px (`--radius-xl`). Header 16px padding.

**ListRow / StatRow**: hairline dividers; amounts right-aligned in `--font-num`.

**ChangeTag**: trading text colour (credit/debit) on translucent tint. Neutral = elevated + muted.

**Amount**: always `--font-num`; credit/debit as text colour; + / − (U+2212) + currency.

**ProgressBar**: 6px track `--border`; fill ink / action / credit / debit.

**SegmentedControl**: hairline border; active = ink fill + white text.

**TopBar / BottomNav**: white / soft surface; wordmark can use `--action`; active tab = `--action` + weight 600.

**Modal / form sheets**: bottom sheet on &lt;768px, centered dialog on desktop.

## Home layout

Unchanged structure (This month → Balance → Cash movement → Accounts → Top expenses → Recent). Light cards + yellow CTAs/links + trading green/red amounts.

## Do / Don't

**Do**: reserve yellow for CTAs, brand, and focal links; use green/red only for money direction; numbers always IBM Plex; keep the light canvas.

**Don't**: second brand colour; yellow body text or large yellow fills; green/red as card surfaces; soft display weights; atmospheric gradients; white text on yellow primary buttons; dark product theme unless explicitly requested.

## Acceptance

- 390px: no horizontal scroll; amounts fully visible; 44px targets.
- Primary CTA reads yellow + black everywhere.
- Light canvas throughout.
- No API / route / model changes.
