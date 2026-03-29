import { NextResponse } from 'next/server'

export const dynamic = 'force-static'

export function GET() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="8" fill="#1a237e" />
      <path d="M16 7l8 4.5v4.5c0 5.2-3.3 9.8-8 11-4.7-1.2-8-5.8-8-11v-4.5L16 7z" fill="#ffffff" />
    </svg>
  `.trim()

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  })
}
