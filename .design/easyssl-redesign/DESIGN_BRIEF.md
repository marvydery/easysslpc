# Design Brief: EasySSL Redesign

## Problem

Site owners on shared hosting know their site shows "Not secure" and that it costs them visitors, but SSL feels like a technical chore, and their host wants to charge for it. Freelancers who manage several client sites dread the silent expiry: a certificate lapses on a Sunday and the client calls in a panic. Both groups land on EasySSL wondering whether a free tool can be trusted with something this important. The current site looks like every other template, which makes that doubt worse.

## Solution

An interface that feels like a well-made instrument: calm, precise and quietly confident. It shows the product's promise (a certificate that never lapses) before it explains it. Beginners are walked through one clear step at a time. People managing many domains get expiry status at a glance and nothing in their way.

## Experience Principles

1. **Show the certificate, don't describe it**: real artifacts (a specimen certificate, a renewal timeline, an expiry countdown) instead of icons and adjectives.
2. **Calm over urgent**: status is communicated with colour and plain language, not alarm. Even "expired" reads as "here's how to fix it," never panic.
3. **Restraint earns trust**: hairlines over shadows, typography over decoration, one accent colour used sparingly, so every green mark means "secure".

## Aesthetic Direction

- **Philosophy**: Security-print document meets engineering instrument. Swiss-grid discipline with the material details of certificates: guilloché line patterns, serial-number monospace, hairline rules, a circular seal.
- **Tone**: Calm, trustworthy, precise; warm rather than clinical.
- **Reference points**: printed certificates and banknotes (fine-line engraving, seals); well-typeset technical documentation; precision tools.
- **Anti-references**: generic SaaS templates (centred hero with a gradient, three icon cards, a "MOST POPULAR" scaled pricing card); default Tailwind blue; purple gradients; hacker/terminal neon; emoji as status icons; browser `alert()` dialogs.

## Existing Patterns

- Typography: Inter via `next/font` (to be replaced).
- Colors: default Tailwind palette, `blue-600` primary; `globals.css` defines only `--background`/`--foreground`.
- Spacing: Tailwind default 4px scale (kept).
- Components: `SslChecker` (restyle), `DashboardTable`, `DashboardClient` (dashboard phase); lucide-react icons (kept, used sparingly).

## Component Inventory

| Component | Status | Notes |
| --- | --- | --- |
| Wordmark + seal mark | New | Serif wordmark with a custom padlock/seal SVG replacing the lucide `Lock` |
| Site header | Modify | Wordmark, quiet nav, one primary action |
| Specimen certificate (hero) | New | Document-styled card: domain, issuer, validity, 90-day renewal track, seal |
| Guilloché pattern | New | Reusable SVG line pattern for certificate and CTA band |
| How it works ledger | Modify | Numbered rows with serif numerals and hairlines, not cards |
| SslChecker | Modify | Token colours, mono domain input, status without emoji |
| Feature facts | Modify | Typographic definition list, not icon cards |
| Pricing table | Modify | One ruled comparison block; Pro column tinted; no scale effect |
| FAQ | Modify | Two-column, hairline accordion |
| CTA band | Modify | Deep green with engraved-line texture |
| Footer | Modify | Wordmark, links, small print |
| Dashboard, generate flow, upgrade, legal | Modify | Phase 2 of the build, after the landing direction is approved |

## Key Interactions

- Page load: one orchestrated, staggered reveal of the hero; the renewal track fills to show auto-renewal. Respects `prefers-reduced-motion`.
- SSL checker: submit gives an inline loading state, then a result with a status label (Secure / Expiring / Expired) in token colours; expandable technical details.
- FAQ: native `<details>` with hairline dividers and a rotating marker.
- Buttons and links: clear hover/active/focus states; visible focus ring in brand green.

## Responsive Behavior

- Hero: two columns (copy | certificate) at ≥1024px; stacked on smaller screens with the certificate after the copy.
- How it works: three columns at ≥768px; vertical ledger on mobile.
- Pricing: three columns at ≥1024px; stacked plans on mobile, Pro first.
- FAQ: two columns (heading | list) at ≥1024px; single column below.
- 16px minimum side gutter; no horizontal scroll at 375px.

## Accessibility Requirements

- WCAG AA contrast: body text ≥4.5:1, large text ≥3:1, in light and dark.
- Status never communicated by colour alone (always paired with a word).
- Keyboard: all interactive elements reachable, visible focus ring.
- Decorative SVGs (`guilloché`, seal) marked `aria-hidden`.
- Reduced-motion users get no animation.

## Out of Scope

- Changes to business logic, API routes, auth (Clerk), payments (Paddle/Paystack).
- Clerk-hosted sign-in/sign-up screen styling (beyond what Clerk's theme allows).
- New product features or new pages.
- Copywriting beyond what the redesign needs (headline/section copy may be tightened).
