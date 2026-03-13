import Link from "next/link";
import { Lock } from "lucide-react";

export default function PrivacyPage() {
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
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-gray-500 mb-10">Last updated: March 2025</p>

        <div className="prose prose-gray max-w-none space-y-8 text-gray-700">

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">1. Information We Collect</h2>
            <p>We collect the following information when you use EasySSL:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li><strong>Account information:</strong> Email address and authentication data via Clerk</li>
              <li><strong>Domain information:</strong> Domain names you submit for SSL certificate generation</li>
              <li><strong>Certificate data:</strong> SSL certificates and encrypted private keys</li>
              <li><strong>Payment information:</strong> Processed by Paddle — we do not store card details</li>
              <li><strong>Usage data:</strong> Pages visited, features used, via Google Analytics (if enabled)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">2. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Provide, maintain, and improve the Service</li>
              <li>Generate and renew SSL certificates on your behalf</li>
              <li>Send certificate renewal notifications via email</li>
              <li>Process payments and manage subscriptions</li>
              <li>Respond to support requests</li>
              <li>Monitor and analyze usage patterns to improve the Service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">3. Data Storage and Security</h2>
            <p>Your data is stored in a secure PostgreSQL database hosted on Supabase. Private keys are encrypted using AES-256 encryption before storage and are only decrypted temporarily when you download them. We implement industry-standard security measures to protect your data.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">4. Third-Party Services</h2>
            <p>We use the following third-party services:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li><strong>Clerk</strong> — Authentication and user management</li>
              <li><strong>Supabase</strong> — Database hosting</li>
              <li><strong>Paddle</strong> — Payment processing</li>
              <li><strong>Let's Encrypt</strong> — SSL certificate issuance</li>
              <li><strong>Vercel</strong> — Application hosting</li>
              <li><strong>Google Analytics</strong> — Usage analytics (optional)</li>
            </ul>
            <p className="mt-2">Each third-party service has its own privacy policy governing how they handle your data.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">5. Data Sharing</h2>
            <p>We do not sell, trade, or rent your personal information to third parties. We share data only with the third-party services listed above as necessary to provide the Service, and with law enforcement when required by law.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">6. Cookies</h2>
            <p>We use essential cookies for authentication (via Clerk) and session management. If Google Analytics is enabled, analytics cookies may be set. You can control cookie settings through your browser.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">7. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your account and associated data</li>
              <li>Export your certificate data from the dashboard</li>
            </ul>
            <p className="mt-2">To exercise these rights, contact us at <a href="mailto:support@easyssl.app" className="text-blue-600 hover:underline">support@easyssl.app</a> or delete your account directly from the dashboard.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">8. Data Retention</h2>
            <p>We retain your data for as long as your account is active. When you delete your account, your personal data and certificates are permanently deleted within 30 days. Some data may be retained longer if required by law.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">9. Changes to This Policy</h2>
            <p>We may update this Privacy Policy from time to time. We will notify you of significant changes via email. Continued use of the Service after changes constitutes acceptance of the updated policy.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">10. Contact</h2>
            <p>For privacy-related questions or requests, contact us at <a href="mailto:support@easyssl.app" className="text-blue-600 hover:underline">support@easyssl.app</a>.</p>
          </section>

        </div>
      </div>
      <footer className="border-t border-gray-200 py-8 mt-12">
        <div className="container mx-auto px-4 text-center text-gray-500 text-sm">
          <div className="flex justify-center gap-6 mb-3">
            <Link href="/terms" className="hover:text-gray-700">Terms of Service</Link>
            <Link href="/refund" className="hover:text-gray-700">Refund Policy</Link>
            <Link href="/" className="hover:text-gray-700">Home</Link>
          </div>
          <p>&copy; {new Date().getFullYear()} EasySSL. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
