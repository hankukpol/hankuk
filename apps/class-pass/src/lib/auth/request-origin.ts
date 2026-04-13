import { NextRequest, NextResponse } from 'next/server'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function firstHeaderValue(value: string | null): string | null {
  if (!value) {
    return null
  }

  const normalized = value.split(',')[0]?.trim()
  return normalized ? normalized : null
}

function getExpectedOrigin(req: NextRequest): string {
  const protocol =
    firstHeaderValue(req.headers.get('x-forwarded-proto'))
    ?? req.nextUrl.protocol.replace(/:$/, '')
  const host =
    firstHeaderValue(req.headers.get('x-forwarded-host'))
    ?? firstHeaderValue(req.headers.get('host'))
    ?? req.nextUrl.host

  return `${protocol}://${host}`
}

function parseOrigin(value: string | null): string | null {
  if (!value) {
    return null
  }

  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

export function validateSameOriginRequest(req: NextRequest): NextResponse | null {
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    return null
  }

  const expectedOrigin = getExpectedOrigin(req)
  const requestOrigin =
    parseOrigin(req.headers.get('origin'))
    ?? parseOrigin(req.headers.get('referer'))

  if (!requestOrigin || requestOrigin !== expectedOrigin) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 })
  }

  return null
}
