const DEFAULT_PORTAL_URL =
  process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : 'https://portal.hankukpol.co.kr'

export function getPortalUrl() {
  return (
    process.env.NEXT_PUBLIC_PORTAL_URL ??
    process.env.PORTAL_URL ??
    DEFAULT_PORTAL_URL
  ).replace(/\/+$/, '')
}
