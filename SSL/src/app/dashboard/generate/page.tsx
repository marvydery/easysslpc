"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Lock,
  Globe,
  Mail,
  CheckCircle,
  XCircle,
  Loader2,
  Download,
  ArrowLeft,
  Copy,
  Check,
  Server,
  Network,
} from "lucide-react";

type Step = "form" | "challenge" | "verifying" | "verified" | "generating" | "done" | "error";
type ValidationMethod = "http-01";

function GenerateContent() {
  const searchParams = useSearchParams();
  const domainId = searchParams.get("domainId");
  
  const [step, setStep] = useState<Step>("form");
  const [domain, setDomain] = useState("");
  const [email, setEmail] = useState("");
  const [validationMethod] = useState<ValidationMethod>("http-01");
  const [challengeData, setChallengeData] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [result, setResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [includeWww, setIncludeWww] = useState(true);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Load existing domain data if domainId is provided
  useEffect(() => {
    if (domainId) {
      setLoading(true);
      fetch(`/api/ssl/domain/${domainId}`)
        .then(res => res.json())
        .then(data => {
          if (data.domain) {
            setDomain(data.domain.domainName);
            setEmail(data.email || "");
            
            // Set up challenge data
            setChallengeData({
              domainId: data.domain.id,
              challengeToken: data.domain.challengeToken,
              challengeValue: data.domain.challengeValue,
              validationMethod: data.domain.validationMethod,
              instructions: data.instructions,
              verificationUrl: data.domain.validationMethod === "http-01" 
                ? `http://${data.domain.domainName}/.well-known/acme-challenge/${data.domain.challengeToken}`
                : undefined,
            });
            
            // Skip to challenge step
            setStep("challenge");
          }
        })
        .catch(err => {
          console.error("Failed to load domain:", err);
          setErrorMsg("Failed to load domain data");
          setStep("error");
        })
        .finally(() => setLoading(false));
    }
  }, [domainId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStep("challenge");
    setErrorMsg("");
    setChallengeData(null);

    try {
      const res = await fetch("/api/ssl/challenge/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          domain, 
          email, 
          validationMethod: "http-01"
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create challenge");
      }

      setChallengeData(data);
    } catch (err: any) {
      setErrorMsg(err.message);
      setStep("error");
    }
  }

  async function handleVerify() {
    setStep("verifying");
    setErrorMsg("");

    try {
      const res = await fetch("/api/ssl/challenge/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainId: challengeData.domainId, email }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.details || "Failed to verify domain");
      }

      setStep("verified");
    } catch (err: any) {
      console.error("Verification error:", err);
      setErrorMsg(err.message || "Failed to verify domain. Please ensure your DNS/HTTP challenge is properly set up and try again.");
      setStep("error");
    }
  }

  async function handleGenerate() {
    if (!agreedToTerms) {
      setErrorMsg("Please agree to the Let's Encrypt Terms of Service");
      return;
    }

    setStep("generating");
    setErrorMsg("");

    try {
      const res = await fetch("/api/ssl/challenge/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          domainId: challengeData.domainId, 
          email,
          includeWww 
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.details || "Failed to generate certificate");
      }

      setResult(data);
      setStep("done");
    } catch (err: any) {
      console.error("Generation error:", err);
      setErrorMsg(err.message || "Failed to generate certificate.");
      setStep("error");
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function downloadZip() {
    if (!result) return;
    const blob = new Blob(
      [Uint8Array.from(atob(result.certificateZip), (c) => c.charCodeAt(0))],
      { type: "application/zip" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${result.domainName}-ssl.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <Lock className="w-5 h-5 text-blue-600" />
            <span className="font-semibold">EasySSL</span>
          </Link>
          <span className="text-gray-400">/</span>
          <span className="text-gray-900 font-medium">Generate Certificate</span>
        </div>
      </header>

      <main className="container mx-auto px-4 py-10 max-w-3xl">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>

        {/* Loading state for resuming */}
        {loading && (
          <div className="bg-white rounded-2xl shadow p-12 text-center">
            <Loader2 className="w-14 h-14 text-blue-600 animate-spin mx-auto mb-6" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Loading Domain...
            </h2>
            <p className="text-gray-500">
              Preparing your HTTP-01 ACME challenge
            </p>
          </div>
        )}

        {/* ─── STEP 1: FORM ─── */}
        {step === "form" && !loading && (
          <div className="bg-white rounded-2xl shadow p-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Generate SSL Certificate
            </h1>
            <p className="text-gray-500 mb-8">
              Free Let's Encrypt certificate with HTTP-01 ACME verification
            </p>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Domain Name
                </label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value.trim())}
                    placeholder="yourdomain.com"
                    required
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value.trim())}
                    placeholder="you@example.com"
                    required
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 px-6 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition text-lg"
              >
                Continue →
              </button>
            </form>
          </div>
        )}

        {/* ─── STEP 2: CHALLENGE INSTRUCTIONS (with loading state) ─── */}
        {step === "challenge" && !challengeData && (
          <div className="bg-white rounded-2xl shadow p-12 text-center">
            <Loader2 className="w-14 h-14 text-blue-600 animate-spin mx-auto mb-6" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Generating Challenge...
            </h2>
            <p className="text-gray-500">
              Creating your HTTP-01 ACME verification challenge. This takes 10-20 seconds.
            </p>
          </div>
        )}

        {step === "challenge" && challengeData && (
          <div className="bg-white rounded-2xl shadow p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {challengeData.instructions.type}
            </h2>
            <p className="text-gray-500 mb-6">
              Complete these steps to verify ownership of <strong>{domain}</strong>
            </p>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
              <h3 className="font-bold text-blue-900 mb-4 text-lg">
                Step 1: Download Verification File
              </h3>
              <button
                onClick={() => {
                  const blob = new Blob([challengeData.challengeValue], { type: "text/plain" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = challengeData.challengeToken;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-lg shadow-md"
              >
                <Download className="w-6 h-6" />
                Download Verification File ({challengeData.challengeToken?.substring(0, 15)}...)
              </button>
              
              <div className="mt-4 p-4 bg-white rounded border border-blue-200">
                <p className="text-sm text-gray-700 mb-2">
                  <strong className="text-blue-900">File to download:</strong>
                </p>
                <code className="block text-xs text-gray-600 break-all mb-3">
                  {challengeData.challengeToken}
                </code>
                <p className="text-sm text-gray-700 mb-2">
                  <strong className="text-blue-900">After downloading, upload it to:</strong>
                </p>
                <code className="block text-xs font-mono bg-gray-50 px-3 py-2 rounded text-gray-800">
                  yourdomain.com/.well-known/acme-challenge/{challengeData.challengeToken}
                </code>
                
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <p className="text-sm text-gray-700 mb-2">
                    <strong className="text-blue-900">Test your upload:</strong>
                  </p>
                  <a
                    href={challengeData.verificationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 text-sm underline"
                  >
                    Open verification URL in new tab →
                  </a>
                  <p className="text-xs text-gray-500 mt-1">
                    You should see the file content when you click this link
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-6 mb-6">
              <h3 className="font-bold text-gray-900 mb-4 text-lg">
                Step 2: Upload to Your Server
              </h3>
              <ol className="space-y-3 text-sm text-gray-700">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
                  <span>Click the blue button above to download the verification file</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
                  <span>Upload it to your server via cPanel, FTP, or your hosting control panel</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
                  <span>Create the folder <code className="px-1.5 py-0.5 bg-gray-200 rounded text-xs">.well-known/acme-challenge/</code> if it doesn't exist</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">4</span>
                  <span>Click the "Test your upload" link above to verify the file is accessible</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-bold">5</span>
                  <span><strong>When you can see the file content in your browser, click "Verify Domain Ownership" below</strong></span>
                </li>
              </ol>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep("form")}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50"
              >
                Start Over
              </button>
              <button
                onClick={handleVerify}
                className="flex-1 py-3 px-6 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700"
              >
                Verify Domain Ownership →
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 4: VERIFYING ─── */}
        {step === "verifying" && (
          <div className="bg-white rounded-2xl shadow p-12 text-center">
            <Loader2 className="w-14 h-14 text-blue-600 animate-spin mx-auto mb-6" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Verifying Domain Ownership...
            </h2>
            <p className="text-gray-500 mb-4">
              Let's Encrypt is checking your HTTP-01 challenge file.
            </p>
            <p className="text-sm text-gray-400">
              This may take 1-3 minutes. Please don't close this window.
            </p>
          </div>
        )}

        {/* ─── STEP 5: VERIFIED ─── */}
        {step === "verified" && (
          <div className="bg-white rounded-2xl shadow p-8 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Domain Verified! ✓
            </h2>
            <p className="text-gray-600 mb-2">
              Let's Encrypt has verified your ownership of <strong>{domain}</strong>.
            </p>
            <p className="text-sm text-gray-500 mb-8">
              You can now proceed to generate your SSL certificate.
            </p>

            <div className="space-y-4">
              {/* WWW Option */}
              <div className="bg-white p-4 rounded-lg border">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeWww}
                    onChange={(e) => setIncludeWww(e.target.checked)}
                    className="mt-1 w-4 h-4 text-blue-600"
                  />
                  <div>
                    <div className="font-medium text-gray-900">Include WWW version</div>
                    <div className="text-sm text-gray-600">
                      Certificate will be valid for both {domain} and www.{domain}
                    </div>
                  </div>
                </label>
              </div>

              {/* Terms & Conditions */}
              <div className="bg-white p-4 rounded-lg border">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    className="mt-1 w-4 h-4 text-blue-600"
                    required
                  />
                  <div>
                    <div className="font-medium text-gray-900">I agree to the Let's Encrypt Terms of Service</div>
                    <div className="text-sm text-gray-600">
                      By checking this box, you agree to the{" "}
                      <a
                        href="https://letsencrypt.org/documents/LE-SA-v1.4-April-3-2024.pdf"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 underline"
                      >
                        Let's Encrypt Subscriber Agreement
                      </a>
                    </div>
                  </div>
                </label>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => setStep("challenge")}
                  className="px-6 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50"
                >
                  ← Back
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={!agreedToTerms}
                  className={`flex-1 py-3 px-6 rounded-xl font-bold ${
                    agreedToTerms
                      ? "bg-green-600 text-white hover:bg-green-700"
                      : "bg-gray-300 text-gray-500 cursor-not-allowed"
                  }`}
                >
                  Generate SSL Certificate →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── STEP 6: GENERATING ─── */}
        {step === "generating" && (
          <div className="bg-white rounded-2xl shadow p-12 text-center">
            <Loader2 className="w-14 h-14 text-green-600 animate-spin mx-auto mb-6" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Generating SSL Certificate...
            </h2>
            <p className="text-gray-500 mb-4">
              Creating your SSL certificate from Let's Encrypt.
            </p>
            <p className="text-sm text-gray-400">
              This will only take 10-30 seconds.
            </p>
          </div>
        )}

        {/* ─── STEP 7: DONE ─── */}
        {step === "done" && result && (
          <div className="bg-white rounded-2xl shadow p-8 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Certificate Ready!
            </h2>
            <p className="text-gray-500 mb-2">
              SSL certificate for <strong>{result.domainName}</strong> has been issued.
            </p>
            <p className="text-sm text-gray-400 mb-8">
              Expires: {new Date(result.expiryDate).toLocaleDateString()}
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={downloadZip}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700"
              >
                <Download className="w-5 h-5" />
                Download Certificate ZIP
              </button>
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50"
              >
                Go to Dashboard
              </Link>
            </div>
          </div>
        )}

        {/* ─── ERROR ─── */}
        {step === "error" && (
          <div className="bg-white rounded-2xl shadow p-8 text-center">
            <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {validationMethod ? "Verification Failed" : "Error"}
            </h2>
            <p className="text-gray-600 mb-8">{errorMsg}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => {
                  setStep(challengeData ? "challenge" : "form");
                  setErrorMsg("");
                }}
                className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700"
              >
                {challengeData ? "Try Again" : "Start Over"}
              </button>
              <Link
                href="/dashboard"
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50"
              >
                Dashboard
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function GeneratePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
      </div>
    }>
      <GenerateContent />
    </Suspense>
  );
}
