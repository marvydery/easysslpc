# EasySSL - Free SSL Certificate Automation Platform

EasySSL is a SaaS platform that automates the generation and renewal of free Let's Encrypt SSL certificates for users on shared hosting. It solves the "90-day manual renewal" problem using a persistent **Bridge File** for paid users.

## Features

- 🔒 **Free SSL Certificates** from Let's Encrypt
- 🔄 **Automatic Renewal** with Bridge protocol
- 📧 **Email Delivery** of certificates
- 💳 **Multiple Pricing Tiers** (Free, Pro, Lifetime)
- 🔐 **AES-256 Encryption** for private keys
- 📊 **User Dashboard** for certificate management
- 🔍 **Free SSL Checker** — instantly check any domain's certificate status, expiry, issuer, SANs, and fingerprint

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Authentication**: Clerk
- **Database**: Supabase (PostgreSQL) + Drizzle ORM
- **Payments**: Stripe
- **SSL Generation**: acme-client (Let's Encrypt)
- **Styling**: Tailwind CSS

## Project Structure

```
e:/SSL/
├── src/
│   ├── app/                    # Next.js app directory
│   │   ├── api/               # API routes
│   │   │   ├── bridge/        # Bridge API endpoint
│   │   │   ├── ssl/
│   │   │   │   ├── generate/  # SSL certificate generation
│   │   │   │   └── check/     # SSL checker (public, no auth)
│   │   │   ├── cron/          # Renewal cron job
│   │   │   └── stripe/        # Stripe webhooks
│   │   ├── dashboard/         # User dashboard
│   │   ├── layout.tsx         # Root layout
│   │   ├── page.tsx           # Landing page (with SSL checker)
│   │   └── globals.css        # Global styles
│   ├── components/
│   │   └── SslChecker.tsx     # Interactive SSL checker UI
│   ├── lib/                   # Utility functions
│   │   ├── db/                # Supabase/Drizzle schema & client
│   │   ├── acme.ts            # SSL generation logic
│   │   ├── crypto.ts          # Encryption utilities
│   │   ├── email.ts           # Email notifications
│   │   └── bridge-kit.ts      # Bridge file generator
│   └── middleware.ts          # Clerk authentication
├── drizzle/                   # Database migrations
├── package.json
├── tsconfig.json
└── .env.example
```

## Setup Instructions

### 1. Prerequisites

- Node.js 18+ installed
- PostgreSQL database (or use Neon, Supabase, etc.)
- Clerk account for authentication
- Stripe account for payments
- Email service (Gmail, SendGrid, etc.)

### 2. Clone and Install

```bash
# Clone the repository
git clone <your-repo-url>
cd SSL

# Install dependencies
npm install
```

### 3. Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

**Required Variables:**

- `DATABASE_URL` - PostgreSQL connection string
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk public key
- `CLERK_SECRET_KEY` - Clerk secret key
- `STRIPE_SECRET_KEY` - Stripe secret key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook secret
- `STRIPE_PRO_PRICE_ID` - Stripe price ID for Pro plan
- `STRIPE_LIFETIME_PRICE_ID` - Stripe price ID for Lifetime plan
- `EMAIL_HOST`, `EMAIL_USER`, `EMAIL_PASSWORD` - Email configuration
- `ENCRYPTION_KEY` - 32-byte hex string for AES-256 encryption
- `RENEWAL_CRON_KEY` - Secret key for cron job endpoint
- `NEXT_PUBLIC_APP_URL` - Your app URL

**Generate Encryption Key:**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Database Setup

```bash
# Push schema to database
npm run db:push

# Open Drizzle Studio (optional)
npm run db:studio
```

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Bridge Protocol

The Bridge Protocol enables automatic SSL renewal without user intervention:

1. **User uploads Bridge Kit** to their web server (once)
2. **bridge.php** proxies ACME challenges to EasySSL API
3. **EasySSL** validates domain ownership
4. **Certificate is renewed** automatically every 75 days
5. **Email sent** to user with new certificate

### Bridge Kit Contents

- `bridge.php` - Proxy script that calls EasySSL API
- `.htaccess` - Redirects ACME challenges to bridge.php
- `README.txt` - Installation instructions

## Stripe Integration

### Create Products in Stripe Dashboard

1. **Pro Plan** - Yearly subscription ($19/year)
2. **Lifetime Plan** - One-time payment ($29)

### Configure Webhooks

Add webhook endpoint: `https://your-domain.com/api/stripe/webhook`

Events to listen for:
- `checkout.session.completed`
- `customer.subscription.deleted`
- `customer.subscription.updated`

## Cron Job Setup

The renewal cron job should run daily to check for expiring certificates.

### Option 1: Vercel Cron (Recommended)

Create `vercel.json`:

```json
{
  "crons": [{
    "path": "/api/cron/renew?key=YOUR_RENEWAL_CRON_KEY",
    "schedule": "0 2 * * *"
  }]
}
```

### Option 2: External Cron Service

Use services like:
- Cron-job.org
- EasyCron
- GitHub Actions

Make a daily GET request to:
```
https://your-domain.com/api/cron/renew?key=YOUR_RENEWAL_CRON_KEY
```

## Deployment

### Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

### Environment Variables

Add all environment variables in Vercel dashboard:
- Project Settings → Environment Variables

### Database

Use a production PostgreSQL database:
- Neon (recommended)
- Supabase
- Railway
- AWS RDS

## Security Considerations

1. ✅ **Private Keys Encrypted** - All private keys stored with AES-256 encryption
2. ✅ **Bridge Secret** - Unique secret per domain for authentication
3. ✅ **Cron Protection** - Renewal endpoint protected with secret key
4. ✅ **Rate Limiting** - Implement rate limiting for API routes
5. ✅ **HTTPS Only** - Always use HTTPS in production

## API Endpoints

### Public Endpoints

- `GET /api/bridge` - Bridge protocol endpoint (called by bridge.php)
- `POST /api/stripe/webhook` - Stripe webhook handler
- `POST /api/ssl/check` - SSL Certificate Checker (no auth required)

### Protected Endpoints (Requires Auth)

- `POST /api/ssl/generate` - Generate SSL certificate
- `GET /dashboard` - User dashboard

### Cron Endpoints (Requires Key)

- `GET /api/cron/renew?key=CRON_KEY` - Renewal cron job

## Pricing Tiers

| Feature | Free | Pro ($19/yr) | Lifetime ($29) |
|---------|------|--------------|----------------|
| Duration | 90 Days | Yearly | One-time |
| Verification | Manual Upload | Bridge File | Bridge File |
| Renewal | Manual | Automatic | Automatic |
| Delivery | Dashboard | Email + Dashboard | Email + Dashboard |

## Testing

### Test Certificate Generation

Use Let's Encrypt staging environment for testing:

```env
ACME_DIRECTORY_URL=https://acme-staging-v02.api.letsencrypt.org/directory
```

### Test Stripe Payments

Use Stripe test mode with test cards:
- `4242 4242 4242 4242` - Success
- `4000 0000 0000 0002` - Decline

## Troubleshooting

### SSL Generation Fails

- Check domain DNS is pointing correctly
- Verify `.well-known/acme-challenge` is accessible
- Check Let's Encrypt rate limits

### Bridge Not Working

- Verify bridge.php is uploaded correctly
- Check .htaccess mod_rewrite is enabled
- Confirm bridge secret matches database

### Email Not Sending

- Verify SMTP credentials
- Check email service allows app passwords
- Review email logs in your service

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For support, email support@easyssl.com or open an issue.

## Roadmap

- [ ] Multi-domain wildcard certificates
- [ ] DNS-01 challenge support
- [ ] Cloudflare integration
- [ ] Certificate expiry notifications
- [ ] Team collaboration features
- [ ] API access for developers

---

**Built with ❤️ for the web hosting community**
