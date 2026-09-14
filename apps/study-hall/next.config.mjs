import { createRequire } from "node:module";
import { dirname, join } from "node:path";

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
  webpack(config, { webpack }) {
    // Resolve both SSR and browser icons from this app's installed package.
    // Workspace packages can depend on different Lucide icon definitions.
    config.resolve.alias["lucide-react"] = lucidePackageRoot;
    // Next's server entry loader can supply an already-resolved absolute path
    // from another workspace's Lucide version, bypassing the package alias.
    config.plugins.push(new webpack.NormalModuleReplacementPlugin(
      /[\\/]node_modules[\\/]lucide-react[\\/]/,
      (resource) => {
        const request = resource.createData?.resource ?? resource.request;
        const subpath = request.match(/[\\/]node_modules[\\/]lucide-react[\\/](.+)$/)?.[1];
        if (!subpath) return;
        const pinned = join(lucidePackageRoot, ...subpath.split(/[\\/]/));
        if (resource.createData) {
          resource.createData.resource = pinned;
          resource.createData.context = dirname(pinned);
        } else resource.request = pinned;
      },
    ));
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
