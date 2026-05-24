/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class", "[data-scheme='awm-dark']"],
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
    },
    extend: {
      fontFamily: {
        display: ["Cormorant Garamond", "Georgia", "serif"],
        body: ["Barlow", "Helvetica Neue", "system-ui", "sans-serif"],
        condensed: ["Barlow Condensed", "Arial Narrow", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        // AWM design tokens — populated via CSS variables in styles/globals.css
        // so they switch with [data-scheme].
        bg: {
          base: "hsl(var(--bg-base) / <alpha-value>)",
          surface: "hsl(var(--bg-surface) / <alpha-value>)",
          raised: "hsl(var(--bg-raised) / <alpha-value>)",
        },
        fg: {
          DEFAULT: "hsl(var(--fg-primary) / <alpha-value>)",
          muted: "hsl(var(--fg-muted) / <alpha-value>)",
          subtle: "hsl(var(--fg-subtle) / <alpha-value>)",
        },
        border: {
          DEFAULT: "hsl(var(--border-default) / <alpha-value>)",
          subtle: "hsl(var(--border-subtle) / <alpha-value>)",
          strong: "hsl(var(--border-strong) / <alpha-value>)",
        },
        gold: {
          DEFAULT: "hsl(var(--gold) / <alpha-value>)",
          bright: "hsl(var(--gold-bright) / <alpha-value>)",
          dim: "hsl(var(--gold-dim) / <alpha-value>)",
        },
        status: {
          success: "hsl(var(--status-success) / <alpha-value>)",
          warning: "hsl(var(--status-warning) / <alpha-value>)",
          error: "hsl(var(--status-error) / <alpha-value>)",
          info: "hsl(var(--status-info) / <alpha-value>)",
        },
      },
      borderRadius: {
        sm: "2px",
        md: "4px",
        lg: "6px",
        xl: "8px",
      },
      boxShadow: {
        card: "0 1px 4px hsl(0 0% 0% / 0.45)",
        elevated: "0 4px 16px hsl(0 0% 0% / 0.55)",
        gold: "0 0 24px hsl(43 50% 55% / 0.25)",
      },
    },
  },
  plugins: [],
};
