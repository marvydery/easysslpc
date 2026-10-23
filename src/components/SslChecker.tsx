"use client";

import { useState } from "react";
import { ArrowRight, ChevronDown, Loader2 } from "lucide-react";

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

type State = "secure" | "expiring" | "expired";

function stateOf(result: CertInfo): State {
  if (!result.valid || result.daysRemaining < 0) return "expired";
  if (result.daysRemaining < 30) return "expiring";
  return "secure";
}

const STATE_STYLE: Record<State, { label: string; text: string; soft: string; dot: string }> = {
  secure: { label: "Secure", text: "text-status-ok", soft: "bg-status-ok-soft border-status-ok/30", dot: "bg-status-ok" },
  expiring: { label: "Expiring", text: "text-status-warn", soft: "bg-status-warn-soft border-status-warn/30", dot: "bg-status-warn" },
  expired: { label: "Expired or invalid", text: "text-status-error", soft: "bg-status-error-soft border-status-error/30", dot: "bg-status-error" },
};

function Label({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-[10px] uppercase tracking-label text-ink-3">{children}</p>;
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
    new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  const state = result ? stateOf(result) : null;
  const style = state ? STATE_STYLE[state] : null;

  return (
    <div className="w-full">
      <form onSubmit={handleCheck} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="ssl-check-domain" className="sr-only">
          Domain to check
        </label>
        <input
          id="ssl-check-domain"
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="yourbusiness.com"
          className="min-w-0 flex-1 rounded-ctl border border-line-strong bg-surface px-4 py-3 font-mono text-[15px] text-ink placeholder:text-ink-3 transition-shadow focus:border-brand focus:outline-none focus:shadow-focus disabled:opacity-60"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !domain.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-ctl bg-ink px-5 py-3 text-[15px] font-medium text-ink-inverse transition-colors hover:bg-ink/85 focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? "Checking…" : "Check certificate"}
        </button>
      </form>

      {error && (
        <div role="alert" className="mt-4 rounded-ctl border border-status-error/30 bg-status-error-soft p-4">
          <p className="text-sm font-medium text-status-error">Couldn&apos;t read a certificate</p>
          <p className="mt-1 text-sm text-ink-2">{error}</p>
        </div>
      )}

      {result && style && (
        <div className="mt-4 overflow-hidden rounded-card border border-line-strong bg-surface" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <Label>Checked</Label>
              <p className="mt-1 truncate font-mono text-[15px] text-ink">{result.domain}</p>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-label ${style.soft} ${style.text}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
              {style.label}
            </span>
          </div>

          <dl className="grid grid-cols-3 divide-x divide-line border-b border-line">
            <div className="px-5 py-4">
              <dt><Label>Days left</Label></dt>
              <dd className={`mt-1 font-display text-3xl leading-none tabular ${style.text}`}>
                {Math.max(result.daysRemaining, 0)}
              </dd>
            </div>
            <div className="px-5 py-4">
              <dt><Label>Valid from</Label></dt>
              <dd className="mt-2 font-mono text-[13px] text-ink">{formatDate(result.validFrom)}</dd>
            </div>
            <div className="px-5 py-4">
              <dt><Label>Expires</Label></dt>
              <dd className="mt-2 font-mono text-[13px] text-ink">{formatDate(result.validTo)}</dd>
            </div>
          </dl>

          <dl className="grid grid-cols-2 gap-4 px-5 py-4">
            <div>
              <dt><Label>Issued to</Label></dt>
              <dd className="mt-1 text-sm text-ink">{result.subject.CN || result.domain}</dd>
              {result.subject.O && <dd className="text-xs text-ink-3">{result.subject.O}</dd>}
            </div>
            <div>
              <dt><Label>Issued by</Label></dt>
              <dd className="mt-1 text-sm text-ink">{result.issuer.CN || "Unknown authority"}</dd>
              {result.issuer.O && <dd className="text-xs text-ink-3">{result.issuer.O}</dd>}
            </div>
          </dl>

          <div className="border-t border-line">
            <button
              type="button"
              onClick={() => setShowDetails(!showDetails)}
              aria-expanded={showDetails}
              className="flex w-full items-center justify-between px-5 py-3 text-sm text-ink-2 transition-colors hover:bg-sunken focus-visible:outline-none focus-visible:shadow-focus"
            >
              <span className="font-medium">Technical details</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${showDetails ? "rotate-180" : ""}`} />
            </button>

            {showDetails && (
              <div className="space-y-4 bg-sunken/60 px-5 pb-5 pt-1">
                {result.subjectAltNames.length > 0 && (
                  <div>
                    <Label>Names covered</Label>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {result.subjectAltNames.map((san) => (
                        <span key={san} className="rounded-[3px] border border-line bg-surface px-2 py-0.5 font-mono text-xs text-ink">
                          {san}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <Label>SHA-1 fingerprint</Label>
                  <p className="mt-1.5 break-all rounded-[3px] border border-line bg-surface p-2 font-mono text-xs text-ink-2">
                    {result.fingerprint}
                  </p>
                </div>
                <div>
                  <Label>Serial number</Label>
                  <p className="mt-1.5 break-all rounded-[3px] border border-line bg-surface p-2 font-mono text-xs text-ink-2">
                    {result.serialNumber}
                  </p>
                </div>
              </div>
            )}
          </div>

          {state !== "secure" && (
            <div className={`flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4 ${style.soft}`}>
              <p className="text-sm text-ink">
                {state === "expiring"
                  ? `This certificate expires in ${result.daysRemaining} day${result.daysRemaining === 1 ? "" : "s"}.`
                  : "Visitors are seeing a security warning on this site."}
              </p>
              <a
                href="/sign-up"
                className="inline-flex items-center gap-1.5 rounded-ctl bg-brand px-4 py-2 text-sm font-medium text-brand-on transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:shadow-focus"
              >
                Get a free certificate <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
