import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        police: {
          50: "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
          950: "#172554",
        },
        fire: {
          50: "#fef2f2",
          100: "#fee2e2",
          200: "#fecaca",
          300: "#fca5a5",
          400: "#f87171",
          500: "#ef4444",
          600: "#dc2626",
          700: "#b91c1c",
          800: "#991b1b",
          900: "#7f1d1d",
          950: "#450a0a",
        },
        service: {
          50: "var(--service-50)",
          100: "var(--service-100)",
          200: "var(--service-200)",
          300: "var(--service-300)",
          400: "var(--service-400)",
          500: "var(--service-500)",
          600: "var(--service-600)",
          700: "var(--service-700)",
          800: "var(--service-800)",
          900: "var(--service-900)",
          950: "var(--service-950)",
        },
        predict: {
          safe: "#0f766e",
          likely: "#1d4ed8",
          possible: "#d97706",
          challenge: "#dc2626",
        },
      },
    },
  },
};

export default config;
