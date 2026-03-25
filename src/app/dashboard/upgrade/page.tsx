"use client";

import { useState, useEffect } from "react";
import { Lock, Check, Crown, Zap } from "lucide-react";
import Link from "next/link";

declare global {
  interface Window {
    Paddle: any;
  }
}

const PLAN_UI = [
  {
    id: "pro",
    name: "Pro",
    price: "$29",
    period: "/ year",
    tagline: "Billed annually — cancel anytime",
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
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paddleReady, setPaddleReady] = useState(false);
  const [config, setConfig] = useState<{
    clientToken: string;
    yearlyPriceId: string;
    lifetimePriceId: string;
  } | null>(null);

  // Step 1 — fetch config (price IDs + client token) from our server
  useEffect(() => {
    fetch("/api/paddle/config")
      .then((r) => r.json())
      .then((data) => setConfig(data))
      .catch(() => setError("Failed to load payment config. Please refresh."));
  }, []);

  // Step 2 — once we have the client token, initialise Paddle
  useEffect(() => {
    if (!config?.clientToken) return;

    const interval = setInterval(() => {
      if (window.Paddle) {
        window.Paddle.Initialize({
          token: config.clientToken,
          eventCallback: (data: any) => {
            if (data.name === "checkout.completed") {
              window.location.href = "/dashboard?upgraded=1";
            }
            if (data.name === "checkout.closed") {
              setLoading(null);
            }
          },
        });
        setPaddleReady(true);
        clearInterval(interval);
      }
    }, 200);

    return () => clearInterval(interval);
  }, [config]);

  async function handleUpgrade(planId: string) {
    if (!paddleReady || !window.Paddle || !config) {
      setError("Payment system not ready. Please refresh and try again.");
      return;
    }

    setLoading(planId);
    setError(null);

    try {
      const res = await fetch("/api/user/me");
      const { email } = await res.json();

      const priceId =
        planId === "pro" ? config.yearlyPriceId : config.lifetimePriceId;

      console.log("[Paddle] Opening checkout with priceId:", priceId);

      window.Paddle.Checkout.open({
        items: [{ priceId, quantity: 1 }],
        customer: { email },
        settings: {
          displayMode: "overlay",
          theme: "light",
          locale: "en",
        },
      });
    } catch (err: any) {
      setError(err.message || "Failed to open checkout");
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
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
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Upgrade Your Plan</h1>
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
          {PLAN_UI.map((plan) => {
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
                  disabled={!!loading || !paddleReady || !config}
                  className="w-full py-3 px-6 bg-white text-gray-900 rounded-xl font-bold hover:bg-gray-50 transition disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading === plan.id
                    ? "Opening checkout…"
                    : !config
                    ? "Loading…"
                    : `Get ${plan.name} — ${plan.price}`}
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-10 text-center text-sm text-gray-500">
          <p>
            Payments are processed securely by <strong>Paddle</strong>. Your card details never touch our servers.
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
