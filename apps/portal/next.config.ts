import type { NextConfig } from 'next'
import { HANKUK_APP_KEYS, getHankukServiceOrigins } from '@hankuk/config'

const isProduction = process.env.NODE_ENV === 'production'

function toOrigin(value: string | undefined) {
  if (!value) {
    return null
  }

  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

const portalBridgeOrigins = Array.from(
  new Set(
    [
      process.env.PORTAL_TARGET_ACADEMY_OPS_URL,
      process.env.PORTAL_TARGET_CLASS_PASS_URL,
      process.env.PORTAL_TARGET_SCORE_PREDICT_URL,
      process.env.PORTAL_TARGET_STUDY_HALL_URL,
      process.env.PORTAL_TARGET_INTERVIEW_PASS_URL,
      ...getHankukServiceOrigins(HANKUK_APP_KEYS.ACADEMY_OPS),
      ...getHankukServiceOrigins(HANKUK_APP_KEYS.CLASS_PASS),
      ...getHankukServiceOrigins(HANKUK_APP_KEYS.SCORE_PREDICT),
      ...getHankukServiceOrigins(HANKUK_APP_KEYS.STUDY_HALL),
      ...getHankukServiceOrigins(HANKUK_APP_KEYS.INTERVIEW_PASS),
    ]
      .map(toOrigin)
      .filter((value): value is string => Boolean(value)),
  ),
)

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  `img-src 'self' data: blob: https:${isProduction ? '' : ' http:'}`,
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${isProduction ? '' : " 'unsafe-eval'"}`,
  `connect-src 'self' https:${isProduction ? '' : ' http:'}`,
  `form-action 'self'${portalBridgeOrigins.length ? ` ${portalBridgeOrigins.join(' ')}` : ''}${isProduction ? '' : ' https: http:'}`,
].join('; ')

const nextConfig: NextConfig = {
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
        ],
      },
      {
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
      {
        source: '/_next/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: isProduction
              ? 'public, max-age=31536000, immutable'
              : 'no-store, max-age=0, must-revalidate',
          },
        ],
      },
    ]
  },
}

export default nextConfig
