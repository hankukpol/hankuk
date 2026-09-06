import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { after, beforeEach, test } from 'node:test'
import bcrypt from 'bcryptjs'
import { NextRequest } from 'next/server'
import type { StaffJwtPayload } from '../../src/types/database'
import { normalizeTenantType } from '../../src/lib/tenant'

const require = createRequire(import.meta.url)
const Module = require('node:module')
const originalLoad = Module._load
const originalFetch = globalThis.fetch
const savedEnv = { JWT_SECRET: process.env.JWT_SECRET, NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY }
process.env.JWT_SECRET = 'stored-staff-regression-only-not-a-production-key'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://staff-db.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-test-service-key'

type Row = Record<string, unknown>
const pinHash = bcrypt.hashSync('1234', 4)
const otherHash = bcrypt.hashSync('5678', 4)
const policeTenant = normalizeTenantType('police')!
const cache = new Map<string, unknown>()
const state = {
  tenant: 'police', versions: { staff: 1, admin: 1 },
  tables: {} as Record<string, Row[]>,
  missingTable: false, dbError: false, networkError: false,
}
const operatorAccount = {
  id: 91, login_id: 'operator-fixture', display_name: '운영직원', pin_hash: pinHash,
  credential_version: 1, is_active: true, shared_user_id: null,
  memberships: [{ id: 92, role: 'STAFF', is_active: true, branch_id: 1, branch: { id: 1, slug: 'police', is_active: true } }],
}

// Use the real Supabase client/query builder, PIN hashing, JWTs, account APIs,
// session route and authentication. Only HTTP storage and Next request/cache
// infrastructure are replaced; no network or persistent writes are possible.
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  assert.equal(url.origin, 'http://staff-db.test', 'unexpected network access is forbidden')
  const table = url.pathname.replace('/rest/v1/', '')
  assert.ok(table in state.tables, `unexpected table: ${table}`)
  const method = init?.method ?? 'GET'
  if (table === 'staff_accounts' && state.networkError) throw new Error('synthetic network failure')
  if (table === 'staff_accounts' && (state.missingTable || state.dbError)) {
    return Response.json({ code: state.missingTable ? '42P01' : '42501', message: state.missingTable ? 'relation staff_accounts does not exist' : 'permission denied', details: null, hint: null }, { status: 400 })
  }
  const filters = [...url.searchParams].filter(([key]) => !['select', 'order', 'limit'].includes(key))
  const matches = (row: Row) => filters.every(([key, value]) => {
    assert.ok(value.startsWith('eq.'), `unsupported filter ${key}=${value}`)
    return String(row[key]) === value.slice(3)
  })
  let rows = state.tables[table].filter(matches)
  if (method === 'PATCH') {
    const patch = JSON.parse(String(init?.body))
    rows.forEach((row) => Object.assign(row, patch))
  } else if (method === 'DELETE') {
    state.tables[table] = state.tables[table].filter((row) => !matches(row))
  } else if (method === 'POST') {
    const row = JSON.parse(String(init?.body))
    state.tables[table].push(row)
    rows = [row]
  } else assert.equal(method, 'GET')
  const select = url.searchParams.get('select')?.split(',').map((key) => key.trim())
  const result = rows.map((row) => select ? Object.fromEntries(select.map((key) => [key, row[key]])) : { ...row })
  const single = new Headers(init?.headers).get('accept')?.includes('vnd.pgrst.object+json')
  return Response.json(single ? result[0] ?? null : result)
}
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === '@/lib/tenant.server') return { getServerTenantType: async () => state.tenant }
  if (request === '@/lib/auth/session-version') return { DEFAULT_SESSION_VERSION: 1, getSessionVersion: async (role: 'staff' | 'admin') => state.versions[role] }
  if (request === '@/lib/auth/rateLimiter') return { checkRateLimit: async () => ({ allowed: true }), resetRateLimit: async () => {}, getClientIp: () => '127.0.0.1' }
  if (request === 'next/cache') return {
    unstable_cache: (fn: (...args: unknown[]) => Promise<unknown>) => async (...args: unknown[]) => {
      const key = JSON.stringify(args)
      if (!cache.has(key)) cache.set(key, await fn(...args))
      return cache.get(key)
    },
    // Simulate a stale worker's existing cache: security must not depend on invalidation.
    revalidateTag: () => {},
  }
  if (request === '@/lib/branch-ops') return {
    getOperatorAccountWithMembershipsByLoginId: async (id: string) => id === operatorAccount.login_id ? operatorAccount : null,
    verifyOperatorPin: bcrypt.compare,
    listOperatorAccounts: async () => [operatorAccount],
    getBranchBySlug: async () => ({ id: 1, slug: 'police' }),
  }
  return originalLoad.call(this, request, parent, isMain)
}
const loginRoute = require('../../src/app/api/auth/staff/login/route') as typeof import('../../src/app/api/auth/staff/login/route')
const sessionRoute = require('../../src/app/api/auth/staff/session/route') as typeof import('../../src/app/api/auth/staff/session/route')
const accountRoute = require('../../src/app/api/staff-accounts/route') as typeof import('../../src/app/api/staff-accounts/route')
const { signJwt, verifyJwt } = require('../../src/lib/auth/jwt') as typeof import('../../src/lib/auth/jwt')

beforeEach(() => {
  state.tenant = 'police'
  state.versions = { staff: 1, admin: 1 }
  state.missingTable = false
  state.dbError = false
  state.networkError = false
  cache.clear()
  state.tables = {
    staff_accounts: [
      { id: 'staff-a', division: 'police', name: '직원 A', pin_hash: pinHash, created_at: '2026-01-01' },
      { id: 'staff-b', division: 'police', name: '직원 B', pin_hash: otherHash, created_at: '2026-01-01' },
      { id: 'staff-a', division: 'fire', name: '직원 A', pin_hash: pinHash, created_at: '2026-01-01' },
    ],
    app_config: [{ key: 'police::staff_pin_hash', value: pinHash }, { key: 'police::admin_id', value: 'fixture-admin' }],
    operator_sessions: [],
  }
})
after(() => {
  Module._load = originalLoad
  globalThis.fetch = originalFetch
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

async function login(loginId = 'staff-a', pin = '1234') {
  return loginRoute.POST(new NextRequest('http://localhost/api/auth/staff/login', { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify({ loginId, pin }) }))
}
async function tokenFor(loginId = 'staff-a', pin = '1234') {
  const response = await login(loginId, pin)
  assert.equal(response.status, 200)
  const token = response.cookies.get(`cp_staff__${state.tenant}`)?.value
  assert.ok(token)
  return token
}
function checkSession(token?: string) {
  const req = new NextRequest('http://localhost/api/auth/staff/session')
  if (token) req.cookies.set(`cp_staff__${state.tenant}`, token)
  return sessionRoute.GET(req)
}
async function mutateAccount(method: 'PATCH' | 'DELETE', body: Row) {
  const req = new NextRequest('http://localhost/api/staff-accounts', { method, headers: { origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify(body) })
  req.cookies.set(`cp_admin__${state.tenant}`, await signJwt('admin', 'fixture-admin-session', { division: state.tenant as StaffJwtPayload['division'], authMethod: 'admin_pin', sessionVersion: 1 }))
  return accountRoute[method](req)
}
async function resign(token: string, changes: Row) {
  const payload = await verifyJwt(token)
  assert.ok(payload)
  const { role, sub, iat, exp, ...claims } = payload
  void iat; void exp
  return signJwt(role, sub, { ...claims, ...changes } as Parameters<typeof signJwt>[2])
}

test('stored login binds an opaque credential and stable account ID without exposing PIN or PIN hash', async () => {
  const response = await login()
  const cookie = response.cookies.get('cp_staff__police')
  assert.ok(cookie)
  const payload = await verifyJwt(cookie.value) as StaffJwtPayload & Row
  assert.equal(payload.authMethod, 'stored_staff')
  assert.equal(payload.storedStaffAccountId, 'staff-a')
  assert.match(String(payload.storedStaffCredential), /^[A-Za-z0-9_-]{43}$/)
  const clientVisible = JSON.stringify({ payload, body: await response.json() })
  assert.ok(!clientVisible.includes(pinHash))
  assert.ok(!clientVisible.includes('"1234"'))
  assert.equal((await checkSession(cookie.value)).status, 200)
})

test('deleting a stored account through its real API immediately rejects an already-used cookie only for that account', async () => {
  const token = await tokenFor()
  const other = await tokenFor('staff-b', '5678')
  assert.equal((await checkSession(token)).status, 200)
  assert.equal((await mutateAccount('DELETE', { id: 'staff-a' })).status, 200)
  assert.equal((await checkSession(token)).status, 401)
  assert.equal((await checkSession(other)).status, 200)
})

test('PIN reset through the real API rejects old cookies and old PIN while permitting new login and other staff', async () => {
  const token = await tokenFor()
  const other = await tokenFor('staff-b', '5678')
  assert.equal((await checkSession(token)).status, 200)
  const changed = await mutateAccount('PATCH', { id: 'staff-a', pin: '9876' })
  assert.equal(changed.status, 200)
  assert.ok(!JSON.stringify(await changed.json()).includes('pin_hash'))
  assert.equal((await checkSession(token)).status, 401)
  assert.equal((await login('staff-a', '1234')).status, 401)
  assert.equal((await checkSession(await tokenFor('staff-a', '9876'))).status, 200)
  assert.equal((await checkSession(other)).status, 200)
})

test('a rename revokes the old name-bearing session and permits the updated account', async () => {
  const token = await tokenFor()
  assert.equal((await mutateAccount('PATCH', { id: 'staff-a', name: '직원 새이름' })).status, 200)
  assert.equal((await checkSession(token)).status, 401)
  assert.equal((await checkSession(await tokenFor())).status, 200)
})

test('an absent stored row cannot be revived by an app_config copy', async () => {
  const token = await tokenFor()
  state.tables.app_config.push({ key: 'police::staff_accounts', value: JSON.stringify(state.tables.staff_accounts) })
  state.tables.staff_accounts = []
  assert.equal((await checkSession(token)).status, 401)
})

test('tenant mismatch cannot borrow an identical account ID, name and PIN hash from another tenant', async () => {
  const token = await tokenFor()
  state.tenant = 'fire'
  assert.equal((await checkSession(token)).status, 401)
  assert.equal((await checkSession(await resign(token, { division: 'fire' }))).status, 401)
})

for (const fault of ['dbError', 'networkError'] as const) {
  test(`stored-session lookup fails closed on ${fault}, even after a successful validation`, async () => {
    const token = await tokenFor()
    assert.equal((await checkSession(token)).status, 200)
    state[fault] = true
    assert.equal((await checkSession(token)).status, 401)
  })
}

test('old unbound stored-account cookies require relogin even while that named account still exists', async () => {
  const old = await signJwt('staff', 'old-unbound-session', { division: policeTenant, authMethod: 'staff_pin', staffName: '직원 A', sessionVersion: 1 })
  assert.equal((await checkSession(old)).status, 401)
})

for (const [name, changes] of [
  ['missing account ID', { storedStaffAccountId: undefined }],
  ['null account ID', { storedStaffAccountId: null }],
  ['empty account ID', { storedStaffAccountId: '' }],
  ['numeric account ID', { storedStaffAccountId: 1 }],
  ['different account ID', { storedStaffAccountId: 'staff-b' }],
  ['missing binding', { storedStaffCredential: undefined }],
  ['null binding', { storedStaffCredential: null }],
  ['wrong binding', { storedStaffCredential: 'a'.repeat(43) }],
  ['legacy auth method', { authMethod: 'staff_pin' }],
  ['missing name', { staffName: undefined }],
  ['wrong name', { staffName: '직원 B' }],
  ['modern account marker', { accountId: 91 }],
] as const) {
  test(`malformed stored claims (${name}) cannot fall back to shared-PIN authentication`, async () => {
    const token = await tokenFor()
    assert.equal((await checkSession(await resign(token, { authMethod: 'stored_staff', ...changes }))).status, 401)
  })
}

test('stored markers on a name-less legacy token cannot fall back to shared PIN', async () => {
  const token = await signJwt('staff', 'marker-only', { division: policeTenant, authMethod: 'staff_pin', storedStaffAccountId: null } as unknown as Parameters<typeof signJwt>[2])
  assert.equal((await checkSession(token)).status, 401)
})

test('stored sessions still require the current common staff session version', async () => {
  const token = await tokenFor()
  state.versions.staff = 2
  assert.equal((await checkSession(token)).status, 401)
})

test('shared PIN remains supported and its old cookies still honor session version rotation', async () => {
  const token = await tokenFor('', '1234')
  assert.equal((await checkSession(token)).status, 200)
  await mutateAccount('DELETE', { id: 'staff-a' })
  assert.equal((await checkSession(token)).status, 200)
  state.versions.staff = 2
  assert.equal((await checkSession(token)).status, 401)
})

test('real modern operator-session login and validation remain independent of stored staff deletion and rotation', async () => {
  const token = await tokenFor('operator-fixture')
  assert.equal((await checkSession(token)).status, 200)
  await mutateAccount('DELETE', { id: 'staff-a' })
  state.versions.staff = 9
  assert.equal((await checkSession(token)).status, 200)
})

test('legacy app_config-backed accounts are checked uncached when the staff table is intentionally absent', async () => {
  state.missingTable = true
  state.tables.app_config.push({ key: 'police::staff_accounts', value: JSON.stringify(state.tables.staff_accounts.filter((row) => row.division === 'police')), updated_at: '2026-01-01' })
  const token = await tokenFor()
  assert.equal((await checkSession(token)).status, 200)
  assert.equal((await mutateAccount('DELETE', { id: 'staff-a' })).status, 200)
  assert.equal((await checkSession(token)).status, 401)
})

test('no-cookie and invalid-signature requests never authenticate', async () => {
  assert.equal((await checkSession()).status, 401)
  assert.equal((await checkSession('not.a.token')).status, 401)
})
