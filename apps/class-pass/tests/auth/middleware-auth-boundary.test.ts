import assert from 'node:assert/strict'
import { after, it } from 'node:test'
import { SignJWT } from 'jose'
import { NextRequest, type NextResponse } from 'next/server'
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'
import { config, middleware } from '../../src/middleware'

const originalSecret = process.env.JWT_SECRET
const testSecret = 'middleware-defensive-tests-secret-not-for-production'
process.env.JWT_SECRET = testSecret
after(() => {
  if (originalSecret === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = originalSecret
})

const metadataHeaders = {
  'x-hankuk-verified-admin': 'untrusted-metadata',
  'x-hankuk-verified-staff': 'untrusted-metadata',
  'x-hankuk-verified-super-admin': 'untrusted-metadata',
  'x-hankuk-division': 'untrusted-division',
  'x-hankuk-original-pathname': '/untrusted-path',
  'x-request-marker': 'preserve-this',
}

for (const pathname of [
  '/api/materials/7.json',
  '/police/api/materials/7.json',
  '/fire/api/materials/7.json',
  '/daegu-branch/api/materials/7.json',
  '/favicon-ico/api/materials/7.json',
  '/api/distribution/scan.json',
  '/api/super-admin/report.json',
]) {
  it(`includes API paths with file-like suffixes in the matcher: ${pathname}`, () => {
    assert.equal(unstable_doesMiddlewareMatch({ config, url: `http://localhost${pathname}` }), true)
  })

  it(`requires authentication on a file-like protected API path: ${pathname}`, async () => {
    const response = await middleware(new NextRequest(`http://localhost${pathname}`))
    assert.equal(response.status, 401)
  })
}

for (const pathname of ['/images/logo.png', '/_next/static/chunk.js']) {
  it(`strips internal metadata before the static early return: ${pathname}`, async () => {
    const response = await middleware(new NextRequest(`http://localhost${pathname}`, { headers: metadataHeaders }))
    const forwarded = forwardedHeaders(response, new Headers(metadataHeaders))
    assert.equal(response.status, 200)
    assert.equal(forwarded.get('x-request-marker'), 'preserve-this')
    for (const name of Object.keys(metadataHeaders).filter((name) => name !== 'x-request-marker')) {
      assert.equal(forwarded.get(name), null)
    }
  })
}

it('replaces tenant metadata and removes authentication metadata on a public API', async () => {
  const response = await middleware(new NextRequest('http://localhost/police/api/config/app', { headers: metadataHeaders }))
  const forwarded = forwardedHeaders(response)
  assert.equal(response.status, 200)
  assert.equal(forwarded.get('x-hankuk-division'), 'police')
  assert.equal(forwarded.get('x-hankuk-original-pathname'), '/police/api/config/app')
  assert.equal(forwarded.get('x-request-marker'), 'preserve-this')
  for (const name of ['admin', 'staff', 'super-admin']) {
    assert.equal(forwarded.get(`x-hankuk-verified-${name}`), null)
  }
})

it('continues to permit a signed branch cookie on a tenant-prefixed API', async () => {
  const token = await new SignJWT({ sub: 'local-admin', role: 'admin', division: 'police' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(testSecret))
  const req = new NextRequest('http://localhost/police/api/materials/7.json', { headers: metadataHeaders })
  req.cookies.set('cp_admin__police', token)
  const response = await middleware(req)
  assert.equal(response.status, 200)
  assert.equal(new URL(response.headers.get('x-middleware-rewrite')!).pathname, '/api/materials/7.json')
  const forwarded = forwardedHeaders(response)
  assert.equal(forwarded.get('x-hankuk-division'), 'police')
  assert.equal(forwarded.get('x-hankuk-verified-staff'), null)
  assert.equal(forwarded.get('x-hankuk-verified-super-admin'), null)
})

function forwardedHeaders(response: NextResponse, incoming = new Headers()) {
  if (!response.headers.has('x-middleware-override-headers')) return incoming
  const result = new Headers()
  for (const name of (response.headers.get('x-middleware-override-headers') ?? '').split(',').filter(Boolean)) {
    const value = response.headers.get(`x-middleware-request-${name}`)
    if (value !== null) result.set(name, value)
  }
  return result
}
