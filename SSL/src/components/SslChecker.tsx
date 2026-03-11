"use client";

import { useState } from "react";
import {
  Search,
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  Clock,
  Calendar,
  Globe,
  Building2,
  Fingerprint,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface CertInfo {
  domain: string;
  valid: boolean;
  subject: { CN?: string; O?: string; C?: string };
  issuer: { CN?: string; O?: string; C?: string };
  validFrom: string;
  validTo: string;
  daysRemaining: number;
  serialNumber: string;
  fingerprint: string;
  subjectAltNames: string[];
}

function StatusBadge({ daysRemaining, valid }: { daysRemaining: number; valid: boolean }) {
  if (!valid || daysRemaining < 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-full font-semibold">
        <ShieldX className="w-5 h-5" />
        {daysRemaining < 0 ? "Expired" : "Invalid Certificate"}
      </div>
    );
  }
  if (daysRemaining < 30) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-yellow-100 text-yellow-700 rounded-full font-semibold">
        <AlertTriangle className="w-5 h-5" />
        Expiring Soon
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-full font-semibold">
      <ShieldCheck className="w-5 h-5" />
      Valid & Secure
    </div>
  );
}

export default function SslChecker() {
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CertInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const handleCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domain.trim()) return;

    setLoading(true);
    setResult(null);
    setError(null);
    setShowDetails(false);

    try {
      const res = await fetch("/api/ssl/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domain.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to check SSL certificate");
      } else {
        setResult(data);
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  const daysColor =
    result && result.daysRemaining < 0
      ? "text-red-600"
      : result && result.daysRemaining < 30
      ? "text-yellow-600"
      : "text-green-600";

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Search Form */}
      <form onSubmit={handleCheck} className="flex gap-3">
        <div className="flex-1 relative">
          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="e.g. github.com or https://example.com"
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
            disabled={loading}
          />
        </div>
        <button
          type="submit"
          disabled={loading || !domain.trim()}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
          {loading ? "Checking…" : "Check SSL"}
        </button>
      </form>

      {/* Error State */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <ShieldX className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium text-red-800">Could not retrieve certificate</p>
            <p className="text-sm text-red-600 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="mt-4 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          {/* Top Summary Bar */}
          <div className="p-5 flex items-center justify-between border-b border-gray-100">
            <div>
              <p className="text-sm text-gray-500 mb-1">Checked domain</p>
              <p className="font-semibold text-gray-900 text-lg">{result.domain}</p>
            </div>
            <StatusBadge daysRemaining={result.daysRemaining} valid={result.valid} />
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
            <div className="p-4 text-center">
              <p className="text-xs text-gray-500 mb-1 flex items-center justify-center gap-1">
                <Clock className="w-3 h-3" /> Days Remaining
              </p>
              <p className={`text-2xl font-bold ${daysColor}`}>
                {result.daysRemaining < 0 ? "0" : result.daysRemaining}
              </p>
            </div>
            <div className="p-4 text-center">
              <p className="text-xs text-gray-500 mb-1 flex items-center justify-center gap-1">
                <Calendar className="w-3 h-3" /> Valid From
              </p>
              <p className="text-sm font-medium text-gray-700">{formatDate(result.validFrom)}</p>
            </div>
            <div className="p-4 text-center">
              <p className="text-xs text-gray-500 mb-1 flex items-center justify-center gap-1">
                <Calendar className="w-3 h-3" /> Expires On
              </p>
              <p className="text-sm font-medium text-gray-700">{formatDate(result.validTo)}</p>
            </div>
          </div>

          {/* Issuer / Subject */}
          <div className="p-5 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                <Building2 className="w-3 h-3" /> Issued To
              </p>
              <p className="text-sm font-medium text-gray-800">
                {result.subject.CN || result.domain}
              </p>
              {result.subject.O && (
                <p className="text-xs text-gray-500">{result.subject.O}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Issued By
              </p>
              <p className="text-sm font-medium text-gray-800">
                {result.issuer.CN || "Unknown CA"}
              </p>
              {result.issuer.O && (
                <p className="text-xs text-gray-500">{result.issuer.O}</p>
              )}
            </div>
          </div>

          {/* Expandable Technical Details */}
          <div className="border-t border-gray-100">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="w-full px-5 py-3 flex items-center justify-between text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <span className="font-medium">Technical Details</span>
              {showDetails ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>

            {showDetails && (
              <div className="px-5 pb-5 space-y-3 bg-gray-50">
                {result.subjectAltNames.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Subject Alternative Names</p>
                    <div className="flex flex-wrap gap-1">
                      {result.subjectAltNames.map((san) => (
                        <span
                          key={san}
                          className="inline-block px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-mono"
                        >
                          {san}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                    <Fingerprint className="w-3 h-3" /> SHA-1 Fingerprint
                  </p>
                  <p className="text-xs font-mono text-gray-700 break-all bg-white p-2 rounded border border-gray-200">
                    {result.fingerprint}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500 mb-1">Serial Number</p>
                  <p className="text-xs font-mono text-gray-700 break-all bg-white p-2 rounded border border-gray-200">
                    {result.serialNumber}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* CTA for expiring certs */}
          {result.daysRemaining < 30 && result.daysRemaining >= 0 && (
            <div className="p-4 bg-yellow-50 border-t border-yellow-100 flex items-center justify-between">
              <p className="text-sm text-yellow-800">
                ⚠️ Your certificate expires in {result.daysRemaining} days. Renew it now!
              </p>
              <a
                href="/sign-up"
                className="text-sm font-medium px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Renew with EasySSL
              </a>
            </div>
          )}

          {(result.daysRemaining < 0 || !result.valid) && (
            <div className="p-4 bg-red-50 border-t border-red-100 flex items-center justify-between">
              <p className="text-sm text-red-800">
                🚨 This certificate has expired or is invalid. Fix it immediately!
              </p>
              <a
                href="/sign-up"
                className="text-sm font-medium px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Get New Certificate
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
