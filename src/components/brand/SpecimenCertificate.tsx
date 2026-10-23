import { GuillocheBand, Seal } from "./Marks";

const DAY = 86_400_000;
const LIFETIME_DAYS = 90;
const RENEW_AT_DAY = 60; // auto-renewal begins 30 days before expiry
const TODAY_DAY = 63;

function fmt(d: Date) {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-label text-ink-3">{label}</dt>
      <dd className="mt-1 font-mono text-[13px] text-ink">{children}</dd>
    </div>
  );
}

/**
 * A specimen certificate: the product's promise shown as an object.
 * Dates are relative to today so the specimen always looks current.
 */
export default function SpecimenCertificate() {
  const issued = new Date(Date.now() - TODAY_DAY * DAY);
  const expires = new Date(issued.getTime() + LIFETIME_DAYS * DAY);
  const renewPct = (RENEW_AT_DAY / LIFETIME_DAYS) * 100;
  const todayPct = (TODAY_DAY / LIFETIME_DAYS) * 100;

  return (
    <div className="relative mx-auto w-full max-w-[34rem]">
      {/* The next certificate, already issued behind the current one */}
      <div
        className="absolute inset-x-6 -bottom-4 top-6 rotate-[2.2deg] rounded-card border border-line bg-surface/80 shadow-lift animate-rise"
        style={{ "--delay": "420ms" } as React.CSSProperties}
        aria-hidden="true"
      >
        <span className="absolute bottom-3 right-5 font-mono text-[10px] uppercase tracking-label text-ink-3">
          Next certificate · issued automatically
        </span>
      </div>

      <figure
        className="relative rounded-card border border-line-strong bg-surface p-2 shadow-doc animate-rise"
        style={{ "--delay": "260ms" } as React.CSSProperties}
        aria-label="Example certificate for yourbusiness.com, valid for 90 days and renewed automatically"
      >
        {/* Double rule, like a printed security document */}
        <div className="relative rounded-[7px] border border-line px-6 pb-6 pt-5 sm:px-8">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-16 overflow-hidden rounded-t-[7px]">
            <GuillocheBand className="h-full w-full text-brand/25" />
          </div>

          <div className="relative flex items-start justify-between gap-4">
            <p className="font-mono text-[10px] uppercase tracking-label text-ink-2">
              Certificate of domain validation
            </p>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-status-ok/30 bg-status-ok-soft px-2.5 py-1 font-mono text-[10px] uppercase tracking-label text-status-ok">
              <span className="h-1.5 w-1.5 rounded-full bg-status-ok" />
              Secure
            </span>
          </div>

          <p className="relative mt-7 font-display text-[2rem] leading-none tracking-[-0.015em] text-ink sm:text-[2.4rem]">
            yourbusiness.com
          </p>
          <p className="relative mt-2 text-sm text-ink-2">Also covers www.yourbusiness.com</p>

          <dl className="relative mt-7 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-5">
            <Field label="Issued by">Let&apos;s Encrypt R11</Field>
            <Field label="Serial">04:A1:9F:3C:7E:02</Field>
            <Field label="Valid from">{fmt(issued)}</Field>
            <Field label="Valid until">{fmt(expires)}</Field>
          </dl>

          {/* 90-day renewal track */}
          <div className="relative mt-7 pr-20 sm:pr-24">
            <div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-label text-ink-3">
              <span>Day 0</span>
              <span>Day {LIFETIME_DAYS}</span>
            </div>
            <div className="relative mt-2 h-2 rounded-full bg-sunken">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-brand animate-track"
                style={{ width: `${todayPct}%`, "--delay": "700ms" } as React.CSSProperties}
              />
              <div
                className="absolute -top-1.5 h-5 w-px bg-ink"
                style={{ left: `${renewPct}%` }}
                aria-hidden="true"
              />
            </div>
            <p className="mt-3 text-[13px] leading-snug text-ink-2">
              <span className="font-medium text-ink">Day {RENEW_AT_DAY}:</span> renewal starts on its own.
              The new certificate is installed and emailed before this one expires.
            </p>
          </div>

          <Seal
            id="hero-seal"
            className="absolute -bottom-10 -right-3 h-28 w-28 text-brand/80 sm:-bottom-12 sm:-right-10 sm:h-32 sm:w-32"
          />
        </div>
      </figure>
    </div>
  );
}
