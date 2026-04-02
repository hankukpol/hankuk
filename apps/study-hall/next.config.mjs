/** @type {import('next').NextConfig} */
const externalPackages = ["@prisma/client", "prisma", "exceljs"];
const isProduction = process.env.NODE_ENV === "production";

const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: externalPackages,
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities",
      "date-fns",
    ],
  },
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },
  images: {
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      {
        source: "/_next/static/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: isProduction
              ? "public, max-age=31536000, immutable"
              : "no-store, max-age=0, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
