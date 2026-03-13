import Link from "next/link";
import { Lock } from "lucide-react";

export default function RefundPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Lock className="w-6 h-6 text-blue-600" />
            <span className="text-xl font-bold">EasySSL</span>
          </Link>
        </div>
      </header>
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Refund Policy</h1>
        <p className="text-gray-500 mb-10">Last updated: March 2025</p>

        <div className="prose prose-gray max-w-none space-y-8 text-gray-700">

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">1. Our Commitment</h2>
            <p>We want you to be satisfied with EasySSL. If you are not happy with your purchase, we offer a straightforward refund policy as outlined below.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">2. Pro Plan (Yearly Subscription)</h2>
            <ul className="list-disc list-inside space-y-2">
              <li><strong>14-day money-back guarantee</strong> — If you request a refund within 14 days of your initial purchase, we will issue a full refund, no questions asked.</li>
              <li><strong>After 14 days</strong> — Refunds are not available for the current billing period but you may cancel to prevent future renewals.</li>
              <li><strong>Renewal charges</strong> — If you were charged for a renewal and no longer wish to continue, contact us within 7 days of the renewal charge for a full refund.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">3. Lifetime Plan (One-time Payment)</h2>
            <ul className="list-disc list-inside space-y-2">
              <li><strong>14-day money-back guarantee</strong> — Full refund available within 14 days of purchase if you are not satisfied.</li>
              <li><strong>After 14 days</strong> — Lifetime purchases are non-refundable as you retain permanent access to all features.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">4. How to Request a Refund</h2>
            <p>To request a refund, email us at <a href="mailto:support@easyssl.app" className="text-blue-600 hover:underline">support@easyssl.app</a> with:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Your account email address</li>
              <li>Your order/transaction ID from Paddle</li>
              <li>Reason for the refund request (optional but helpful)</li>
            </ul>
            <p className="mt-3">We aim to process all refund requests within <strong>3 business days</strong>. Refunds are processed through Paddle and may take 5-10 business days to appear on your statement depending on your bank.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">5. Cancellations</h2>
            <p>You can cancel your Pro subscription at any time from your account dashboard. Cancellation takes effect at the end of the current billing period — you will retain access to Pro features until then. Cancelling does not automatically trigger a refund.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">6. Exceptions</h2>
            <p>Refunds may be declined in cases of:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Violation of our Terms of Service</li>
              <li>Fraudulent purchase activity</li>
              <li>Accounts that have been suspended for abuse</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">7. Contact</h2>
            <p>For refund requests or questions, contact us at <a href="mailto:support@easyssl.app" className="text-blue-600 hover:underline">support@easyssl.app</a>. We typically respond within 24 hours.</p>
          </section>

        </div>
      </div>
      <footer className="border-t border-gray-200 py-8 mt-12">
        <div className="container mx-auto px-4 text-center text-gray-500 text-sm">
          <div className="flex justify-center gap-6 mb-3">
            <Link href="/terms" className="hover:text-gray-700">Terms of Service</Link>
            <Link href="/privacy" className="hover:text-gray-700">Privacy Policy</Link>
            <Link href="/" className="hover:text-gray-700">Home</Link>
          </div>
          <p>&copy; {new Date().getFullYear()} EasySSL. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
