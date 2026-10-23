"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Server, XCircle } from "lucide-react";

type Step = { label: string; status: "pass" | "fail"; message: string };

type Status =
  | { connected: false }
  | {
      connected: true;
      panelType: string;
      host: string;
      username: string;
      lastStatus: string | null;
      lastMessage: string | null;
      lastCheckedAt: string | null;
    };

const PANEL_OPTIONS = [
  { value: "cpanel", label: "cPanel", available: true },
  { value: "plesk", label: "Plesk", available: false },
  { value: "directadmin", label: "DirectAdmin", available: false },
];

function StepList({ steps }: { steps: Step[] }) {
  return (
    <ul className="space-y-2">
      {steps.map((s, i) => (
        <li
          key={i}
          className={`flex gap-3 rounded-lg border p-3 ${
            s.status === "pass" ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
          }`}
        >
          {s.status === "pass" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
          ) : (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          )}
          <div>
            <p className={`text-sm font-medium ${s.status === "pass" ? "text-green-900" : "text-red-900"}`}>{s.label}</p>
            <p className={`mt-0.5 break-words text-xs ${s.status === "pass" ? "text-green-700" : "text-red-700"}`}>{s.message}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function PanelConnectModal({
  domainId,
  domainName,
  onClose,
  onChanged,
}: {
  domainId: string;
  domainName: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [panelType, setPanelType] = useState("cpanel");
  const [host, setHost] = useState("");
  const [username, setUsername] = useState("");
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justConnected, setJustConnected] = useState(false);

  useEffect(() => {
    fetch(`/api/panel?domainId=${domainId}`)
      .then((r) => r.json())
      .then((d) => setStatus(d.error ? { connected: false } : d))
      .catch(() => setStatus({ connected: false }));
  }, [domainId]);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSteps(null);
    setError(null);
    try {
      const res = await fetch("/api/panel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainId, panelType, host, username, token }),
      });
      const data = await res.json();
      if (data.steps) setSteps(data.steps);
      if (data.ok) {
        setToken("");
        setJustConnected(true);
        onChanged();
      } else if (!data.steps) {
        setError(data.error || "Could not connect");
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  async function disconnect() {
    if (!confirm(`Disconnect the hosting panel from ${domainName}? Automatic installation will stop.`)) return;
    setDisconnecting(true);
    try {
      await fetch(`/api/panel?domainId=${domainId}`, { method: "DELETE" });
      setStatus({ connected: false });
      setSteps(null);
      onChanged();
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg bg-white">
        <div className="flex items-center justify-between border-b p-6">
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-blue-600" />
            <h3 className="text-lg font-bold text-gray-900">Hosting panel — {domainName}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto p-6">
          {status === null ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : status.connected && !justConnected ? (
            <>
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <p className="text-sm font-semibold text-green-900">
                  Connected to {PANEL_OPTIONS.find((p) => p.value === status.panelType)?.label ?? status.panelType}
                </p>
                <p className="mt-1 text-xs text-green-800">
                  {status.username} @ {status.host}
                </p>
                <p className="mt-2 text-xs text-green-800">
                  Renewals are verified and installed automatically through your hosting panel. No files to upload.
                </p>
              </div>
              {status.lastStatus === "error" && status.lastMessage && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                  <p className="font-semibold">Last attempt had a problem</p>
                  <p className="mt-1">{status.lastMessage}</p>
                </div>
              )}
              <p className="text-xs text-gray-500">
                To change the token or server, disconnect and connect again. Use &ldquo;Check Auto Renewal&rdquo; on the
                dashboard to re-test the connection.
              </p>
              <button
                onClick={disconnect}
                disabled={disconnecting}
                className="w-full rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                {disconnecting ? "Disconnecting…" : "Disconnect"}
              </button>
            </>
          ) : justConnected ? (
            <>
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <p className="text-sm font-semibold text-green-900">Connected. Auto-renewal is on.</p>
                <p className="mt-1 text-xs text-green-800">
                  About 30 days before expiry, EasySSL will renew {domainName} and install the new certificate through
                  your hosting panel.
                </p>
              </div>
              {steps && <StepList steps={steps} />}
              <button onClick={onClose} className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                Done
              </button>
            </>
          ) : (
            <form onSubmit={connect} className="space-y-4">
              <p className="text-sm text-gray-600">
                Connect your hosting control panel and EasySSL will renew <strong>{domainName}</strong> and install each new
                certificate for you. Nothing to upload.
              </p>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Hosting panel</label>
                <div className="grid grid-cols-3 gap-2">
                  {PANEL_OPTIONS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      disabled={!p.available}
                      onClick={() => setPanelType(p.value)}
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        panelType === p.value
                          ? "border-blue-600 bg-blue-50 font-medium text-blue-700"
                          : "border-gray-200 text-gray-700 hover:border-gray-300"
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      {p.label}
                      {!p.available && <span className="block text-[10px] text-gray-500">Coming soon</span>}
                    </button>
                  ))}
                </div>
              </div>

              <details className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900">
                <summary className="cursor-pointer font-medium">How to get a cPanel API token</summary>
                <ol className="mt-2 list-decimal space-y-1 pl-4">
                  <li>Log in to cPanel and open <strong>Security → Manage API Tokens</strong>.</li>
                  <li>Click <strong>Create</strong>, name it <strong>EasySSL</strong>, and leave &ldquo;expires&rdquo; empty.</li>
                  <li>Copy the token straight away. cPanel only shows it once.</li>
                </ol>
              </details>

              <div>
                <label htmlFor="panel-host" className="mb-1 block text-xs font-medium text-gray-700">
                  Server address
                </label>
                <input
                  id="panel-host"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="server123.yourhost.com"
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-[11px] text-gray-500">The address you open cPanel with. Port 2083 is added for you.</p>
              </div>

              <div>
                <label htmlFor="panel-user" className="mb-1 block text-xs font-medium text-gray-700">
                  cPanel username
                </label>
                <input
                  id="panel-user"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label htmlFor="panel-token" className="mb-1 block text-xs font-medium text-gray-700">
                  API token
                </label>
                <input
                  id="panel-token"
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  autoComplete="off"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-[11px] text-gray-500">
                  Stored encrypted and only used to place verification files and install certificates. You can delete
                  it in cPanel at any time.
                </p>
              </div>

              {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
              {steps && <StepList steps={steps} />}

              <button
                type="submit"
                disabled={submitting || !host.trim() || !username.trim() || !token.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting ? "Testing the connection…" : "Connect & test"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
