# Build Tasks: EasySSL Redesign

Generated from: .design/easyssl-redesign/DESIGN_BRIEF.md
Date: 2026-10-23

Philosophy for every task: security-print document meets engineering instrument. Paper, ink, one secure green, hairlines over shadows.

## Foundation
- [x] **Design tokens**: colour/type/spacing/motion tokens in `globals.css` (light + dark) mapped in `tailwind.config.ts`. _New._
- [x] **Fonts**: swap Inter for Newsreader (display), Hanken Grotesk (body), IBM Plex Mono (data) via `next/font` in `layout.tsx`. _Modifies layout._
- [x] **Brand marks**: `Wordmark`, `SealMark` and `Guilloche` SVG components in `src/components/brand/`. Done when the wordmark renders in the header and the seal and guilloché render in the hero. _New._

## Landing page (ship first, then wait for approval)
- [x] **Header + hero with specimen certificate**: asymmetric two-column hero; certificate document with domain, issuer, validity, 90-day renewal track and seal; staggered load reveal. _New `SpecimenCertificate`; depends on brand marks._
- [x] **How it works ledger**: three numbered steps with serif numerals and hairline rules; step 3 marked Pro. _Modifies section._
- [x] **SSL checker restyle**: token colours, mono input, status label (Secure / Expiring / Expired) with no emoji; inline sign-up prompt on expiring/expired. _Modifies `SslChecker`._
- [x] **What you get**: typographic fact list (encrypted keys, any host, renewal starts 30 days early, Let's Encrypt chain). _Modifies features section._
- [x] **Pricing comparison**: one ruled block, three columns, Pro tinted, no scale effect or pill badge; limits 5 / 10 / 20. _Modifies section._
- [x] **FAQ + closing band + footer**: two-column FAQ with hairline accordion; deep-green CTA band with guilloché; quiet footer. _Modifies sections._
- [x] **Responsive & a11y pass (landing)**: 375 / 768 / 1024 / 1280; focus rings; reduced motion; contrast in dark mode. Breakpoints: all.
- [x] **Ship landing**: build, push live, ask the user to judge the direction.

## App: out of scope (2026-10-23)

The user is happy with the current dashboard; the redesign covers the landing page only.
The dashboard SSL checker page is pinned to light tokens with `.theme-light` so the shared checker matches it.
- [ ] **App shell**: shared header (wordmark, New certificate, SSL checker, plan, sign out) on canvas background. _Modifies dashboard header._
- [ ] **Dashboard**: stat strip, "needs attention" first, certificate table with status labels, mono dates, inline actions; viewer modal on tokens. _Modifies `DashboardTable`, `DashboardClient`, `dashboard/page.tsx`._
- [ ] **Generate flow**: stepper with current step emphasised, file download rows, verification feedback states (checking / ok / error). _Modifies `dashboard/generate/page.tsx`._
- [ ] **Upgrade + success**: plan comparison consistent with landing pricing. _Modifies upgrade pages._
- [ ] **Legal pages + SSL checker page**: readable document layout (max-width content, serif headings). _Modifies terms/privacy/refund, ssl-checker page._
- [ ] **Body tokens**: once all pages are migrated, move `bg-canvas text-ink` to `<body>` and enable dark mode app-wide.

## Review
- [ ] **Design review**: run /design-review against the brief.
