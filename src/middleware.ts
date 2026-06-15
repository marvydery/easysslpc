import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/',
  '/terms',
  '/privacy',
  '/refund',
  '/api/bridge(.*)',
  '/api/webhooks(.*)',
  '/api/cron/(.*)',
  '/api/ssl/check(.*)',
  '/api/paystack/webhook(.*)',
  '/api/paddle/webhook(.*)',
]);

export default clerkMiddleware((auth, request) => {
  if (!isPublicRoute(request)) {
    auth().protect();
  }
});
