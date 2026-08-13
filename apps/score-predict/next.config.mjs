const isDev = process.env.NODE_ENV !== "production";
const forceHttps =
  process.env.VERCEL_ENV === "production" || process.env.SCORE_PREDICT_FORCE_HTTPS === "true";

const supabaseOrigin = (() => {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!raw) return "";

  try {
    return new URL(raw).origin;
  } catch {
    return "";
  }
})();

const supabaseImagePattern = (() => {
  if (!supabaseOrigin) return null;
  const url = new URL(supabaseOrigin);
  return {
    protocol: url.protocol.replace(":", ""),
    hostname: url.hostname,
    port: url.port,
    pathname: "/storage/v1/object/public/**",
  };
})();
const usesLocalSupabaseImageHost =
  supabaseImagePattern?.hostname === "127.0.0.1" || supabaseImagePattern?.hostname === "localhost";

const cspDirectives = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  `img-src 'self' data: blob:${supabaseOrigin ? ` ${supabaseOrigin}` : ""}`,
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  `connect-src 'self'${isDev ? " ws: wss:" : ""}${supabaseOrigin ? ` ${supabaseOrigin}` : ""}`,
  "form-action 'self'",
  ...(forceHttps ? ["upgrade-insecure-requests"] : []),
];

const nextConfig = {
  images: supabaseImagePattern
      ? {
        remotePatterns: [supabaseImagePattern],
        dangerouslyAllowLocalIP: isDev || usesLocalSupabaseImageHost,
        qualities: [75, 82],
      }
    : undefined,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: cspDirectives.join("; ") },
          ...(forceHttps
            ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
            : []),
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
