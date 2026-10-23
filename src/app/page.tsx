import Link from "next/link";
import { ArrowRight, Check, Minus, Plus } from "lucide-react";
import SslChecker from "@/components/SslChecker";
import SpecimenCertificate from "@/components/brand/SpecimenCertificate";
import { GuillocheBand, Wordmark } from "@/components/brand/Marks";

const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-ctl bg-brand px-5 py-3 text-[15px] font-medium text-brand-on transition-colors duration-150 hover:bg-brand-hover active:bg-brand-active focus-visible:outline-none focus-visible:shadow-focus";
const btnQuiet =
  "inline-flex items-center gap-1.5 text-[15px] font-medium text-ink underline decoration-line-strong underline-offset-[6px] transition-colors hover:decoration-brand focus-visible:outline-none focus-visible:shadow-focus rounded-[2px]";
const label = "font-mono text-[11px] uppercase tracking-label text-ink-3";

const steps = [
  {
    n: "01",
    title: "Enter your domain",
    body: "We request a certificate from Let's Encrypt and give you one small verification file.",
  },
  {
    n: "02",
    title: "Upload one file",
    body: "Put it in your hosting's File Manager. We confirm Let's Encrypt can see it, then hand you the certificate.",
  },
  {
    n: "03",
    title: "Never think about it again",
    body: "Upload the bridge files once. Every 90 days a new certificate is issued, installed and emailed to you.",
    pro: true,
  },
];

const facts = [
  {
    k: "Encrypted at rest",
    v: "Private keys are encrypted with AES-256 before they're stored, and only decrypted when you download them.",
  },
  {
    k: "Any host that takes an upload",
    v: "cPanel, Plesk, DirectAdmin or plain FTP. If you can upload a file, EasySSL works.",
  },
  {
    k: "Renewal starts 30 days early",
    v: "If something on your server needs fixing, there are weeks to do it, and we'll email you what to change.",
  },
  {
    k: "Trusted by every browser",
    v: "Certificates are issued by Let's Encrypt, the same authority behind hundreds of millions of sites.",
  },
];

type Plan = {
  name: string;
  price: string;
  per: string;
  blurb: string;
  cta: string;
  featured?: boolean;
  features: { text: string; included: boolean }[];
};

const plans: Plan[] = [
  {
    name: "Free",
    price: "$0",
    per: "forever",
    blurb: "For a few sites you're happy to renew by hand.",
    cta: "Start free",
    features: [
      { text: "Up to 5 domains", included: true },
      { text: "Guided file verification", included: true },
      { text: "Download CRT, KEY & CA bundle", included: true },
      { text: "Renew yourself every 90 days", included: true },
      { text: "Automatic renewal", included: false },
    ],
  },
  {
    name: "Pro",
    price: "$29",
    per: "per year",
    blurb: "For site owners and freelancers who never want to see an expiry again.",
    cta: "Start with Pro",
    featured: true,
    features: [
      { text: "Up to 10 domains", included: true },
      { text: "Bridge files: upload once", included: true },
      { text: "Automatic renewal & install", included: true },
      { text: "Every renewal emailed to you", included: true },
      { text: "Auto-renewal health check", included: true },
    ],
  },
  {
    name: "Lifetime",
    price: "$49",
    per: "once",
    blurb: "Everything in Pro for more sites, paid for once.",
    cta: "Get Lifetime",
    features: [
      { text: "Up to 20 domains", included: true },
      { text: "Bridge files: upload once", included: true },
      { text: "Automatic renewal & install", included: true },
      { text: "Every renewal emailed to you", included: true },
      { text: "No subscription to remember", included: true },
    ],
  },
];

const faqs = [
  {
    q: "Is the Free plan really free?",
    a: "Yes. You can secure up to 5 domains with 90-day certificates at no cost. To renew, you repeat the quick verification step before each certificate expires.",
  },
  {
    q: "What are the bridge files?",
    a: "Two small files (bridge.php and .htaccess) you upload to your hosting once. When a certificate is 30 days from expiring, they let us complete Let's Encrypt's check on your behalf, so a new certificate is issued without you doing anything. On most cPanel hosts it's installed for you too.",
  },
  {
    q: "Do I need technical knowledge?",
    a: "No. If you can upload a file through cPanel's File Manager or FTP, you can use EasySSL. Each step tells you exactly what to upload and where.",
  },
  {
    q: "Will I know when a certificate renews?",
    a: "Yes. Pro and Lifetime renewals are emailed to you with the new certificate files, and your dashboard updates straight away.",
  },
  {
    q: "Which hosting providers does it work with?",
    a: "Any host that lets you upload files: cPanel, Plesk, DirectAdmin or a custom server. Automatic installation currently works on cPanel hosts; elsewhere you install the emailed certificate yourself.",
  },
  {
    q: "Are my private keys safe?",
    a: "Private keys are encrypted with AES-256 before they're stored and are only decrypted when you download them from your dashboard.",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/* Header */}
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-page items-center justify-between gap-6 px-5 py-4 sm:px-8">
          <Link href="/" className="rounded-[2px] text-[15px] focus-visible:outline-none focus-visible:shadow-focus" aria-label="EasySSL home">
            <Wordmark />
          </Link>
          <nav aria-label="Main" className="flex items-center gap-6 text-[15px]">
            <div className="hidden items-center gap-6 text-ink-2 md:flex">
              <a href="#how" className="transition-colors hover:text-ink">How it works</a>
              <a href="#pricing" className="transition-colors hover:text-ink">Pricing</a>
              <a href="#faq" className="transition-colors hover:text-ink">FAQ</a>
            </div>
            <Link href="/sign-in" className="text-ink-2 transition-colors hover:text-ink">
              Sign in
            </Link>
            <Link href="/sign-up" className={`${btnPrimary} hidden px-4 py-2 sm:inline-flex`}>
              Get a free certificate
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-page items-center gap-16 px-5 pb-24 pt-16 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:pb-32 lg:pt-24">
          <div>
            <p className={`${label} animate-rise`}>Free SSL · Let&apos;s Encrypt · Auto-renewal</p>
            <h1
              className="mt-6 font-display text-display font-normal text-balance animate-rise"
              style={{ "--delay": "80ms" } as React.CSSProperties}
            >
              Free SSL certificates that <em className="text-brand">renew themselves.</em>
            </h1>
            <p
              className="mt-7 max-w-[34rem] text-lg leading-relaxed text-ink-2 text-pretty animate-rise"
              style={{ "--delay": "160ms" } as React.CSSProperties}
            >
              Get a trusted certificate for any site on shared hosting in about five minutes. Go Pro, and every
              renewal after that happens on its own: issued, installed and emailed to you.
            </p>
            <div
              className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4 animate-rise"
              style={{ "--delay": "240ms" } as React.CSSProperties}
            >
              <Link href="/sign-up" className={btnPrimary}>
                Get a free certificate <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#check" className={btnQuiet}>
                Check your site&apos;s SSL
              </a>
            </div>
            <p
              className="mt-10 font-mono text-[12px] text-ink-3 animate-rise"
              style={{ "--delay": "320ms" } as React.CSSProperties}
            >
              5 domains free · No card required · cPanel, Plesk, DirectAdmin
            </p>
          </div>

          <SpecimenCertificate />
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-8 border-t border-line">
          <div className="mx-auto max-w-page px-5 py-24 sm:px-8">
            <div className="grid gap-6 lg:grid-cols-[1fr_2fr] lg:gap-12">
              <p className={label}>How it works</p>
              <h2 className="max-w-[30rem] font-display text-4xl leading-[1.1] tracking-[-0.015em] text-balance sm:text-5xl">
                Three steps. The third one runs itself.
              </h2>
            </div>

            <ol className="mt-16 grid border-t border-line-strong md:grid-cols-3">
              {steps.map((s, i) => (
                <li
                  key={s.n}
                  className={`relative py-8 md:py-10 md:pr-10 ${i > 0 ? "border-t border-line md:border-l md:border-t-0 md:pl-10" : ""}`}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-[13px] text-ink-3">{s.n}</span>
                    {s.pro && (
                      <span className="rounded-full border border-brand/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-brand">
                        Pro
                      </span>
                    )}
                  </div>
                  <h3 className="mt-8 font-display text-2xl leading-tight">{s.title}</h3>
                  <p className="mt-3 leading-relaxed text-ink-2">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* SSL checker */}
        <section id="check" className="scroll-mt-8 border-y border-line bg-surface">
          <div className="mx-auto grid max-w-page gap-10 px-5 py-24 sm:px-8 lg:grid-cols-[1fr_1.3fr] lg:gap-16">
            <div>
              <p className={label}>Free SSL checker</p>
              <h2 className="mt-5 font-display text-4xl leading-[1.1] tracking-[-0.015em] text-balance">
                Is your certificate about to lapse?
              </h2>
              <p className="mt-5 max-w-[28rem] leading-relaxed text-ink-2">
                Check any site&apos;s certificate: who issued it, which names it covers and exactly how many days it has
                left. No account needed.
              </p>
            </div>
            <SslChecker />
          </div>
        </section>

        {/* What you get */}
        <section className="mx-auto max-w-page px-5 py-24 sm:px-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_2fr] lg:gap-12">
            <p className={label}>What you get</p>
            <h2 className="max-w-[32rem] font-display text-4xl leading-[1.1] tracking-[-0.015em] text-balance sm:text-5xl">
              Built to do one job, and never drop it.
            </h2>
          </div>
          <dl className="mt-16 grid border-t border-line-strong sm:grid-cols-2">
            {facts.map((f, i) => (
              <div
                key={f.k}
                className={`py-8 sm:py-10 ${i % 2 === 1 ? "sm:border-l sm:border-line sm:pl-10" : "sm:pr-10"} ${i > 0 ? "border-t border-line" : ""} ${i === 1 ? "sm:border-t-0" : ""}`}
              >
                <dt className="font-display text-2xl leading-tight">{f.k}</dt>
                <dd className="mt-3 max-w-[30rem] leading-relaxed text-ink-2">{f.v}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Pricing */}
        <section id="pricing" className="scroll-mt-8 border-t border-line">
          <div className="mx-auto max-w-page px-5 py-24 sm:px-8">
            <div className="grid gap-6 lg:grid-cols-[1fr_2fr] lg:gap-12">
              <p className={label}>Pricing</p>
              <div>
                <h2 className="max-w-[32rem] font-display text-4xl leading-[1.1] tracking-[-0.015em] text-balance sm:text-5xl">
                  Free to start. Pay for peace of mind.
                </h2>
                <p className="mt-5 max-w-[30rem] leading-relaxed text-ink-2">
                  Every plan uses the same Let&apos;s Encrypt certificates. Paid plans add automatic renewal.
                </p>
              </div>
            </div>

            <div className="mt-16 grid overflow-hidden rounded-card border border-line-strong bg-surface lg:grid-cols-3">
              {plans.map((p, i) => (
                <div
                  key={p.name}
                  className={`flex flex-col p-8 sm:p-10 ${p.featured ? "order-first bg-brand-soft/60 lg:order-none" : ""} ${i > 0 ? "border-t border-line lg:border-l lg:border-t-0" : ""}`}
                >
                  <div className="flex items-baseline justify-between">
                    <h3 className="font-display text-2xl">{p.name}</h3>
                    {p.featured && (
                      <span className="font-mono text-[10px] uppercase tracking-label text-brand">Recommended</span>
                    )}
                  </div>
                  <p className="mt-6 flex items-baseline gap-2">
                    <span className="font-display text-5xl tracking-[-0.02em] tabular">{p.price}</span>
                    <span className="font-mono text-[12px] text-ink-3">{p.per}</span>
                  </p>
                  <p className="mt-4 min-h-[3rem] text-[15px] leading-relaxed text-ink-2">{p.blurb}</p>

                  <ul className="mt-8 space-y-3 border-t border-line pt-6 text-[15px]">
                    {p.features.map((f) => (
                      <li key={f.text} className={`flex items-start gap-3 ${f.included ? "text-ink" : "text-ink-3"}`}>
                        {f.included ? (
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                        ) : (
                          <Minus className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        )}
                        <span>
                          {f.text}
                          {!f.included && <span className="sr-only"> (not included)</span>}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href="/sign-up"
                    className={`mt-10 ${
                      p.featured
                        ? btnPrimary
                        : "inline-flex items-center justify-center rounded-ctl border border-line-strong px-5 py-3 text-[15px] font-medium text-ink transition-colors hover:border-ink focus-visible:outline-none focus-visible:shadow-focus"
                    }`}
                  >
                    {p.cta}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-8 border-t border-line">
          <div className="mx-auto grid max-w-page gap-10 px-5 py-24 sm:px-8 lg:grid-cols-[1fr_2fr] lg:gap-12">
            <div>
              <p className={label}>FAQ</p>
              <h2 className="mt-5 font-display text-4xl leading-[1.1] tracking-[-0.015em]">Questions, answered.</h2>
              <p className="mt-5 leading-relaxed text-ink-2">
                Something else?{" "}
                <a href="mailto:support@easyssl.app" className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-brand">
                  support@easyssl.app
                </a>
              </p>
            </div>
            <div className="border-t border-line-strong">
              {faqs.map((item) => (
                <details key={item.q} className="group border-b border-line">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-lg font-medium text-ink transition-colors hover:text-brand focus-visible:outline-none focus-visible:shadow-focus [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <Plus className="h-5 w-5 shrink-0 text-ink-3 transition-transform duration-200 group-open:rotate-45" aria-hidden="true" />
                  </summary>
                  <p className="max-w-[40rem] pb-7 pr-10 leading-relaxed text-ink-2">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Closing */}
        <section className="mx-auto max-w-page px-5 pb-24 sm:px-8">
          <div className="relative overflow-hidden rounded-card bg-brand px-8 py-16 text-brand-on sm:px-14 sm:py-20">
            <GuillocheBand className="pointer-events-none absolute inset-x-0 bottom-0 h-40 w-full text-brand-on/15" lines={22} />
            <div className="relative max-w-[36rem]">
              <h2 className="font-display text-4xl leading-[1.1] tracking-[-0.015em] text-balance sm:text-5xl">
                Never see &ldquo;Not secure&rdquo; on your site again.
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-brand-on/80">
                Your first certificate takes about five minutes. Keeping it is automatic.
              </p>
              <Link
                href="/sign-up"
                className="mt-10 inline-flex items-center gap-2 rounded-ctl bg-canvas px-5 py-3 text-[15px] font-medium text-ink transition-colors hover:bg-surface focus-visible:outline-none focus-visible:shadow-focus"
              >
                Get a free certificate <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-page flex-col gap-8 px-5 py-12 sm:px-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-[24rem]">
            <Wordmark className="text-[14px]" />
            <p className="mt-4 text-[13px] leading-relaxed text-ink-3">
              Certificates are issued by Let&apos;s Encrypt. EasySSL is an independent service and is not affiliated
              with Let&apos;s Encrypt or ISRG.
            </p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-8 gap-y-3 text-[14px] text-ink-2">
            <Link href="/terms" className="hover:text-ink">Terms</Link>
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
            <Link href="/refund" className="hover:text-ink">Refunds</Link>
            <a href="mailto:support@easyssl.app" className="hover:text-ink">support@easyssl.app</a>
          </nav>
        </div>
        <div className="mx-auto max-w-page px-5 pb-10 font-mono text-[11px] text-ink-3 sm:px-8">
          © {new Date().getFullYear()} EasySSL
        </div>
      </footer>
    </div>
  );
}
