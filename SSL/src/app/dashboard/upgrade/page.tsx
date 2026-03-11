"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Check, Crown, Zap } from "lucide-react";
import Link from "next/link";

const PLANS = [
  {
    id: "pro",
    name: "Pro",
    price: "$29",
    period: "/ year",
    tagline: "Billed annually",
    domains: 5,
    color: "blue",
    icon: Zap,
    features: [
      "Up to 5 domains",
      "Bridge file — upload once",
      "Fully automatic renewal",
      "Email + dashboard delivery",
      "Priority support",
    ],
  },
  {
    id: "lifetime",
    name: "Lifetime",
    price: "$49",
    period: " one-time",
    tagline: "Pay once, own forever",
    domains: 10,
    color: "purple",
    icon: Crown,
    features: [
      "Up to 10 domains",
      "Bridge file — upload once",
      "Fully automatic renewal",
      "Email + dashboard delivery",
      "Priority support",
      "All future features included",
      "Never pay again",
    ],
  },
];

export default function UpgradePage() {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUpgrade(plan: string) {
    setLoading(plan);
    setError(null);
    try {
      const res = await fetch("/api/paystack/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to start payment");
      }

      // Redirect to Paystack checkout
      window.location.href = data.authorization_url;
    } catch (err: any) {
      setError(err.message);
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/dashboard" className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
            <Lock className="w-5 h-5 text-blue-600" />
            <span className="font-semibold">EasySSL</span>
          </Link>
          <span className="text-gray-400">/</span>
          <span className="text-gray-900 font-medium">Upgrade Plan</span>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Upgrade Your Plan
          </h1>
          <p className="text-lg text-gray-600">
            Get automatic renewals, more domains, and peace of mind.
          </p>
        </div>

        {error && (
          <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-center">
            {error}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-8">
          {PLANS.map((plan) => {
            const Icon = plan.icon;
            const isPurple = plan.color === "purple";
            return (
              <div
                key={plan.id}
                className={`rounded-2xl p-8 shadow-lg ${
                  isPurple
                    ? "bg-gradient-to-br from-purple-600 to-purple-700 text-white"
                    : "bg-gradient-to-br from-blue-600 to-blue-700 text-white"
                }`}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h2 className="text-2xl font-bold">{plan.name}</h2>
                </div>

                <div className="mb-2">
                  <span className="text-5xl font-bold">{plan.price}</span>
                  <span className="text-lg opacity-80">{plan.period}</span>
                </div>
                <p className="text-sm opacity-70 mb-8">{plan.tagline}</p>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="w-5 h-5 mt-0.5 flex-shrink-0 opacity-90" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={!!loading}
                  className="w-full py-3 px-6 bg-white text-gray-900 rounded-xl font-bold hover:bg-gray-50 transition disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading === plan.id
                    ? "Redirecting to payment…"
                    : `Get ${plan.name} — ${plan.price}`}
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-10 text-center text-sm text-gray-500">
          <p>
            Payments are processed securely by{" "}
            <strong>Paystack</strong>. You will be redirected to complete payment.
          </p>
          <p className="mt-2">
            <Link href="/dashboard" className="underline hover:text-gray-700">
              ← Back to dashboard
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
