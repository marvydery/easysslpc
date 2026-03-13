import Link from "next/link";
import { Lock, Zap, Shield, Check, SearchCheck, Upload, RefreshCw, ChevronDown } from "lucide-react";
import SslChecker from "@/components/SslChecker";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Header */}
      <header className="container mx-auto px-4 py-6 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Lock className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">EasySSL</h1>
        </div>
        <div className="flex gap-4">
          <Link
            href="/sign-in"
            className="px-4 py-2 text-blue-600 hover:text-blue-700 font-medium"
          >
            Sign In
          </Link>
          <Link
            href="/sign-up"
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            Get Started
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 text-center">
        <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 text-sm font-medium px-4 py-2 rounded-full mb-6">
          <Shield className="w-4 h-4" />
          Powered by Let&apos;s Encrypt — Trusted by millions of websites
        </div>
        <h2 className="text-5xl font-bold text-gray-900 mb-6">
          Free SSL Certificates
          <br />
          <span className="text-blue-600">Auto-Renewed Forever</span>
        </h2>
        <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
          Generate trusted SSL certificates in minutes. Upload two files once and
          your certificate renews automatically — no more expired sites.
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link
            href="/sign-up"
            className="inline-block px-8 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-lg shadow-lg shadow-blue-200"
          >
            Get Started Free
          </Link>
          <Link
            href="/sign-in"
            className="inline-block px-8 py-4 bg-white text-blue-600 border-2 border-blue-200 rounded-lg hover:border-blue-400 font-medium text-lg"
          >
            Sign In →
          </Link>
        </div>
        <p className="text-sm text-gray-500 mt-4">No credit card required · Free plan available</p>
      </section>

      {/* How It Works */}
      <section className="container mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">How It Works</h2>
        <p className="text-center text-gray-600 mb-12 max-w-xl mx-auto">
          Three simple steps to get your SSL certificate — and keep it forever.
        </p>
        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <div className="relative bg-white p-6 rounded-xl border border-gray-200 shadow-sm text-center">
            <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg mx-auto mb-4">1</div>
            <Zap className="w-8 h-8 text-blue-600 mx-auto mb-3" />
            <h3 className="font-bold text-gray-900 mb-2">Generate</h3>
            <p className="text-sm text-gray-600">Enter your domain and we create your SSL certificate via Let&apos;s Encrypt.</p>
          </div>
          <div className="relative bg-white p-6 rounded-xl border border-gray-200 shadow-sm text-center">
            <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg mx-auto mb-4">2</div>
            <Upload className="w-8 h-8 text-blue-600 mx-auto mb-3" />
            <h3 className="font-bold text-gray-900 mb-2">Verify</h3>
            <p className="text-sm text-gray-600">Upload a small verification file to your server to prove domain ownership.</p>
          </div>
          <div className="relative bg-white p-6 rounded-xl border border-gray-200 shadow-sm text-center">
            <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg mx-auto mb-4">3</div>
            <RefreshCw className="w-8 h-8 text-blue-600 mx-auto mb-3" />
            <h3 className="font-bold text-gray-900 mb-2">Auto-Renew</h3>
            <p className="text-sm text-gray-600">Pro users upload the Bridge file once — renewals happen automatically every 90 days.</p>
          </div>
        </div>
      </section>

      {/* SSL Checker Section */}
      <section className="container mx-auto px-4 py-16">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-100 rounded-2xl mb-4">
              <SearchCheck className="w-7 h-7 text-blue-600" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-3">
              Free SSL Certificate Checker
            </h2>
            <p className="text-gray-600 text-lg">
              Instantly check the SSL status of any website — expiry date,
              issuer, validity, and more.
            </p>
          </div>
          <SslChecker />
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-20">
        <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">Why Choose EasySSL?</h2>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-white p-8 rounded-xl shadow-lg">
            <Zap className="w-12 h-12 text-blue-600 mb-4" />
            <h3 className="text-xl font-bold mb-3">Instant Generation</h3>
            <p className="text-gray-600">
              Generate your SSL certificate in minutes with our simple step-by-step wizard. No technical knowledge needed.
            </p>
          </div>
          <div className="bg-white p-8 rounded-xl shadow-lg">
            <Shield className="w-12 h-12 text-blue-600 mb-4" />
            <h3 className="text-xl font-bold mb-3">Auto-Renewal</h3>
            <p className="text-gray-600">
              Upload the Bridge file once and forget about renewals forever. We handle everything automatically.
            </p>
          </div>
          <div className="bg-white p-8 rounded-xl shadow-lg">
            <Lock className="w-12 h-12 text-blue-600 mb-4" />
            <h3 className="text-xl font-bold mb-3">Secure & Encrypted</h3>
            <p className="text-gray-600">
              All private keys are encrypted with AES-256. Your keys are never stored in plain text.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="container mx-auto px-4 py-20">
        <h2 className="text-4xl font-bold text-center mb-4">Simple Pricing</h2>
        <p className="text-center text-gray-600 mb-12">Start free. Upgrade when you need auto-renewal.</p>
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {/* Free */}
          <div className="bg-white p-8 rounded-xl shadow-lg border-2 border-gray-200">
            <h3 className="text-2xl font-bold mb-2">Free</h3>
            <p className="text-gray-600 mb-4">Perfect to get started</p>
            <div className="text-4xl font-bold mb-6">$0</div>
            <ul className="space-y-3 mb-8">
              <li className="flex items-start gap-2">
                <Check className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                <span>1 domain</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                <span>Manual file upload verification</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                <span>Manual renewal every 90 days</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                <span>Download CRT, KEY & CABUNDLE</span>
              </li>
            </ul>
            <Link
              href="/sign-up"
              className="block w-full text-center px-6 py-3 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300 font-medium"
            >
              Get Started Free
            </Link>
          </div>

          {/* Pro */}
          <div className="bg-blue-600 text-white p-8 rounded-xl shadow-xl transform scale-105">
            <div className="bg-blue-500 text-xs font-bold px-3 py-1 rounded-full inline-block mb-2">
              MOST POPULAR
            </div>
            <h3 className="text-2xl font-bold mb-2">Pro</h3>
            <p className="text-blue-100 mb-4">Yearly Subscription</p>
            <div className="text-4xl font-bold mb-6">$29<span className="text-xl font-normal">/year</span></div>
            <ul className="space-y-3 mb-8">
              <li className="flex items-start gap-2">
                <Check className="w-5 h-5 text-blue-200 mt-0.5 flex-shrink-0" />
                <span>Up to <strong>5 domains</strong></span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-5 h-5 text-blue-200 mt-0.5 flex-shrink-0" />
                <span>Bridge file — upload once, renew forever</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-5 h-5 text-blue-200 mt-0.5 flex-shrink-0" />
                <span>Fully automatic renewal</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-5 h-5 text-blue-200 mt-0.5 flex-shrink-0" />
                <span>Email + dashboard delivery</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-5 h-5 text-blue-200 mt-0.5 flex-shrink-0" />
                <span>Auto-renewal check tool</span>
              </li>
            </ul>
            <Link
              href="/sign-up"
              className="block w-full text-center px-6 py-3 bg-white text-blue-600 rounded-lg hover:bg-blue-50 font-medium"
            >
              Start Pro
            </Link>
          </div>

          {/* Lifetime */}
          <div className="bg-white p-8 rounded-xl shadow-lg border-2 border-blue-600">
            <div className="bg-blue-50 text-blue-700 text-xs font-bold px-3 py-1 rounded-full inline-block mb-2">
              BEST VALUE
            </div>
            <h3 className="text-2xl font-bold mb-2">Lifetime</h3>
            <p className="text-gray-600 mb-4">One-time Payment</p>
            <div className="text-4xl font-bold mb-6">$49</div>
            <ul className="space-y-3 mb-8">
              <li className="flex items-start gap-2">
                <Check className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                <span>Up to <strong>10 domains</strong></span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                <span>Bridge file — upload once, renew forever</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                <span>Fully automatic renewal</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                <span>Email + dashboard delivery</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                <span>Auto-renewal check tool</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                <span className="font-semibold">Pay once, use forever</span>
              </li>
            </ul>
            <Link
              href="/sign-up"
              className="block w-full text-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              Get Lifetime Access
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="container mx-auto px-4 py-20 max-w-3xl">
        <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">Frequently Asked Questions</h2>
        <div className="space-y-4">
          {[
            {
              q: "Is the Free plan really free?",
              a: "Yes — completely free. You get one domain with a 90-day SSL certificate. You'll need to manually renew it every 90 days by repeating the verification step."
            },
            {
              q: "What is the Bridge Protocol?",
              a: "The Bridge Protocol is a small PHP file you upload to your server once. When your certificate is about to expire, our system uses it to automatically complete the verification challenge on your behalf — so your certificate renews without you doing anything."
            },
            {
              q: "Do I need technical knowledge to use EasySSL?",
              a: "No. If you can upload a file to your hosting via cPanel File Manager or FTP, you can use EasySSL. Our step-by-step wizard guides you through every step."
            },
            {
              q: "Will I be notified when my certificate renews?",
              a: "Yes. Pro and Lifetime users receive an email with the new certificate files every time a renewal completes. The dashboard is also updated automatically."
            },
            {
              q: "What hosting providers does EasySSL work with?",
              a: "EasySSL works with any hosting provider that supports file uploads — cPanel, Plesk, DirectAdmin, or custom servers. If you can upload files via FTP or File Manager, it works."
            },
            {
              q: "Are my private keys safe?",
              a: "Yes. Private keys are encrypted with AES-256 before being stored. They are only decrypted temporarily when you download them from the dashboard."
            },
          ].map((item, i) => (
            <details key={i} className="bg-white border border-gray-200 rounded-xl p-6 group">
              <summary className="flex items-center justify-between cursor-pointer font-semibold text-gray-900 list-none">
                {item.q}
                <ChevronDown className="w-5 h-5 text-gray-400 group-open:rotate-180 transition-transform flex-shrink-0 ml-4" />
              </summary>
              <p className="mt-4 text-gray-600 text-sm leading-relaxed">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="container mx-auto px-4 py-20 text-center">
        <div className="bg-blue-600 rounded-2xl p-12 max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to secure your website?</h2>
          <p className="text-blue-100 mb-8">Join hundreds of websites using EasySSL for free SSL certificates.</p>
          <Link
            href="/sign-up"
            className="inline-block px-8 py-4 bg-white text-blue-600 rounded-lg hover:bg-blue-50 font-bold text-lg"
          >
            Get Started Free →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8 mt-8">
        <div className="container mx-auto px-4 text-center text-gray-600">
          <p>&copy; {new Date().getFullYear()} EasySSL. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
