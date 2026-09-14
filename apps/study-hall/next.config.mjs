import { createRequire } from "node:module";
import { dirname } from "node:path";

const require = createRequire(import.meta.url);
const lucidePackageRoot = dirname(require.resolve("lucide-react/package.json"));

/** @type {import('next').NextConfig} */
const externalPackages = ["@prisma/client", "prisma", "exceljs"];
const isProduction = process.env.NODE_ENV === "production";

const nextConfig = {
  // Concurrent local servers must not overwrite each other's build artifacts.
  distDir: process.env.NEXT_DIST_DIR || ".next",
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
  transpilePackages: ["lucide-react"],
  modularizeImports: {
    "lucide-react": {
      transform: "lucide-react/dist/esm/icons/{{kebabCase member}}",
    },
  },
  webpack(config) {
    // Resolve both SSR and browser icons from this app's installed package.
    // Workspace packages can depend on different Lucide icon definitions.
    config.resolve.alias["lucide-react"] = lucidePackageRoot;
    config.plugins.push({ apply(compiler) {
      compiler.hooks.compilation.tap("IconResolutionDiagnostic", (compilation) => {
        compilation.hooks.succeedModule.tap("IconResolutionDiagnostic", (module) => {
          if (module.resource?.includes("/icons/log-in.js")) console.log("Icon resolution", compiler.name, lucidePackageRoot, module.resource);
        });
      });
    } });
    return config;
  },
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
