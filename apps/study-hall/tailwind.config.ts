import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Pretendard", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.03)",
        "card-hover": "0 4px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)",
        header: "0 8px 24px rgba(0,0,0,0.12)",
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        police: {
          DEFAULT: "#1B4FBB",
          light: "#EBF0FB",
          dark: "#0D2D6B",
        },
        fire: {
          DEFAULT: "#C55A11",
          light: "#FEF3EC",
          dark: "#7A3608",
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
    },
  },
  plugins: [],
};
export default config;
