# NTrio Accounts — Design System Master

> Source: ui-ux-pro-max `--design-system` (Soft UI Evolution, density 8, motion 4).
> Page overrides: `design-system/pages/[page].md` take precedence when present.
> Implementation tokens: `src/index.css` (`@theme` + CSS variables).

---

## Product

- **Type:** Accounting / personal finance admin (SaaS)
- **Platform:** Mobile-first web (PWA-friendly), enhance for `md+`
- **Style:** Soft UI Evolution — monochrome, subtle depth, WCAG AA+, 200–300ms motion
- **Density:** Dense dashboard (8–24px rhythm)

## Color tokens (monochrome)

| Role | Hex | Token | Usage |
|------|-----|-------|-------|
| Primary | `#171717` | `--color-primary` | Active nav, primary actions, brand mark |
| On Primary | `#FFFFFF` | `--color-on-primary` | Text on primary |
| Secondary | `#525252` | `--color-secondary` | Secondary emphasis |
| Accent | `#404040` | `--color-accent` | Links, secondary CTAs |
| Background | `#FAFAFA` | `--color-background` | App canvas |
| Foreground | `#171717` | `--color-foreground` | Body / headings |
| Muted | `#F0F0F0` | `--color-muted` | Chip / inset surfaces |
| Muted FG | `#737373` | `--color-muted-foreground` | Hints, meta |
| Card | `#FFFFFF` | `--color-card` | Panels |
| Border | `#E5E5E5` | `--color-border` | Soft borders |
| Destructive | `#404040` | `--color-destructive` | Errors (weight + copy, not hue) |
| Success | `#171717` | `--color-success` | Income / positive (dark) |
| Warning | `#737373` | `--color-warning` | Expense / caution (mid gray) |
| Ring | `#171717` | `--color-ring` | Focus rings |

**Chart series:** Income `#171717` (solid), Expense `#A3A3A3` (lighter fill + dashed), Net `#525252` (dotted). Differentiate with value, pattern, and labels — not hue.

## Typography

- **UI / body:** Plus Jakarta Sans (400–800)
- **Tabular data:** `tabular-nums` + same family (or system mono for codes)
- Scale (dense): label `text-xs`, body `text-sm`, title `text-base`/`text-lg`, KPI `text-xl`/`text-2xl`

## Spacing & radius

| Token | Value |
|-------|-------|
| `--space-xs` … `--space-3xl` | 2 / 4 / 8 / 12 / 16 / 24 / 32 px |
| `--radius-md` | 10px |
| `--radius-lg` | 14px |
| `--radius-xl` | 16px |

## Shadows (Soft UI Evolution)

- Card: `0 1px 2px rgb(15 70 64 / 0.04), 0 4px 12px rgb(15 70 64 / 0.06)`
- Raised (nav / sticky): slightly stronger, soft blur
- Avoid heavy multi-layer neumorphism

## Motion

- Transitions: 200–300ms ease
- Prefer opacity/transform; respect `prefers-reduced-motion`
- No GSAP overshoot on dense tables

## Mobile-first UX

- Touch targets ≥ 44×44px; gap ≥ 8px between targets
- Bottom tab bar on `< md`; horizontal nav on `md+`
- Safe-area insets on fixed chrome
- Skip link to main content
- Charts: value labels / summary tables; horizontal bar preferred over pie for categories

## Anti-patterns

- Purple gradient themes, emoji-as-icons
- Pie-only category viz without labels/% table
- Desktop-first breakpoints
- Tiny icon-only taps without hit area
