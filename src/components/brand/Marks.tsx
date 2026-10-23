/**
 * EasySSL brand marks — pure SVG, no assets.
 * Guilloché patterns borrow from security printing (certificates, banknotes).
 */

type SvgProps = { className?: string };

/** Padlock drawn as a shackle over a rounded body with a check notch. */
export function PadlockMark({ className }: SvgProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M7.5 10.5V8a4.5 4.5 0 0 1 9 0v2.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <rect x="4.5" y="10.5" width="15" height="10.5" rx="2.4" fill="currentColor" />
      <path
        d="M9 15.6l2.1 2.1L15.2 13.6"
        stroke="rgb(var(--color-bg-secondary))"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark({ className = "" }: SvgProps) {
  return (
    <span className={`inline-flex items-center gap-2 text-ink ${className}`}>
      <PadlockMark className="h-[1.15em] w-[1.15em] text-brand" />
      <span className="font-display text-[1.35em] font-semibold leading-none tracking-[-0.01em]">
        Easy<span className="italic font-medium">SSL</span>
      </span>
    </span>
  );
}

/** Horizontal band of interfering sine waves, like the border of a certificate. */
export function GuillocheBand({
  className,
  lines = 16,
  width = 640,
  height = 96,
}: SvgProps & { lines?: number; width?: number; height?: number }) {
  const paths = Array.from({ length: lines }, (_, i) => {
    const phase = (i / lines) * Math.PI * 2;
    let d = "";
    for (let x = 0; x <= width; x += 4) {
      const t = (x / width) * Math.PI * 2;
      const y =
        height / 2 +
        Math.sin(t * 3 + phase) * height * 0.3 +
        Math.sin(t * 9 - phase * 2) * height * 0.1;
      d += `${x === 0 ? "M" : "L"}${x} ${y.toFixed(2)}`;
    }
    return d;
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      fill="none"
      stroke="currentColor"
      className={className}
      aria-hidden="true"
    >
      {paths.map((d, i) => (
        <path key={i} d={d} strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

/** Circular rosette of modulated rings — the engraved centre of a seal. */
export function GuillocheRosette({
  className,
  size = 200,
  rings = 18,
}: SvgProps & { size?: number; rings?: number }) {
  const c = size / 2;
  const paths = Array.from({ length: rings }, (_, i) => {
    const phase = (i / rings) * Math.PI * 2;
    let d = "";
    for (let step = 0; step <= 360; step += 2) {
      const a = (step * Math.PI) / 180;
      const r = size * 0.32 + Math.sin(a * 8 + phase) * size * 0.07 + Math.sin(a * 3 - phase) * size * 0.03;
      const x = c + r * Math.cos(a);
      const y = c + r * Math.sin(a);
      d += `${step === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    }
    return d + "Z";
  });

  return (
    <svg viewBox={`0 0 ${size} ${size}`} fill="none" stroke="currentColor" className={className} aria-hidden="true">
      {paths.map((d, i) => (
        <path key={i} d={d} strokeWidth="0.5" />
      ))}
    </svg>
  );
}

/** Verification seal: rotating text ring around an engraved rosette and padlock. */
export function Seal({ className, id = "seal" }: SvgProps & { id?: string }) {
  const size = 132;
  const c = size / 2;
  const r = 54;
  const ring = `M ${c} ${c} m -${r} 0 a ${r} ${r} 0 1 1 ${r * 2} 0 a ${r} ${r} 0 1 1 -${r * 2} 0`;

  return (
    // Caller sets position (e.g. absolute); defaults to relative
    <div className={className?.match(/\b(absolute|fixed)\b/) ? className : `relative ${className ?? ""}`} aria-hidden="true">
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 h-full w-full animate-seal">
        <defs>
          <path id={`${id}-ring`} d={ring} />
        </defs>
        <text className="fill-current font-mono" style={{ fontSize: 7.4, letterSpacing: "0.22em" }}>
          <textPath href={`#${id}-ring`}>
            DOMAIN VALIDATED · LET&apos;S ENCRYPT · RENEWS AUTOMATICALLY ·
          </textPath>
        </text>
      </svg>
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 h-full w-full" fill="none">
        <circle cx={c} cy={c} r={63} stroke="currentColor" strokeWidth="0.8" />
        <circle cx={c} cy={c} r={45} stroke="currentColor" strokeWidth="0.8" />
      </svg>
      <GuillocheRosette className="absolute inset-[18%] h-[64%] w-[64%] opacity-70" size={120} rings={14} />
      <PadlockMark className="absolute left-1/2 top-1/2 h-[26%] w-[26%] -translate-x-1/2 -translate-y-1/2" />
    </div>
  );
}
