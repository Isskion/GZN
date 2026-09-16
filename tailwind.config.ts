import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        heading: ["var(--font-heading)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        background: "var(--color-bg)",
        foreground: "var(--color-text)",
        industry: {
          bg: "var(--color-bg)",
          surface: "var(--color-surface)",
          text: "var(--color-text)",
          accent: "var(--color-accent)",
          divider: "var(--color-divider)",
          crit: "var(--risk-crit)",
          high: "var(--risk-high)",
          watch: "var(--risk-watch)",
          stable: "var(--risk-stable)",
          neutral: "var(--risk-neutral)",
        },
        gzn: {
          dark: "#0F172A",
          card: "#1E293B",
          border: "#334155",
          red: "var(--risk-crit)",
          amber: "var(--risk-high)",
          green: "var(--risk-stable)",
          blue: "var(--risk-watch)",
        }
      },
    },
  },
  plugins: [],
};
export default config;
