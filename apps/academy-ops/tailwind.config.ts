import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#111827",
        mist: "#F7F4EF",
        ember: "#C55A11",
        forest: "#1F4D3A",
        sand: "#E7D8C9",
        slate: "#4B5563",
        primary: "#1B4FBB",
        "primary-dark": "#153D91",
        "primary-light": "#EBF0FB",
        "primary-muted": "#6B8ED6",
        success: "#16A34A",
        warning: "#D97706",
        danger: "#DC2626",
        "warn-light": "#FEF3C7",
        "danger-light": "#FEE2E2",
        sidebar: "#0B1120",
        "sidebar-hover": "#1E293B",
      },
      boxShadow: {
        panel: "none",
      },
      backgroundImage: {
        "hero-grid":
          "linear-gradient(rgba(27,79,187,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(27,79,187,0.06) 1px, transparent 1px)",
      },
      borderRadius: {
        none: "0px",
        sm: "0px",
        DEFAULT: "0px",
        md: "0px",
        lg: "0px",
        xl: "0px",
        "2xl": "0px",
        "3xl": "0px",
        full: "0px",
      },
    },
  },
  plugins: [],
};

export default config;
