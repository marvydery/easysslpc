"use client";

import { useState } from "react";
import Link from "next/link";
import { Clock, Download, Eye, FileText, Key, Shield, Trash2 } from "lucide-react";
import { differenceInDays, format } from "date-fns";

type Domain = {
  id: string;
  domainName: string;
  autoRenewEnabled: boolean;
  challengeToken: string | null;
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

  async function viewCertificate(domainId: string, type: "key" | "crt" | "cabundle") {
    setLoading(true);
    try {
      const res = await fetch(`/api/ssl/certificate/${domainId}?type=${type}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error);
      }

      setViewingCert({
        type: type.toUpperCase(),
        content: data.content,
        filename: data.filename,
      });
    } catch (err: any) {
      alert(err.message || "Failed to load certificate");
    } finally {
      setLoading(false);
    }
  }

  function downloadCert() {
    if (!viewingCert) return;
    const blob = new Blob([viewingCert.content], { type: "text/plain" });
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
    if (!confirm(`Delete pending domain "${domainName}"? This action cannot be undone.`)) {
      return;
    }

    setDeleting(domainId);
    try {
      const res = await fetch(`/api/domains/${domainId}/delete`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error);
      }

      alert("Pending domain deleted successfully");
      if (onDomainDeleted) {
        onDomainDeleted();
      }
    } catch (err: any) {
      alert(err.message || "Failed to delete domain");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Domain
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Expires
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Auto-Renew
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {domains.map(({ domain, certificate }) => {
              const daysRemaining = certificate
                ? differenceInDays(new Date(certificate.expiryDate), new Date())
                : 0;
              const isExpiring = daysRemaining < 30;
              const hasIncompleteChallenge = !certificate && domain.challengeToken;

              return (
                <tr key={domain.id}>
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
                      <div className="font-medium text-gray-900">
                        {domain.domainName}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {certificate ? (
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                          daysRemaining < 0
                            ? "bg-red-100 text-red-800"
                            : isExpiring
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-green-100 text-green-800"
                        }`}
                      >
                        {daysRemaining < 0 ? "Expired" : "Active"}
                      </span>
                    ) : (
                      <span className="text-gray-500 text-sm">
                        {hasIncompleteChallenge ? "Verification pending" : "No cert"}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {certificate ? (
                      <div>
                        <div className="text-sm text-gray-900">
                          {format(new Date(certificate.expiryDate), "MMM d, yyyy")}
                        </div>
                        <div className="text-xs text-gray-500">
                          {daysRemaining} days remaining
                        </div>
                      </div>
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                  </td>
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
                  <td className="px-6 py-4">
                    {certificate ? (
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => viewCertificate(domain.id, "key")}
                          disabled={loading}
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
                        >
                          <Key className="w-3 h-3" />
                          KEY
                        </button>
                        <button
                          onClick={() => viewCertificate(domain.id, "crt")}
                          disabled={loading}
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
                        >
                          <FileText className="w-3 h-3" />
                          CRT
                        </button>
                        <button
                          onClick={() => viewCertificate(domain.id, "cabundle")}
                          disabled={loading}
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
                        >
                          <Shield className="w-3 h-3" />
                          CABUNDLE
                        </button>
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

      {/* Certificate Viewer Modal */}
      {viewingCert && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">
                {viewingCert.type} File
              </h3>
              <button
                onClick={() => setViewingCert(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
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
