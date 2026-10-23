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

// Run Clerk only on pages and API routes. Without this matcher, auth().protect()
// also runs on /_next/static (CSS/JS) and returns 404 to logged-out visitors.
export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
