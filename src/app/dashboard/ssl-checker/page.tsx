import Link from "next/link";
import { Lock, ArrowLeft, ShieldCheck } from "lucide-react";
import SslChecker from "@/components/SslChecker";

export default function SslCheckerPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/dashboard" className="text-gray-600 hover:text-gray-900">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2">
            <Lock className="w-6 h-6 text-blue-600" />
            <h1 className="text-xl font-bold">EasySSL Dashboard</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-10 max-w-3xl">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 mb-4">
            <ShieldCheck className="w-6 h-6 text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">SSL Certificate Checker</h2>
          <p className="text-gray-500">
            Instantly check the SSL status of any website — expiry date, issuer, validity, and more.
          </p>
        </div>

        <SslChecker />
      </main>
    </div>
  );
}
