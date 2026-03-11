"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Lock, ArrowLeft, CheckCircle, Copy, ExternalLink, Loader2, XCircle } from "lucide-react";

export default function GeneratePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const domainId = searchParams.get("domainId");

  const [step, setStep] = useState<"form" | "challenge" | "generating" | "done">("form");
  const [domain, setDomain] = useState("");
  const [email, setEmail] = useState("");
  const [useBridge, setUseBridge] = useState(false);
  const [challenge, setChallenge] = useState<{
    token: string;
    keyAuthorization: string;
    filePath: string;
    fileContent: string;
  } | null>(null);
  const [result, setResult] = useState<{
    domainId: string;
    expiryDate: string;
    certificateZip: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  useEffect(() => {
    if (domainId) {
      fetch(`/api/domains/${domainId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.domain) {
            setDomain(data.domain.domainName);
            setEmail(data.userEmail || "");
            if (data.domain.challengeToken && data.domain.challengeValue) {
              setChallenge({
                token: data.domain.challengeToken,
                keyAuthorization: data.domain.challengeValue,
                filePath: `/.well-known/acme-challenge/${data.domain.challengeToken}`,
                fileContent: data.domain.challengeValue,
              });
              setStep("challenge");
            }
          }
        })
        .catch(console.error);
    }
  }, [domainId]);

  async function handleVerifyDomain(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ssl/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, email, useBridge, action: "prepare" }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create challenge");
      }

      setChallenge({
        token: data.challenge.token,
        keyAuthorization: data.challenge.keyAuthorization,
        filePath: `/.well-known/acme-challenge/${data.challenge.token}`,
        fileContent: data.challenge.keyAuthorization,
      });
      setVerified(false);
      setVerifyError(null);
      setStep("challenge");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyFile() {
    if (!challenge) return;
    setVerifying(true);
    setVerifyError(null);
    setVerified(false);

    try {
      const res = await fetch("/api/ssl/challenge/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain,
          token: challenge.token,
          keyAuthorization: challenge.keyAuthorization,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setVerifyError(data.error || "Verification failed. Check the file is uploaded correctly.");
      } else {
        setVerified(true);
      }
    } catch (err: any) {
      setVerifyError("Could not reach verification endpoint: " + err.message);
    } finally {
      setVerifying(false);
    }
  }

  async function handleGenerateSSL() {
    if (!verified) return;
    setLoading(true);
    setError(null);
    setStep("generating");

    try {
      const res = await fetch("/api/ssl/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, email, useBridge, action: "finalize" }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to generate SSL certificate");
      }

      setResult({
        domainId: data.domainId,
        expiryDate: data.expiryDate,
        certificateZip: data.certificateZip,
      });
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
        <div className="flex items-center gap-2 mb-8">
          {["form", "challenge", "generating", "done"].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step === s
                    ? "bg-blue-600 text-white"
                    : ["form", "challenge", "generating", "done"].indexOf(step) > i
                    ? "bg-green-500 text-white"
                    : "bg-gray-200 text-gray-500"
                }`}
              >
                {["form", "challenge", "generating", "done"].indexOf(step) > i ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  i + 1
                )}
              </div>
              {i < 3 && <div className="flex-1 h-px bg-gray-200 w-8" />}
            </div>
          ))}
        </div>

        {step === "form" && (
          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-xl font-bold mb-2">Enter Domain Details</h2>
            <p className="text-gray-600 mb-6">
              We&apos;ll create a verification challenge for your domain.
            </p>
            <form onSubmit={handleVerifyDomain} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Domain Name</label>
                <input
                  type="text"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="example.com"
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg">
                <input
                  type="checkbox"
                  id="useBridge"
                  checked={useBridge}
                  onChange={(e) => setUseBridge(e.target.checked)}
                  className="mt-0.5"
                />
                <label htmlFor="useBridge" className="text-sm text-blue-800">
                  <span className="font-medium">Enable Bridge Protocol</span> (Pro/Lifetime)
                  <br />
                  Automatically renew certificates without manual intervention.
                </label>
              </div>
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Creating Challenge...</> : "Verify Domain →"}
              </button>
            </form>
          </div>
        )}

        {step === "challenge" && challenge && (
          <div className="bg-white rounded-xl shadow p-6 space-y-6">
            <div>
              <h2 className="text-xl font-bold mb-2">Verify Domain Ownership</h2>
              <p className="text-gray-600">
                Create this file on your web server to prove you own <strong>{domain}</strong>.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">File Path</label>
                <div className="flex items-center gap-2 p-3 bg-gray-50 border rounded-lg font-mono text-sm">
                  <span className="flex-1 break-all">{challenge.filePath}</span>
                  <button onClick={() => copyToClipboard(challenge.filePath, "path")} className="text-blue-600 hover:text-blue-700 flex-shrink-0">
                    {copied === "path" ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">File Content</label>
                <div className="flex items-center gap-2 p-3 bg-gray-50 border rounded-lg font-mono text-sm">
                  <span className="flex-1 break-all">{challenge.fileContent}</span>
                  <button onClick={() => copyToClipboard(challenge.fileContent, "content")} className="text-blue-600 hover:text-blue-700 flex-shrink-0">
                    {copied === "content" ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                <p className="font-medium mb-1">Instructions:</p>
                <ol className="list-decimal list-inside space-y-1 text-yellow-700">
                  <li>Upload the file to your server at the path above</li>
                  <li>Paste the content exactly as shown</li>
                  <li>Click <strong>Check File is Live</strong> to verify</li>
                  <li>Once verified, Generate SSL will unlock</li>
                </ol>
              </div>
            </div>

            {/* Check file button */}
            <button
              onClick={handleVerifyFile}
              disabled={verifying}
              className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {verifying ? <><Loader2 className="w-4 h-4 animate-spin" />Checking...</> : <><ExternalLink className="w-4 h-4" />Check File is Live</>}
            </button>

            {verified && (
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                File verified! You can now generate your certificate.
              </div>
            )}
            {verifyError && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {verifyError}
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
            )}

            {/* Generate SSL — locked until verified */}
            <button
              onClick={handleGenerateSSL}
              disabled={!verified || loading}
              className={`w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors ${
                verified ? "bg-green-600 text-white hover:bg-green-700" : "bg-gray-200 text-gray-400 cursor-not-allowed"
              }`}
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Generating...</>
              ) : verified ? (
                <><CheckCircle className="w-4 h-4" />Generate SSL Certificate →</>
              ) : (
                <><Lock className="w-4 h-4" />Verify File First to Unlock</>
              )}
            </button>
          </div>
        )}

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

        {step === "done" && result && (
          <div className="bg-white rounded-xl shadow p-6 text-center space-y-6">
            <div>
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">SSL Certificate Generated!</h2>
              <p className="text-gray-600">
                Your certificate for <strong>{domain}</strong> is ready. It expires on{" "}
                <strong>{new Date(result.expiryDate).toLocaleDateString()}</strong>.
              </p>
            </div>
            <button onClick={downloadZip} className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
              Download Certificates (.zip)
            </button>
            <Link href="/dashboard" className="block text-blue-600 hover:text-blue-700 font-medium">
              ← Back to Dashboard
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
