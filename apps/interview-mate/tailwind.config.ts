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
        sans: ["var(--font-pretendard)", "sans-serif"],
        display: ["var(--font-geist-sans)", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: "var(--card)",
        border: "var(--border)",
        muted: "var(--muted)",
        division: {
          DEFAULT: "var(--division-color)",
          light: "var(--division-color-light)",
          dark: "var(--division-color-dark)",
          soft: "var(--division-color-soft)",
          muted: "var(--division-color-muted)",
          strong: "var(--division-color-strong)",
        },
        attend: {
          present: "#16A34A",
          tardy: "#CA8A04",
          absent: "#DC2626",
          excused: "#2563EB",
          holiday: "#6B7280",
          unprocessed: "#F97316",
        },
        warn: {
          1: "#EAB308",
          2: "#F97316",
          interview: "#DC2626",
          withdraw: "#7F1D1D",
        },
      },
      boxShadow: {},
    },
  },
  plugins: [],
};
export default config;
