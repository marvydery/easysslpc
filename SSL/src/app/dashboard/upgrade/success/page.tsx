"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle, XCircle, Loader2, Lock } from "lucide-react";
import Link from "next/link";

export default function UpgradeSuccessPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const reference = searchParams.get("reference") || searchParams.get("trxref");

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [plan, setPlan] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!reference) {
      setStatus("error");
      setErrorMsg("No payment reference found.");
      return;
    }

    // Verify the transaction
    fetch(`/api/paystack/verify?reference=${reference}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setPlan(data.plan);
          setStatus("success");
          // Redirect to dashboard after 4 seconds
          setTimeout(() => router.push("/dashboard"), 4000);
        } else {
          setStatus("error");
          setErrorMsg(data.error || "Payment verification failed.");
        }
      })
      .catch(() => {
        setStatus("error");
        setErrorMsg("Could not verify payment. Please contact support.");
      });
  }, [reference]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-10 max-w-md w-full text-center">
        <div className="flex justify-center mb-6">
          <Lock className="w-8 h-8 text-blue-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Payment Verification</h1>

        {status === "loading" && (
          <div className="space-y-4">
            <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto" />
            <p className="text-gray-600">Verifying your payment…</p>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-4">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
            <h2 className="text-xl font-bold text-gray-900">
              Welcome to{" "}
              <span className="capitalize text-blue-600">{plan}</span>!
            </h2>
            <p className="text-gray-600">
              Your subscription has been activated. You&apos;re being
              redirected to your dashboard…
            </p>
            <Link
              href="/dashboard"
              className="inline-block mt-4 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              Go to Dashboard →
            </Link>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4">
            <XCircle className="w-16 h-16 text-red-500 mx-auto" />
            <h2 className="text-xl font-bold text-gray-900">Verification Failed</h2>
            <p className="text-gray-600">{errorMsg}</p>
            <div className="flex gap-3 justify-center mt-4">
              <Link
                href="/dashboard/upgrade"
                className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                Try Again
              </Link>
              <Link
                href="/dashboard"
                className="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
              >
                Dashboard
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
