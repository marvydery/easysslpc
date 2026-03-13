import Link from "next/link";
import { Lock } from "lucide-react";

export default function TermsPage() {
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
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Terms of Service</h1>
        <p className="text-gray-500 mb-10">Last updated: March 2025</p>

        <div className="prose prose-gray max-w-none space-y-8 text-gray-700">

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">1. Acceptance of Terms</h2>
            <p>By accessing or using EasySSL (&quot;the Service&quot;) at easyssl.app, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">2. Description of Service</h2>
            <p>EasySSL provides a platform for generating and managing SSL/TLS certificates issued by Let&apos;s Encrypt, a free and open Certificate Authority. The Service includes certificate generation, storage, auto-renewal features (for paid plans), and related tools.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">3. User Accounts</h2>
            <p>You must create an account to use the Service. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You must provide accurate and complete information when creating your account.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">4. Acceptable Use</h2>
            <p>You agree to use the Service only for lawful purposes and only for domains you own or have explicit authorization to manage. You may not:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Generate certificates for domains you do not own or control</li>
              <li>Attempt to circumvent Let&apos;s Encrypt rate limits through the Service</li>
              <li>Use the Service for any illegal or unauthorized purpose</li>
              <li>Resell or redistribute the Service without written permission</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">5. Subscription and Payments</h2>
            <p>Paid plans (Pro and Lifetime) are processed through Paddle. The Pro plan is a yearly subscription that will renew automatically unless cancelled. The Lifetime plan is a one-time payment with no recurring charges. All prices are displayed in USD. Taxes may apply based on your location and are handled by Paddle as Merchant of Record.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">6. Refund Policy</h2>
            <p>Please refer to our <Link href="/refund" className="text-blue-600 hover:underline">Refund Policy</Link> for information on refunds and cancellations.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">7. Intellectual Property</h2>
            <p>The Service and its original content, features, and functionality are owned by EasySSL and are protected by international copyright, trademark, and other intellectual property laws. SSL certificates issued through the Service are governed by Let&apos;s Encrypt&apos;s Subscriber Agreement.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">8. Disclaimer of Warranties</h2>
            <p>The Service is provided &quot;as is&quot; without warranties of any kind, either express or implied. We do not warrant that the Service will be uninterrupted, error-free, or that certificates will be issued without delay. SSL certificates are subject to Let&apos;s Encrypt&apos;s policies and availability.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">9. Limitation of Liability</h2>
            <p>To the fullest extent permitted by law, EasySSL shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of or inability to use the Service, including but not limited to expired certificates, website downtime, or data loss.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">10. Termination</h2>
            <p>We reserve the right to suspend or terminate your account at our discretion if you violate these Terms. Upon termination, your right to use the Service will immediately cease. You may also delete your account at any time from your dashboard.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">11. Changes to Terms</h2>
            <p>We reserve the right to modify these Terms at any time. We will notify users of significant changes via email. Continued use of the Service after changes constitutes acceptance of the new Terms.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">12. Contact</h2>
            <p>For questions about these Terms, please contact us at <a href="mailto:support@easyssl.app" className="text-blue-600 hover:underline">support@easyssl.app</a>.</p>
          </section>

        </div>
      </div>
      <footer className="border-t border-gray-200 py-8 mt-12">
        <div className="container mx-auto px-4 text-center text-gray-500 text-sm">
          <div className="flex justify-center gap-6 mb-3">
            <Link href="/privacy" className="hover:text-gray-700">Privacy Policy</Link>
            <Link href="/refund" className="hover:text-gray-700">Refund Policy</Link>
            <Link href="/" className="hover:text-gray-700">Home</Link>
          </div>
          <p>&copy; {new Date().getFullYear()} EasySSL. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
