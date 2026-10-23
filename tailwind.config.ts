import type { Config } from "tailwindcss";

// Token-backed colour: rgb(var(--x) / <alpha-value>) keeps opacity modifiers working
const token = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: token("--color-bg-primary"),
        surface: token("--color-bg-secondary"),
        sunken: token("--color-bg-tertiary"),
        inverse: token("--color-bg-inverse"),
        ink: {
          DEFAULT: token("--color-text-primary"),
          2: token("--color-text-secondary"),
          3: token("--color-text-tertiary"),
          inverse: token("--color-text-inverse"),
        },
        line: {
          DEFAULT: token("--color-border-secondary"),
          strong: token("--color-border-primary"),
        },
        brand: {
          DEFAULT: token("--color-accent-primary"),
          hover: token("--color-accent-primary-hover"),
          active: token("--color-accent-primary-active"),
          on: token("--color-accent-on-primary"),
          soft: token("--color-accent-soft"),
        },
        mark: token("--color-accent-secondary"),
        status: {
          ok: token("--color-status-success"),
          "ok-soft": token("--color-status-success-soft"),
          warn: token("--color-status-warning"),
          "warn-soft": token("--color-status-warning-soft"),
          error: token("--color-status-error"),
          "error-soft": token("--color-status-error-soft"),
        },
        overlay: token("--color-surface-overlay"),
      },
      fontFamily: {
        display: ["var(--font-family-display)"],
        body: ["var(--font-family-body)"],
        mono: ["var(--font-family-mono)"],
      },
      fontSize: {
        display: ["var(--font-size-4xl)", { lineHeight: "var(--line-height-tight)", letterSpacing: "var(--letter-spacing-tight)" }],
      },
      letterSpacing: {
        label: "var(--letter-spacing-wide)",
      },
      maxWidth: {
        content: "var(--max-width-content)",
        wide: "var(--max-width-wide)",
        page: "var(--max-width-page)",
      },
      borderRadius: {
        ctl: "var(--border-radius-md)",
        card: "var(--border-radius-lg)",
      },
      boxShadow: {
        doc: "var(--shadow-lg)",
        lift: "var(--shadow-md)",
        hair: "var(--shadow-sm)",
        focus: "var(--shadow-focus)",
      },
      transitionTimingFunction: {
        out: "var(--easing-out)",
      },
    },
  },
  plugins: [],
};
export default config;
