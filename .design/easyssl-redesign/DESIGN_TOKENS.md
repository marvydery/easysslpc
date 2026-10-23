# Design Tokens: EasySSL

**Source of truth:** `src/app/globals.css` (CSS custom properties, light + dark) and `tailwind.config.ts` (maps tokens to utility classes).

**Derived from:** the brief's "security-print document meets engineering instrument" philosophy. That means a balanced 4px spacing base, small radii (3/6/10px), hairline borders preferred over shadows, and one dominant accent.

## Colour roles → Tailwind classes

| Role | Light | Dark | Class |
| --- | --- | --- | --- |
| Page background (paper) | `#F7F5F0` | `#0F1512` | `bg-canvas` |
| Document / card | `#FFFDF8` | `#161E1A` | `bg-surface` |
| Wells, inputs | `#EFECE4` | `#0B100D` | `bg-sunken` |
| Ink | `#14201A` | `#E9E6DD` | `text-ink` |
| Secondary text | `#4A5650` | `#A9B1AB` | `text-ink-2` |
| Captions / placeholder | `#7C857F` | `#737D77` | `text-ink-3` |
| Hairline | `#DCD7CB` | `#27312C` | `border-line` |
| Strong rule | `#C4BEB0` | `#36423C` | `border-line-strong` |
| Secure green (accent) | `#0F6B47` | `#3FB283` | `bg-brand`, `text-brand` |
| Text on accent | `#FFFFFF` | `#06140D` | `text-brand-on` |
| Accent tint | `#E3EFE8` | `#163026` | `bg-brand-soft` |
| Amber mark (decorative) | `#E8A33D` | `#E3A94B` | `bg-mark` |
| Secure / Expiring / Expired | `#0F6B47` / `#9A6212` / `#B23A26` | `#5BC598` / `#E3A94B` / `#E5765F` | `text-status-ok/warn/error`, `bg-status-*-soft` |

Contrast (light): ink on paper ≈ 15:1; secondary ≈ 7:1; green on paper ≈ 6.2:1; white on green ≈ 6.5:1; warning text ≈ 4.9:1; error text ≈ 5.6:1. All meet AA.

## Typography

| Role | Family | Class |
| --- | --- | --- |
| Display (headlines, numerals, wordmark) | Newsreader (variable serif, optical sizes) | `font-display` |
| Body / UI | Hanken Grotesk | `font-body` (default on `<body>`) |
| Data (domains, serials, dates, labels) | IBM Plex Mono | `font-mono` |

Hero size: `text-display` = `clamp(2.75rem, 4.2vw + 1rem, 4.75rem)`, line-height 1.08, tracking -0.02em. Small caps labels: `font-mono text-[11px] uppercase tracking-label`.

## Shape, depth, motion

- Radius: `rounded-ctl` (6px) for controls, `rounded-card` (10px) for documents.
- Shadows: `shadow-hair` (1px rule), `shadow-lift`, `shadow-doc` (specimen certificate only), `shadow-focus`.
- Motion: `.animate-rise` (staggered with `style={{ "--delay": "120ms" }}`), `.animate-track` (renewal bar), `.animate-seal` (80s seal ring). All disabled under `prefers-reduced-motion`.

## Deviations

- `body` deliberately keeps browser-default colours until the dashboard is restyled (it still uses hard-coded Tailwind greys). Redesigned pages paint themselves with `bg-canvas text-ink`.
- Tailwind's default palette stays available, so un-migrated pages keep working.
