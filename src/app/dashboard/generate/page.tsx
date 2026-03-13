"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Lock,
  ArrowLeft,
  CheckCircle,
  Copy,
  ExternalLink,
  Loader2,
  Download,
  Globe,
} from "lucide-react";

interface ChallengeInfo {
  domain: string;
  token: string;
  keyAuthorization: string;
  filePath: string;
  fileContent: string;
}

export default function GeneratePage() {
  const searchParams = useSearchParams();
  const domainIdParam = searchParams.get("domainId");

  const [step, setStep] = useState<"form" | "challenge" | "generating" | "done">("form");
  const [domain, setDomain] = useState("");
  const [email, setEmail] = useState("");
  const [useBridge, setUseBridge] = useState(false);
  const [includeWww, setIncludeWww] = useState(false);
  const [challenges, setChallenges] = useState<ChallengeInfo[]>([]);
  const [result, setResult] = useState<{
    domainId: string;
    expiryDate: string;
    certificateZip: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [autoLoading, setAutoLoading] = useState(!!domainIdParam);
  const [copied, setCopied] = useState<string | null>(null);

  // When arriving via "Complete Verification" link, pre-fill form
  useEffect(() => {
    if (!domainIdParam) return;

    fetch(`/api/domains/${domainIdParam}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.domain) return;
        setDomain(data.domain.domainName);
        setEmail(data.userEmail || "");
        setIncludeWww(data.includeWww === true);
        setAutoLoading(false);
      })
      .catch(() => setAutoLoading(false));
  }, [domainIdParam]);

  const [domainId, setDomainId] = useState<string | null>(null);

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleVerifyDomain(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 55000);

      const res = await fetch("/api/ssl/challenge/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, email, includeWww }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create challenge");

      setDomainId(data.domainId);
      setChallenges(data.challenges);
      setStep("challenge");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyFiles() {
    setVerifying(true);
    setVerifyError(null);
    setVerified(false);

    try {
      const res = await fetch("/api/ssl/challenge/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainId }),
      });

      const data = await res.json();
      if (!res.ok) {
        const details = data.details
          ? data.details.map((d: any) => `${d.domain}: ${d.error}`).join("\n")
          : data.error;
        setVerifyError(details);
      } else {
        setVerified(true);
      }
    } catch (err: any) {
      setVerifyError("Network error — please try again");
    } finally {
      setVerifying(false);
    }
  }

  async function handleGenerateSSL() {
    setLoading(true);
    setError(null);
    setStep("generating");

    try {
      const res = await fetch("/api/ssl/challenge/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainId, email }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate SSL certificate");

      setResult({ domainId: data.domainId, expiryDate: data.expiryDate, certificateZip: data.certificateZip });
      setStep("done");
    } catch (err: any) {
      setError(err.message);
      setStep("challenge");
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  /** Download the raw verification file — filename = token (what LE expects) */
  function downloadChallengeFile(ch: ChallengeInfo) {
    const blob = new Blob([ch.fileContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = ch.token;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadZip() {
    if (!result?.certificateZip) return;
    const binary = atob(result.certificateZip);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${domain}-ssl-certificates.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Step indicator ─────────────────────────────────────────────────────────

  const STEPS = ["form", "challenge", "generating", "done"] as const;
  const stepIndex = STEPS.indexOf(step);

  // ── Derived label for www checkbox ─────────────────────────────────────────

  const wwwLabel = (() => {
    if (!domain) return "Also cover www and non-www versions";
    const apex = domain.startsWith("www.") ? domain.slice(4) : domain;
    const www = `www.${apex}`;
    return `Also cover ${apex} & ${www}`;
  })();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/dashboard" className="text-gray-600 hover:text-gray-900">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2">
            <Lock className="w-6 h-6 text-blue-600" />
            <h1 className="text-xl font-bold">Generate SSL Certificate</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl">

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  step === s
                    ? "bg-blue-600 text-white"
                    : stepIndex > i
                    ? "bg-green-500 text-white"
                    : "bg-gray-200 text-gray-500"
                }`}
              >
                {stepIndex > i ? <CheckCircle className="w-4 h-4" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && <div className="h-px bg-gray-200 w-8" />}
            </div>
          ))}
        </div>

        {/* ── FORM ── */}
        {step === "form" && (
          <div className="bg-white rounded-xl shadow p-6">
            {autoLoading ? (
              <div className="py-12 text-center">
                <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto mb-3" />
                <p className="text-gray-600">Loading domain details...</p>
              </div>
            ) : (
            <>
            <h2 className="text-xl font-bold mb-2">Enter Domain Details</h2>
            <p className="text-gray-600 mb-6">
              We&apos;ll create a verification challenge for your domain.
            </p>

            <form onSubmit={handleVerifyDomain} className="space-y-4">
              {/* Domain */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Domain Name
                </label>
                <input
                  type="text"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value.toLowerCase().trim())}
                  placeholder="example.com"
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />

                {/* www / non-www checkbox — sits directly under the domain field */}
                <label className="flex items-center gap-2 mt-2 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={includeWww}
                    onChange={(e) => setIncludeWww(e.target.checked)}
                    className="w-4 h-4 rounded accent-blue-600"
                  />
                  <span className="text-sm text-gray-600 flex items-center gap-1.5 group-hover:text-gray-800">
                    <Globe className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                    {wwwLabel}
                  </span>
                </label>
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              {/* Bridge */}
              <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg">
                <input
                  type="checkbox"
                  id="useBridge"
                  checked={useBridge}
                  onChange={(e) => setUseBridge(e.target.checked)}
                  className="mt-0.5"
                />
                <label htmlFor="useBridge" className="text-sm text-blue-800">
                  <span className="font-medium">Enable Bridge Protocol</span>{" "}
                  <span className="text-blue-600">(Pro / Lifetime)</span>
                  <br />
                  Automatically renew certificates without manual intervention.
                </label>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating Challenge...
                  </>
                ) : (
                  "Verify Domain →"
                )}
              </button>
            </form>
            </>
            )}
          </div>
        )}

        {/* ── CHALLENGE ── */}
        {step === "challenge" && challenges.length > 0 && (
          <div className="bg-white rounded-xl shadow p-6 space-y-6">
            <div>
              <h2 className="text-xl font-bold mb-2">Verify Domain Ownership</h2>
              <p className="text-gray-600">
                Upload{" "}
                {challenges.length > 1
                  ? `these ${challenges.length} verification files`
                  : "this verification file"}{" "}
                to your web server to prove you own{" "}
                <strong>
                  {challenges.map((c) => c.domain).join(" and ")}
                </strong>
                .
              </p>
            </div>

            {challenges.map((ch, idx) => (
              <div key={ch.token} className="border rounded-xl p-4 space-y-3 bg-gray-50">
                {challenges.length > 1 && (
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Challenge {idx + 1} — {ch.domain}
                  </p>
                )}

                {/* File path */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                    File Path
                  </label>
                  <div className="flex items-center gap-2 p-3 bg-white border rounded-lg font-mono text-sm">
                    <span className="flex-1 break-all text-gray-700">{ch.filePath}</span>
                    <button
                      onClick={() => copyToClipboard(ch.filePath, `path-${idx}`)}
                      className="text-blue-600 hover:text-blue-700 flex-shrink-0"
                    >
                      {copied === `path-${idx}` ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* File content */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                    File Content
                  </label>
                  <div className="flex items-center gap-2 p-3 bg-white border rounded-lg font-mono text-sm">
                    <span className="flex-1 break-all text-gray-700">{ch.fileContent}</span>
                    <button
                      onClick={() => copyToClipboard(ch.fileContent, `content-${idx}`)}
                      className="text-blue-600 hover:text-blue-700 flex-shrink-0"
                    >
                      {copied === `content-${idx}` ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Download button */}
                <button
                  onClick={() => downloadChallengeFile(ch)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download Verification File
                </button>
                <p className="text-xs text-gray-500 text-center -mt-1">
                  Upload to{" "}
                  <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">
                    public_html/.well-known/acme-challenge/
                  </code>
                </p>
              </div>
            ))}

            {/* Instructions */}
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg space-y-2">
              <p className="text-sm font-semibold text-yellow-800">
                Steps to complete:
              </p>
              <ol className="text-sm text-yellow-700 space-y-1.5 list-decimal list-inside">
                <li>
                  Download and upload{" "}
                  {challenges.length > 1 ? "each verification file" : "the verification file"}{" "}
                  to{" "}
                  <code className="bg-yellow-100 px-1 rounded">
                    public_html/.well-known/acme-challenge/
                  </code>
                </li>
                <li>
                  Click <strong>Verify Files</strong> — we&apos;ll confirm{" "}
                  {challenges.map((ch, i) => (
                    <span key={ch.token}>
                      {i > 0 && i < challenges.length - 1 && ", "}
                      {i > 0 && i === challenges.length - 1 && " and "}
                      <a
                        href={`http://${ch.domain}${ch.filePath}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline inline-flex items-center gap-0.5 font-medium"
                      >
                        {ch.domain}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </span>
                  ))}{" "}
                  {challenges.length > 1 ? "are" : "is"} accessible
                </li>
                <li>Once verified, click <strong>Generate SSL Certificate</strong></li>
              </ol>
            </div>

            {/* Verify Files button */}
            {!verified && (
              <button
                onClick={handleVerifyFiles}
                disabled={verifying}
                className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {verifying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Checking files...
                  </>
                ) : (
                  "Verify Files →"
                )}
              </button>
            )}

            {/* Verify error */}
            {verifyError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm whitespace-pre-line">
                <p className="font-medium mb-1">Verification failed:</p>
                {verifyError}
              </div>
            )}

            {/* Verified success message */}
            {verified && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm flex items-center gap-2">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                Files verified! Let&apos;s Encrypt can reach your domain. You can now generate your certificate.
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            {/* Generate SSL — only enabled after verification */}
            <button
              onClick={handleGenerateSSL}
              disabled={!verified || loading}
              className="w-full py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                "Generate SSL Certificate →"
              )}
            </button>
          </div>
        )}

        {/* ── GENERATING ── */}
        {step === "generating" && (
          <div className="bg-white rounded-xl shadow p-12 text-center">
            <Loader2 className="w-16 h-16 text-blue-600 animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Generating Your Certificate</h2>
            <p className="text-gray-600">
              Let&apos;s Encrypt is validating your domain and issuing the certificate.
              This may take up to 60 seconds...
            </p>
          </div>
        )}

        {/* ── DONE ── */}
        {step === "done" && result && (
          <div className="bg-white rounded-xl shadow p-6 text-center space-y-6">
            <div>
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                SSL Certificate Generated!
              </h2>
              <p className="text-gray-600">
                Your certificate for{" "}
                <strong>
                  {includeWww
                    ? (() => {
                        const apex = domain.startsWith("www.") ? domain.slice(4) : domain;
                        return `${apex} & www.${apex}`;
                      })()
                    : domain}
                </strong>{" "}
                is ready. It expires on{" "}
                <strong>{new Date(result.expiryDate).toLocaleDateString()}</strong>.
              </p>
            </div>

            <button
              onClick={downloadZip}
              className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download Certificates (.zip)
            </button>

            <Link
              href="/dashboard"
              className="block text-blue-600 hover:text-blue-700 font-medium"
            >
              ← Back to Dashboard
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
