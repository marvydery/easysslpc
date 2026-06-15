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
  '/api/cron(.*)',
  '/api/ssl/check(.*)',
  '/api/paystack/webhook(.*)',
  '/api/paddle/webhook(.*)',  // ← added
]);
  "/api/cron/challenge(.*)",
  "/api/cron/finalize(.*)",

export default clerkMiddleware((auth, request) => {
  if (!isPublicRoute(request)) {
    auth().protect();
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
