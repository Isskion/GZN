import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        gzn: {
          dark: "#0F172A",
          card: "#1E293B",
          border: "#334155",
          red: "#EF4444",
          amber: "#F59E0B",
          green: "#10B981",
          blue: "#3B82F6",
        }
      },
    },
  },
  plugins: [],
};
export default config;
