import { SignOutButton } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";

export default function SignOutPage() {
  // Auto-redirect to home after sign out
  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center py-12">
      <div className="bg-white rounded-2xl shadow-xl p-10 max-w-md w-full text-center">
        <div className="flex justify-center mb-6">
          <Lock className="w-12 h-12 text-blue-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Sign Out</h1>
        <p className="text-gray-600 mb-8">
          Are you sure you want to sign out of your account?
        </p>
        <SignOutButton redirectUrl="/">
          <button className="w-full px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium mb-3">
            Yes, Sign Out
          </button>
        </SignOutButton>
        <a
          href="/dashboard"
          className="block w-full px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
        >
          Cancel
        </a>
      </div>
    </main>
  );
}
