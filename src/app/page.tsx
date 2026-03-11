import Link from "next/link";
import { Lock, Zap, Shield, Check, SearchCheck } from "lucide-react";
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
        <h2 className="text-5xl font-bold text-gray-900 mb-6">
          Free SSL Certificates
          <br />
          <span className="text-blue-600">Auto-Renewed Forever</span>
        </h2>
        <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          Generate Let&apos;s Encrypt SSL certificates with automatic renewal.
          No more manual renewals every 90 days.
        </p>
        <Link
          href="/sign-up"
          className="inline-block px-8 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-lg"
        >
          Start Free Trial
        </Link>
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
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-white p-8 rounded-xl shadow-lg">
            <Zap className="w-12 h-12 text-blue-600 mb-4" />
            <h3 className="text-xl font-bold mb-3">Instant Generation</h3>
            <p className="text-gray-600">
              Generate your SSL certificate in minutes with our simple wizard.
            </p>
          </div>
          <div className="bg-white p-8 rounded-xl shadow-lg">
            <Shield className="w-12 h-12 text-blue-600 mb-4" />
            <h3 className="text-xl font-bold mb-3">Auto-Renewal</h3>
            <p className="text-gray-600">
              Upload once, renew forever. No more expired certificates.
            </p>
          </div>
          <div className="bg-white p-8 rounded-xl shadow-lg">
            <Lock className="w-12 h-12 text-blue-600 mb-4" />
            <h3 className="text-xl font-bold mb-3">Secure & Encrypted</h3>
            <p className="text-gray-600">
              All private keys are encrypted with AES-256 encryption.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="container mx-auto px-4 py-20">
        <h2 className="text-4xl font-bold text-center mb-12">Simple Pricing</h2>
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {/* Free */}
          <div className="bg-white p-8 rounded-xl shadow-lg border-2 border-gray-200">
            <h3 className="text-2xl font-bold mb-2">Free</h3>
            <p className="text-gray-600 mb-4">90-day certificate</p>
            <div className="text-4xl font-bold mb-6">$0</div>
            <ul className="space-y-3 mb-8">
              <li className="flex items-start gap-2">
                <Check className="w-5 h-5 text-green-500 mt-0.5" />
                <span>1 domain</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-5 h-5 text-green-500 mt-0.5" />
                <span>Manual file upload</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-5 h-5 text-green-500 mt-0.5" />
                <span>Manual renewal</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-5 h-5 text-green-500 mt-0.5" />
                <span>Dashboard download</span>
              </li>
            </ul>
            <Link
              href="/sign-up"
              className="block w-full text-center px-6 py-3 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300 font-medium"
            >
              Get Started
            </Link>
          </div>

          {/* Pro */}
          <div className="bg-blue-600 text-white p-8 rounded-xl shadow-xl transform scale-105">
            <div className="bg-blue-500 text-xs font-bold px-3 py-1 rounded-full inline-block mb-2">
              MOST POPULAR
            </div>
            <h3 className="text-2xl font-bold mb-2">Pro</h3>
            <p className="text-blue-100 mb-4">Yearly Subscription</p>
            <div className="text-4xl font-bold mb-6">$29<span className="text-xl">/year</span></div>
            <ul className="space-y-3 mb-8">
              <li className="flex items-start gap-2">
                <Check className="w-5 h-5 text-blue-200 mt-0.5" />
                <span>Up to <strong>5 domains</strong></span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-5 h-5 text-blue-200 mt-0.5" />
                <span>Bridge file (upload once)</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-5 h-5 text-blue-200 mt-0.5" />
                <span>Fully automatic renewal</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-5 h-5 text-blue-200 mt-0.5" />
                <span>Email + dashboard delivery</span>
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
            <h3 className="text-2xl font-bold mb-2">Lifetime</h3>
            <p className="text-gray-600 mb-4">One-time Payment</p>
            <div className="text-4xl font-bold mb-6">$49</div>
            <ul className="space-y-3 mb-8">
              <li className="flex items-start gap-2">
                <Check className="w-5 h-5 text-green-500 mt-0.5" />
                <span>Up to <strong>10 domains</strong></span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-5 h-5 text-green-500 mt-0.5" />
                <span>Bridge file (upload once)</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-5 h-5 text-green-500 mt-0.5" />
                <span>Fully automatic renewal</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-5 h-5 text-green-500 mt-0.5" />
                <span>Email + dashboard delivery</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-5 h-5 text-green-500 mt-0.5" />
                <span>Lifetime access — pay once</span>
              </li>
            </ul>
            <Link
              href="/sign-up"
              className="block w-full text-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              Get Lifetime
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8 mt-20">
        <div className="container mx-auto px-4 text-center text-gray-600">
          <p>&copy; 2024 EasySSL. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
