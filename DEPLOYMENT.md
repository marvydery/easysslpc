# EasySSL Deployment Guide

This guide walks you through deploying EasySSL to production.

## Pre-Deployment Checklist

- [ ] PostgreSQL database provisioned
- [ ] Clerk account set up with application created
- [ ] Stripe account with products created
- [ ] Email service configured (SMTP)
- [ ] Domain name ready for deployment

## Step 1: Database Setup (Supabase)

EasySSL uses **Supabase** as its PostgreSQL provider with Drizzle ORM.

### Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Click **New project** and fill in the details
3. Wait for the project to be provisioned (~2 minutes)

### Get the Connection String

1. Go to **Project Settings → Database → Connection string**
2. Select the **Transaction pooler** tab (recommended for serverless / Vercel)
3. Copy the URI — it looks like:
   ```
   postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
   ```
4. Add to `.env` as `DATABASE_URL`

> **Note:** Use port `6543` (Transaction pooler) for Vercel/serverless deployments.
> Use port `5432` (Direct connection) only for local migrations (`npm run db:push`).

### (Optional) Supabase API Keys

Only needed if you later use Supabase Auth, Storage, or Realtime:

```env
NEXT_PUBLIC_SUPABASE_URL=https://[project-ref].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### Push Database Schema

```bash
npm run db:push
```

## Step 2: Clerk Authentication

1. Go to [clerk.com](https://clerk.com)
2. Create a new application
3. Get your API keys from Dashboard → API Keys
4. Add to `.env`:
   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
   CLERK_SECRET_KEY=sk_...
   ```

### Configure Clerk Settings

1. **Sign-in/Sign-up URLs**:
   - Sign-in URL: `/sign-in`
   - Sign-up URL: `/sign-up`
   - After sign-in: `/dashboard`
   - After sign-up: `/dashboard`

2. **Email & Password**: Enable in Authentication → Email, Phone, Username

## Step 3: Stripe Payment Setup

### Create Products

1. Go to [stripe.com](https://stripe.com) → Products
2. Create two products:

**Pro Plan:**
- Name: EasySSL Pro
- Price: $19 USD
- Billing: Recurring yearly
- Copy the Price ID → `STRIPE_PRO_PRICE_ID`

**Lifetime Plan:**
- Name: EasySSL Lifetime
- Price: $29 USD
- Billing: One-time
- Copy the Price ID → `STRIPE_LIFETIME_PRICE_ID`

### Configure Webhooks

1. Go to Developers → Webhooks
2. Add endpoint: `https://your-domain.com/api/stripe/webhook`
3. Select events:
   - `checkout.session.completed`
   - `customer.subscription.deleted`
   - `customer.subscription.updated`
4. Copy signing secret → `STRIPE_WEBHOOK_SECRET`

## Step 4: Email Configuration

### Option A: Gmail

1. Enable 2-factor authentication on your Google account
2. Generate an App Password:
   - Go to Google Account → Security → App Passwords
   - Generate new password
3. Add to `.env`:
   ```
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASSWORD=your-app-password
   EMAIL_FROM=EasySSL <noreply@yourdomain.com>
   ```

### Option B: SendGrid

1. Sign up at [sendgrid.com](https://sendgrid.com)
2. Create API key
3. Add to `.env`:
   ```
   EMAIL_HOST=smtp.sendgrid.net
   EMAIL_PORT=587
   EMAIL_USER=apikey
   EMAIL_PASSWORD=your-sendgrid-api-key
   EMAIL_FROM=EasySSL <noreply@yourdomain.com>
   ```

## Step 5: Generate Security Keys

### Encryption Key

Generate a 32-byte hex encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add to `.env`:
```
ENCRYPTION_KEY=your-generated-key-here
```

### Renewal Cron Key

Generate a random secure key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add to `.env`:
```
RENEWAL_CRON_KEY=your-cron-key-here
```

## Step 6: Deploy to Vercel

### Install Vercel CLI

```bash
npm i -g vercel
```

### Deploy

```bash
vercel
```

Follow the prompts:
- Set up and deploy? **Y**
- Which scope? Select your account
- Link to existing project? **N**
- Project name? **easyssl** (or your preferred name)
- Directory? **./** (current directory)
- Override settings? **N**

### Add Environment Variables

Go to your Vercel dashboard → Project → Settings → Environment Variables

Add all variables from `.env`:
- `DATABASE_URL`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRO_PRICE_ID`
- `STRIPE_LIFETIME_PRICE_ID`
- `EMAIL_HOST`
- `EMAIL_PORT`
- `EMAIL_USER`
- `EMAIL_PASSWORD`
- `EMAIL_FROM`
- `ENCRYPTION_KEY`
- `RENEWAL_CRON_KEY`
- `ACME_DIRECTORY_URL` (use production URL)
- `NEXT_PUBLIC_APP_URL` (your Vercel URL)

### Update Vercel Cron

1. Edit `vercel.json`
2. Replace `YOUR_RENEWAL_CRON_KEY` with your actual key
3. Deploy again: `vercel --prod`

## Step 7: Configure ACME Production

⚠️ **Important**: Start with staging for testing!

### Staging (for testing)
```env
ACME_DIRECTORY_URL=https://acme-staging-v02.api.letsencrypt.org/directory
```

### Production (after testing)
```env
ACME_DIRECTORY_URL=https://acme-v02.api.letsencrypt.org/directory
```

## Step 8: Update Clerk & Stripe URLs

### Clerk

Go to Clerk Dashboard → Settings:
- Add your production domain
- Update redirect URLs

### Stripe

Go to Stripe Dashboard → Webhooks:
- Update webhook URL to production domain
- Test webhook

## Step 9: Test the Application

### Test Free Tier
1. Sign up for an account
2. Try generating a certificate (use staging first)
3. Verify certificate download

### Test Bridge Protocol
1. Upgrade to Pro/Lifetime (test mode)
2. Generate certificate with Bridge enabled
3. Download Bridge Kit
4. Verify bridge.php contains correct API URL

### Test Cron Job
1. Manually trigger: `curl https://your-domain.com/api/cron/renew?key=YOUR_KEY`
2. Check logs for success
3. Verify emails are sent

## Step 10: Monitoring & Maintenance

### Set Up Monitoring

1. **Vercel Analytics**: Enable in project settings
2. **Error Tracking**: Consider Sentry integration
3. **Uptime Monitoring**: Use UptimeRobot or similar

### Regular Checks

- [ ] Monitor Let's Encrypt rate limits
- [ ] Check email delivery success rate
- [ ] Review error logs weekly
- [ ] Monitor database size
- [ ] Check Stripe webhook deliveries

## Troubleshooting

### Database Connection Issues

```bash
# Test connection
psql $DATABASE_URL

# If fails, check:
# - Database is running
# - Connection string is correct
# - IP whitelist (if using managed DB)
```

### SSL Generation Fails

1. Check ACME directory URL is correct
2. Verify domain is accessible
3. Check Let's Encrypt rate limits
4. Review error logs in Vercel

### Emails Not Sending

1. Test SMTP credentials manually
2. Check spam folder
3. Verify email service allows SMTP
4. Review email logs

### Stripe Webhooks Failing

1. Check webhook URL is correct
2. Verify webhook secret matches
3. Test webhook in Stripe dashboard
4. Check endpoint logs in Vercel

## Security Hardening

### Production Checklist

- [ ] All environment variables set securely
- [ ] Clerk rate limiting enabled
- [ ] Stripe webhook signature verification active
- [ ] HTTPS enforced (automatic on Vercel)
- [ ] Database connection uses SSL
- [ ] Cron endpoint protected with secret
- [ ] Private keys encrypted at rest
- [ ] Regular security audits

### Rate Limiting

Add rate limiting to API routes using Vercel Rate Limiting or Upstash Redis.

Example with Upstash:

```typescript
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, "1 m"),
});
```

## Scaling Considerations

### Database

- Monitor query performance
- Add indexes as needed
- Consider read replicas for high traffic

### API

- Implement caching where appropriate
- Use Vercel Edge Functions for global distribution
- Add Redis for session storage

### Email

- Use email queue for batch sending
- Monitor delivery rates
- Have backup email provider

## Support Resources

- [Next.js Docs](https://nextjs.org/docs)
- [Vercel Docs](https://vercel.com/docs)
- [Clerk Docs](https://clerk.com/docs)
- [Stripe Docs](https://stripe.com/docs)
- [Let's Encrypt Docs](https://letsencrypt.org/docs/)

## Getting Help

- GitHub Issues: Report bugs
- Discord Community: Get help from other users
- Email Support: support@easyssl.com

---

**Congratulations! 🎉 Your EasySSL application is now live!**
