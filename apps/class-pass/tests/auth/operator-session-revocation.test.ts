import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { after, beforeEach, describe, it } from 'node:test'
import { SignJWT } from 'jose'
import { NextRequest } from 'next/server'
import { normalizeTenantType } from '../../src/lib/tenant'
import type { StaffJwtPayload } from '../../src/types/database'

type Role = 'admin' | 'staff'
type Scope = 'branch_admin' | 'staff' | 'super_admin'
type AuthModule = typeof import('../../src/lib/auth/authenticate')
type AuthResult = Awaited<ReturnType<AuthModule['authenticateAdminRequest']>> & { actingRole?: Role | null }

const require = createRequire(import.meta.url)
const Module = require('node:module')
const originalLoad = Module._load
const originalSecret = process.env.JWT_SECRET
const testSecret = 'class-pass-auth-regression-test-secret-not-for-production'
const policeTenant = normalizeTenantType('police')!
process.env.JWT_SECRET = testSecret

const state = {
  versions: { admin: 1, staff: 1 },
  validSessions: new Set<string>(),
}

// Keep JWT verification, cookie/header parsing, origin checks and authentication real.
// These three dependencies otherwise access a live database or request-scoped tenant state.
Module._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === '@/lib/auth/operator-sessions') {
    return {
      validateOperatorSession: async (payload: StaffJwtPayload, expected: { scope: Scope; division?: string }) => {
        if (!state.validSessions.has(`${payload.sub}:${expected.scope}:${expected.division ?? ''}`)) return null
        return { session: { id: payload.sub }, account: { is_active: true }, membership: { is_active: true } }
      },
    }
  }
  if (request === '@/lib/auth/session-version') {
    return { DEFAULT_SESSION_VERSION: 1, getSessionVersion: async (role: Role) => state.versions[role] }
  }
  if (request === '@/lib/tenant.server') return { getServerTenantType: async () => 'police' }
  return originalLoad.call(this, request, parent, isMain)
}

const authModule = import('../../src/lib/auth/authenticate')

beforeEach(() => {
  state.versions = { admin: 1, staff: 1 }
  state.validSessions.clear()
})

after(async () => {
  await authModule
  Module._load = originalLoad
  if (originalSecret === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = originalSecret
})

const endpoints = [
  { name: 'admin API', method: 'authenticateAdminRequest', role: 'admin', actingRole: undefined },
  { name: 'staff API with staff credential', method: 'authenticateStaffRequest', role: 'staff', actingRole: 'staff' },
  { name: 'staff API with admin credential', method: 'authenticateStaffRequest', role: 'admin', actingRole: 'admin' },
] as const

for (const endpoint of endpoints) {
  describe(endpoint.name, () => {
    it('does not use unsigned legacy metadata as a credential without a cookie', async () => {
      const req = await makeRequest(endpoint.role, legacyPayload(endpoint.role), 'verified-header')
      assertUnauthorized(await (await authModule)[endpoint.method](req))
    })

    it('ignores unsigned metadata when a valid signed cookie identifies another session', async () => {
      const req = await makeRequest(endpoint.role, legacyPayload(endpoint.role))
      req.headers.set(`x-hankuk-verified-${endpoint.role}`, encodeURIComponent(JSON.stringify({
        ...legacyPayload(endpoint.role), sub: 'untrusted-metadata-session',
      })))
      const result: AuthResult = await (await authModule)[endpoint.method](req)
      assert.equal(result.error, null)
      assert.equal(result.payload?.sub, 'legacy-session')
      assert.equal(result.actingRole, endpoint.actingRole)
    })

    it('does not let unsigned legacy metadata replace a revoked signed modern session', async () => {
      const req = await makeRequest(endpoint.role, modernPayload(endpoint.role))
      req.headers.set(`x-hankuk-verified-${endpoint.role}`, encodeURIComponent(JSON.stringify(legacyPayload(endpoint.role))))
      assertUnauthorized(await (await authModule)[endpoint.method](req))
    })

    it('keeps genuine signed legacy cookie names compatible', async () => {
      const req = new NextRequest('http://localhost/api/protected')
      req.cookies.set(`${endpoint.role}_token`, await signPayload(legacyPayload(endpoint.role)))
      const result: AuthResult = await (await authModule)[endpoint.method](req)
      assert.equal(result.error, null)
      assert.equal(result.payload?.sub, 'legacy-session')
      assert.equal(result.actingRole, endpoint.actingRole)
    })

    it('rejects cookies whose signature does not match the application key', async () => {
      const req = new NextRequest('http://localhost/api/protected')
      const token = await new SignJWT({ ...legacyPayload(endpoint.role) })
        .setProtectedHeader({ alg: 'HS256' })
        .sign(new TextEncoder().encode('different-unit-test-key-not-for-production'))
      req.cookies.set(`cp_${endpoint.role}__police`, token)
      assertUnauthorized(await (await authModule)[endpoint.method](req))
    })

    for (const transport of ['cookie', 'verified-header'] as const) {
      it(`rejects a revoked modern session from ${transport} even when the legacy version is still 1`, async () => {
        const payload = modernPayload(endpoint.role)
        const req = await makeRequest(endpoint.role, payload, transport)
        const result = await (await authModule)[endpoint.method](req)
        assertUnauthorized(result)
      })
    }

    it('accepts a valid modern session independently of legacy version rotation', async () => {
      state.versions = { admin: 99, staff: 99 }
      const payload = modernPayload(endpoint.role)
      allowSession(payload, endpoint.role === 'admin' ? 'branch_admin' : 'staff')
      const result = await authenticate(endpoint.method, endpoint.role, payload)
      assert.equal(result.error, null)
      assert.equal(result.payload?.sub, 'operator-session')
      assert.equal(result.actingRole, endpoint.actingRole)
    })

    for (const [label, claims] of [
      ['account ID only', { accountId: 41 }],
      ['null account ID', { accountId: null }],
      ['zero account ID', { accountId: 0 }],
      ['membership ID only', { membershipId: 51 }],
      ['null membership ID', { membershipId: null }],
      ['credential version only', { credentialVersion: 2 }],
      ['null credential version', { credentialVersion: null }],
      ['modern scope only', { sessionScope: endpoint.role === 'admin' ? 'branch_admin' : 'staff' }],
      ['null scope', { sessionScope: null }],
      ['empty scope', { sessionScope: '' }],
      ['unknown scope', { sessionScope: 'unknown' }],
      ['branch slug only', { branchSlug: 'police' }],
      ['shared user ID only', { sharedUserId: 'shared-user' }],
      ['operator auth method only', { authMethod: 'operator' }],
      ['operator staff auth method only', { authMethod: 'operator_staff' }],
      ['super admin auth method only', { authMethod: 'super_admin' }],
      ['legacy-labelled operator', { sessionScope: 'legacy', accountId: 41 }],
    ] as const) {
      it(`does not downgrade malformed modern claims (${label}) to legacy authentication`, async () => {
        const payload = { ...legacyPayload(endpoint.role), ...claims } as StaffJwtPayload
        assertUnauthorized(await authenticate(endpoint.method, endpoint.role, payload))
      })
    }

    for (const [label, claims] of [
      ['role', { role: endpoint.role === 'admin' ? 'staff' : 'admin' }],
      ['scope', { sessionScope: 'super_admin' }],
      ['division', { division: 'fire' }],
      ['branch slug', { branchSlug: 'fire' }],
    ] as const) {
      it(`rejects a modern ${label} mismatch even when the external session lookup succeeds`, async () => {
        const payload = { ...modernPayload(endpoint.role), ...claims } as StaffJwtPayload
        allowSession(payload, endpoint.role === 'admin' ? 'branch_admin' : 'staff')
        assertUnauthorized(await authenticate(endpoint.method, endpoint.role, payload))
      })
    }

    it('preserves genuine legacy credentials with an omitted version defaulting to 1', async () => {
      const result = await authenticate(endpoint.method, endpoint.role, legacyPayload(endpoint.role))
      assert.equal(result.error, null)
      assert.equal(result.payload?.sub, 'legacy-session')
      assert.equal(result.actingRole, endpoint.actingRole)
    })

    it('preserves explicit legacy scope and current session version', async () => {
      state.versions[endpoint.role] = 2
      const payload = { ...legacyPayload(endpoint.role), sessionScope: 'legacy', sessionVersion: 2 } as StaffJwtPayload
      const result = await authenticate(endpoint.method, endpoint.role, payload)
      assert.equal(result.error, null)
      assert.equal(result.payload?.sub, 'legacy-session')
    })

    it('rejects legacy credentials after their session version is rotated', async () => {
      state.versions[endpoint.role] = 2
      assertUnauthorized(await authenticate(endpoint.method, endpoint.role, legacyPayload(endpoint.role)))
    })

    it('keeps legacy role and division isolation', async () => {
      for (const claims of [{ role: endpoint.role === 'admin' ? 'staff' : 'admin' }, { division: 'fire' }]) {
        const payload = { ...legacyPayload(endpoint.role), ...claims } as StaffJwtPayload
        assertUnauthorized(await authenticate(endpoint.method, endpoint.role, payload))
      }
    })
  })
}

describe('independent admin fallback on staff API', () => {
  for (const adminKind of ['modern', 'legacy'] as const) {
    it(`allows an independently valid ${adminKind} admin credential after rejecting the staff token`, async () => {
      const req = await makeRequest('staff', modernPayload('staff'))
      const admin = adminKind === 'modern' ? modernPayload('admin', 'admin-session') : legacyPayload('admin')
      if (adminKind === 'modern') allowSession(admin, 'branch_admin')
      req.cookies.set('cp_admin__police', await signPayload(admin))
      const result = await (await authModule).authenticateStaffRequest(req)
      assert.equal(result.error, null)
      assert.equal(result.actingRole, 'admin')
      assert.equal(result.payload?.sub, adminKind === 'modern' ? 'admin-session' : 'legacy-session')
    })
  }

  it('does not accept either credential when both modern sessions are revoked', async () => {
    const req = await makeRequest('staff', modernPayload('staff'))
    req.cookies.set('cp_admin__police', await signPayload(modernPayload('admin', 'admin-session')))
    assertUnauthorized(await (await authModule).authenticateStaffRequest(req))
  })
})

describe('other authentication guards', () => {
  it('requires a signed super admin cookie even if metadata names a valid session', async () => {
    const payload = { ...modernPayload('admin'), sessionScope: 'super_admin' } as StaffJwtPayload
    allowSession(payload, 'super_admin', '')
    const req = new NextRequest('http://localhost/api/protected')
    req.headers.set('x-hankuk-verified-super-admin', encodeURIComponent(JSON.stringify(payload)))
    assertUnauthorized(await (await authModule).authenticateSuperAdminRequest(req))
  })

  it('does not let super admin metadata replace a revoked signed session', async () => {
    const valid = { ...modernPayload('admin', 'valid-super-admin'), sessionScope: 'super_admin' } as StaffJwtPayload
    const revoked = { ...modernPayload('admin', 'revoked-super-admin'), sessionScope: 'super_admin' } as StaffJwtPayload
    allowSession(valid, 'super_admin', '')
    const req = new NextRequest('http://localhost/api/protected')
    req.cookies.set('cp_super_admin', await signPayload(revoked))
    req.headers.set('x-hankuk-verified-super-admin', encodeURIComponent(JSON.stringify(valid)))
    assertUnauthorized(await (await authModule).authenticateSuperAdminRequest(req))
  })

  it('still rejects cross-origin writes with a valid modern admin session', async () => {
    const payload = modernPayload('admin')
    allowSession(payload, 'branch_admin')
    const req = new NextRequest('http://localhost/api/protected', {
      method: 'POST',
      headers: { origin: 'https://untrusted.example' },
    })
    req.cookies.set('cp_admin__police', await signPayload(payload))
    const result = await (await authModule).authenticateAdminRequest(req)
    assert.equal(result.payload, null)
    assert.equal(result.error?.status, 403)
  })

  it('preserves valid super admin sessions and rejects revoked ones', async () => {
    const payload = { ...modernPayload('admin'), sessionScope: 'super_admin' } as StaffJwtPayload
    const req = new NextRequest('http://localhost/api/protected')
    req.cookies.set('cp_super_admin', await signPayload(payload))
    allowSession(payload, 'super_admin', '')
    assert.equal((await (await authModule).authenticateSuperAdminRequest(req)).error, null)
    state.validSessions.clear()
    assertUnauthorized(await (await authModule).authenticateSuperAdminRequest(req))
  })
})

function legacyPayload(role: Role): StaffJwtPayload {
  return {
    sub: 'legacy-session', role, division: policeTenant,
    authMethod: role === 'admin' ? 'admin_pin' : 'staff_pin',
    iat: 1_700_000_000, exp: 4_102_444_800,
  }
}

function modernPayload(role: Role, sub = 'operator-session'): StaffJwtPayload {
  return {
    ...legacyPayload(role), sub, accountId: 41, membershipId: 51, credentialVersion: 2,
    branchSlug: policeTenant, sessionScope: role === 'admin' ? 'branch_admin' : 'staff',
    authMethod: role === 'admin' ? 'operator' : 'operator_staff',
  }
}

function allowSession(payload: StaffJwtPayload, scope: Scope, division = 'police') {
  state.validSessions.add(`${payload.sub}:${scope}:${division}`)
}

async function signPayload(payload: StaffJwtPayload) {
  return new SignJWT({ ...payload }).setProtectedHeader({ alg: 'HS256' }).sign(new TextEncoder().encode(testSecret))
}

async function makeRequest(role: Role, payload: StaffJwtPayload, transport: 'cookie' | 'verified-header' = 'cookie') {
  const req = new NextRequest('http://localhost/api/protected')
  if (transport === 'cookie') req.cookies.set(`cp_${role}__police`, await signPayload(payload))
  else req.headers.set(`x-hankuk-verified-${role}`, encodeURIComponent(JSON.stringify(payload)))
  return req
}

async function authenticate(method: 'authenticateAdminRequest' | 'authenticateStaffRequest', role: Role, payload: StaffJwtPayload): Promise<AuthResult> {
  return (await authModule)[method](await makeRequest(role, payload))
}

function assertUnauthorized(result: AuthResult) {
  assert.equal(result.error?.status, 401)
  assert.equal(result.payload, null)
  if ('actingRole' in result) assert.equal(result.actingRole, null)
}
