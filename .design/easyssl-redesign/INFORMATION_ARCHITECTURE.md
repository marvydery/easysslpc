# Information Architecture: EasySSL

Existing routes are kept; this redesign changes presentation and content priority, not structure.

## Site Map

- Home `/`
  - Sections (anchors): How it works `#how`, SSL checker `#check`, Pricing `#pricing`, FAQ `#faq`
- Sign in `/sign-in` · Sign up `/sign-up` · Sign out `/sign-out` (Clerk)
- Dashboard `/dashboard`
  - New certificate `/dashboard/generate` (`?domainId=` resumes a pending verification)
  - SSL checker `/dashboard/ssl-checker`
  - Upgrade `/dashboard/upgrade`
    - Payment confirmed `/dashboard/upgrade/success`
  - Admin `/dashboard/admin` (admins only)
- Terms `/terms` · Privacy `/privacy` · Refund `/refund`

## Navigation Model

- **Primary navigation (marketing)**: How it works, Pricing, FAQ (in-page anchors) and one primary action ("Get a free certificate"); "Sign in" as a quiet text link. Maximum 4 items.
- **Primary navigation (app)**: Wordmark → Dashboard; actions "New certificate" and "SSL checker"; plan badge.
- **Utility navigation**: Admin (admins), Upgrade (free users), Sign out.
- **Mobile navigation**: marketing anchors collapse; the header keeps the wordmark, Sign in and the primary action. Anchors are reachable by scrolling, so there's no hamburger needed for 3 items.

## Content Hierarchy

### Home
1. Promise + proof: headline, one-line explanation, primary action, and the specimen certificate showing a 90-day renewal. This answers "what is it and can I trust it" in one glance.
2. How it works: three steps, with step 3 (auto-renew) marked Pro. This removes the "is it technical?" fear.
3. SSL checker: a free, no-signup tool. It provides immediate value, and an expiring result leads naturally to sign-up.
4. What you get: factual guarantees (encrypted keys, any host, renewal starts 30 days early).
5. Pricing: Free / Pro / Lifetime comparison.
6. FAQ: objection handling.
7. Closing call to action + footer.

### Dashboard (phase 2)
1. Certificates needing attention (expiring or expired), so the most urgent item comes first.
2. All certificates with status, expiry and actions.
3. Usage against the plan limit; upgrade prompt for free users.

### New certificate (phase 2)
1. The current step and what to do now.
2. Files to download / upload paths.
3. Verification feedback.

## User Flows

### First free certificate
1. User lands on `/` and sees the promise and the specimen certificate.
2. Clicks "Get a free certificate" and goes to `/sign-up` (Clerk), then `/dashboard`.
3. "New certificate" leads to `/dashboard/generate`: enter domain → download verification file(s) → upload → "Check files" → "Generate".
   - If files are unreachable → inline guidance on what's wrong; retry.
   - If Let's Encrypt rejects → restart from step 1 with new files.
4. Downloads the zip → back to `/dashboard`, where the certificate is listed.

### Checker to customer
1. User lands on `/#check` and checks their domain.
   - Secure → no push.
   - Expiring/expired → inline prompt to get a free certificate (`/sign-up`).

### Upgrade to auto-renew
1. Dashboard upgrade prompt → `/dashboard/upgrade` → payment → `/dashboard/upgrade/success`.
2. Download bridge files → upload → "Check auto-renewal".

## Naming Conventions

| Concept | Label in UI | Notes |
| --- | --- | --- |
| SSL/TLS certificate | Certificate | "SSL" only in the product name and SEO copy |
| Generating a certificate | Get a free certificate / New certificate | Not "Generate SSL" |
| bridge.php + .htaccess | Bridge files | "Bridge Protocol" retired from UI copy |
| Automatic renewal | Auto-renewal | One word with hyphen, everywhere |
| Certificate states | Secure · Expiring · Expired | Expiring = under 30 days |
| Plans | Free · Pro · Lifetime | |

## Component Reuse Map

| Component | Used on | Behavior differences |
| --- | --- | --- |
| Wordmark | Marketing header/footer, app header | Smaller in app header |
| Seal mark | Hero certificate, favicon-sized mark in wordmark | Rotating text ring only in hero |
| Guilloché pattern | Hero certificate, CTA band | Opacity/colour per surface |
| Status label | SSL checker, dashboard table | Same three states and colours |
| Button (primary/secondary/quiet) | Everywhere | |

## Content Growth Plan

Only the dashboard certificate list grows (max 20 per user on Lifetime, unlimited for admins). A single sorted table (most urgent first) is enough; no pagination is needed under ~50 rows.

## URL Strategy

- Unchanged from today. Marketing sections use hash anchors (`#how`, `#check`, `#pricing`, `#faq`).
