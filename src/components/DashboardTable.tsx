"use client";

import { useState } from "react";
import Link from "next/link";
import { Clock, Download, FileText, Key, Shield, Trash2, Wifi } from "lucide-react";
import { differenceInDays, format } from "date-fns";

type Domain = {
  id: string;
  domainName: string;
  autoRenewEnabled: boolean;
  challengeToken: string | null;
  bridgeSecret: string | null;
};

type Certificate = {
  expiryDate: Date;
} | null;

type DomainRow = {
  domain: Domain;
  certificate: Certificate;
};

export default function DashboardTable({
  domains,
  userTier,
  onDomainDeleted,
}: {
  domains: DomainRow[];
  userTier: string;
  onDomainDeleted?: () => void;
}) {
  const [viewingCert, setViewingCert] = useState<{
    type: string;
    content: string;
    filename: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [downloadingBridge, setDownloadingBridge] = useState<string | null>(null);
  const [showBridgeInstructions, setShowBridgeInstructions] = useState<string | null>(null); // domainName

  const isBridgeTier = userTier === "pro" || userTier === "lifetime";

  async function viewCertificate(domainId: string, type: "key" | "crt" | "cabundle") {
    setLoading(true);
    try {
      const res = await fetch(`/api/ssl/certificate/${domainId}?type=${type}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setViewingCert({ type: type.toUpperCase(), content: data.content, filename: data.filename });
    } catch (err: any) {
      alert(err.message || "Failed to load certificate");
    } finally {
      setLoading(false);
    }
  }

  function downloadCert() {
    if (!viewingCert) return;
    const blob = new Blob([viewingCert.content], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = viewingCert.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function copyToClipboard() {
    if (!viewingCert) return;
    navigator.clipboard.writeText(viewingCert.content);
    alert("Copied to clipboard!");
  }

  async function deletePendingDomain(domainId: string, domainName: string) {
    if (!confirm(`Delete pending domain "${domainName}"? This action cannot be undone.`)) return;
    setDeleting(domainId);
    try {
      const res = await fetch(`/api/domains/${domainId}/delete`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      alert("Pending domain deleted successfully");
      if (onDomainDeleted) onDomainDeleted();
    } catch (err: any) {
      alert(err.message || "Failed to delete domain");
    } finally {
      setDeleting(null);
    }
  }

  async function downloadBridgeFile(domainId: string, domainName: string, filename: string, endpoint: string) {
    setDownloadingBridge(domainId);
    try {
      const res = await fetch(`/api/bridge/${endpoint}?domainId=${domainId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to download");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      // Show instructions after download
      setShowBridgeInstructions(domainName);
    } catch (err: any) {
      alert(err.message || "Failed to download bridge file");
    } finally {
      setDownloadingBridge(null);
    }
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Domain</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expires</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Auto-Renew</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {domains.map(({ domain, certificate }) => {
              const daysRemaining = certificate
                ? differenceInDays(new Date(certificate.expiryDate), new Date())
                : 0;
              const isExpiring = daysRemaining < 30;
              const hasIncompleteChallenge = !certificate && domain.challengeToken;
              const showBridge = isBridgeTier && domain.autoRenewEnabled && certificate;

              return (
                <tr key={domain.id}>
                  {/* Domain */}
                  <td className="px-6 py-4">
                    {hasIncompleteChallenge ? (
                      <Link
                        href={`/dashboard/generate?domainId=${domain.id}`}
                        className="font-medium text-blue-600 hover:text-blue-700 underline"
                      >
                        {domain.domainName}
                        <span className="ml-2 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                          Pending
                        </span>
                      </Link>
                    ) : (
                      <div className="font-medium text-gray-900">{domain.domainName}</div>
                    )}
                  </td>

                  {/* Status */}
                  <td className="px-6 py-4">
                    {certificate ? (
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        daysRemaining < 0
                          ? "bg-red-100 text-red-800"
                          : isExpiring
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-green-100 text-green-800"
                      }`}>
                        {daysRemaining < 0 ? "Expired" : "Active"}
                      </span>
                    ) : (
                      <span className="text-gray-500 text-sm">
                        {hasIncompleteChallenge ? "Verification pending" : "No cert"}
                      </span>
                    )}
                  </td>

                  {/* Expires */}
                  <td className="px-6 py-4">
                    {certificate ? (
                      <div>
                        <div className="text-sm text-gray-900">
                          {format(new Date(certificate.expiryDate), "MMM d, yyyy")}
                        </div>
                        <div className="text-xs text-gray-500">{daysRemaining} days remaining</div>
                      </div>
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                  </td>

                  {/* Auto-Renew */}
                  <td className="px-6 py-4">
                    {userTier !== "free" || domain.autoRenewEnabled ? (
                      <span className="inline-flex items-center gap-1 text-sm text-green-600">
                        <Clock className="w-4 h-4" />
                        Auto
                      </span>
                    ) : (
                      <span className="text-sm text-gray-500">Manual</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-6 py-4">
                    {certificate ? (
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => viewCertificate(domain.id, "crt")}
                          disabled={loading}
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
                        >
                          <FileText className="w-3 h-3" />
                          CRT
                        </button>
                        <button
                          onClick={() => viewCertificate(domain.id, "key")}
                          disabled={loading}
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
                        >
                          <Key className="w-3 h-3" />
                          KEY
                        </button>
                        <button
                          onClick={() => viewCertificate(domain.id, "cabundle")}
                          disabled={loading}
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
                        >
                          <Shield className="w-3 h-3" />
                          CABUNDLE
                        </button>

                        {/* Bridge Files — only for Pro/Lifetime with autoRenew enabled */}
                        {showBridge && (
                          <div className="mt-2 pt-2 border-t border-gray-100 flex flex-col gap-1">
                            <span className="text-xs text-gray-400 font-medium flex items-center gap-1">
                              <Wifi className="w-3 h-3" /> Bridge Files
                            </span>
                            <button
                              onClick={() => downloadBridgeFile(domain.id, domain.domainName, "bridge.php", "download")}
                              disabled={downloadingBridge === domain.id}
                              className="inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 disabled:opacity-50"
                            >
                              <Download className="w-3 h-3" />
                              bridge.php
                            </button>
                            <button
                              onClick={() => downloadBridgeFile(domain.id, domain.domainName, ".htaccess", "htaccess")}
                              disabled={downloadingBridge === domain.id}
                              className="inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 disabled:opacity-50"
                            >
                              <Download className="w-3 h-3" />
                              .htaccess
                            </button>
                          </div>
                        )}
                      </div>
                    ) : hasIncompleteChallenge ? (
                      <div className="flex flex-col gap-1">
                        <Link
                          href={`/dashboard/generate?domainId=${domain.id}`}
                          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                        >
                          Complete Verification →
                        </Link>
                        <button
                          onClick={() => deletePendingDomain(domain.id, domain.domainName)}
                          disabled={deleting === domain.id}
                          className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete
                        </button>
                      </div>
                    ) : (
                      <span className="text-gray-400 text-sm">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Bridge Installation Instructions Modal */}
      {showBridgeInstructions && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col">
            <div className="p-6 border-b flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Bridge Installation Instructions</h3>
              <button onClick={() => setShowBridgeInstructions(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-6 space-y-5">
              <p className="text-sm text-gray-600">
                Upload both files to your hosting server for <strong>{showBridgeInstructions}</strong> to enable automatic SSL renewal.
              </p>

              <div className="space-y-3">
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm font-semibold text-blue-800 mb-1">📄 bridge.php</p>
                  <p className="text-xs text-blue-700 mb-2">Upload to:</p>
                  <code className="block bg-white border border-blue-200 text-blue-900 text-xs px-3 py-2 rounded">
                    public_html/.well-known/acme-challenge/bridge.php
                  </code>
                </div>

                <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                  <p className="text-sm font-semibold text-purple-800 mb-1">⚙️ .htaccess</p>
                  <p className="text-xs text-purple-700 mb-2">Upload to:</p>
                  <code className="block bg-white border border-purple-200 text-purple-900 text-xs px-3 py-2 rounded">
                    public_html/.well-known/acme-challenge/.htaccess
                  </code>
                  <p className="text-xs text-purple-600 mt-2">⚠️ Note: The filename starts with a dot. Make sure your FTP client shows hidden files.</p>
                </div>
              </div>

              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm font-semibold text-green-800 mb-1">✅ How to enable hidden files in cPanel File Manager</p>
                <ol className="text-xs text-green-700 space-y-1 list-decimal list-inside">
                  <li>Open File Manager in cPanel</li>
                  <li>Click <strong>Settings</strong> (top right)</li>
                  <li>Check <strong>Show Hidden Files</strong></li>
                  <li>Click Save</li>
                </ol>
              </div>

              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm font-semibold text-yellow-800 mb-1">🔒 Important</p>
                <p className="text-xs text-yellow-700">
                  Keep <strong>bridge.php</strong> private — it contains your unique bridge secret. 
                  Once uploaded, your certificate will renew automatically every 90 days. 
                  You will receive an email with the new certificate files when renewal completes.
                </p>
              </div>
            </div>
            <div className="p-6 border-t">
              <button
                onClick={() => setShowBridgeInstructions(null)}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                Got it!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Certificate Viewer Modal */}
      {viewingCert && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">{viewingCert.type} File</h3>
              <button onClick={() => setViewingCert(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-6 overflow-auto flex-1">
              <pre className="bg-gray-50 p-4 rounded border text-xs overflow-x-auto">
                {viewingCert.content}
              </pre>
            </div>
            <div className="p-6 border-t flex gap-3">
              <button
                onClick={copyToClipboard}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
              >
                Copy to Clipboard
              </button>
              <button
                onClick={downloadCert}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download {viewingCert.filename}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
