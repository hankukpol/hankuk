import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { generateQrToken } from '../../src/lib/qr/token'
const require = createRequire(import.meta.url)
const { JSDOM } = require('../_setup/dom.cjs')

test('student page refreshes snapshots and rotates QR before token expiry without overlapping reads', async () => {
  const priorSecret = process.env.QR_HMAC_SECRET
  let token: string
  try {
    process.env.QR_HMAC_SECRET = 'local-only-student-material-freshness-fixture'
    token = await generateQrToken(8, 7)
  } finally {
    if (priorSecret === undefined) delete process.env.QR_HMAC_SECRET
    else process.env.QR_HMAC_SECRET = priorSecret
  }
  const signedTokenPayload = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'))
  const tokenLifetimeMs = signedTokenPayload.exp - signedTokenPayload.ts
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/police/courses/fixture?enrollmentId=8', pretendToBeVisual: true })
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, sessionStorage: dom.window.sessionStorage,
    HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
  sessionStorage.setItem('class_pass_student_name', '학생')
  sessionStorage.setItem('class_pass_student_phone', '01000000000')
  const Module = require('node:module'), original = Module._load
  const originalInterval = globalThis.setInterval, originalClear = globalThis.clearInterval
  const timers = new Map<number, { run: () => void; ms: number }>()
  let timerId = 0, requests = 0, resolveNext: ((value: Response) => void) | null = null
  let enrollmentId = 8, courseSlug = 'fixture'
  let snapshot: any = {
    course: { id: 7, slug: 'fixture', name: '자료 강좌', feature_qr_pass: false, feature_qr_distribution: true },
    enrollment: { id: 8, course_id: 7, name: '학생', phone: '01000000000', status: 'active' },
    appConfig: { app_name: '학원' }, materials: [], textbooks: [], receipts: {}, textbookReceipts: {}, seatAssignments: [], subjects: [],
    attendance: { enabled: false }, designatedSeat: { enabled: false }, qrToken: null,
  }
  const router = { push() {}, replace() {} }
  Module._load = function (id: string, parent: unknown, isMain: boolean) {
    if (id === 'next/navigation') return { useParams: () => ({ courseSlug }), useSearchParams: () => new URLSearchParams(`enrollmentId=${enrollmentId}`), useRouter: () => router }
    if (id === '@/lib/student-session') return { fetchStudentApi: async (_tenant: string, url: string, init: RequestInit) => {
      requests++
      assert.equal(url, '/police/api/enrollments/pass', 'refresh must use full authoritative snapshot, not receipts-only')
      assert.equal(JSON.parse(String(init.body)).enrollmentId, enrollmentId)
      assert.equal(JSON.parse(String(init.body)).courseSlug, courseSlug)
      if (requests === 1) return Response.json(snapshot)
      return new Promise<Response>(resolve => { resolveNext = resolve })
    } }
    return original.call(this, id, parent, isMain)
  }
  globalThis.setInterval = ((run: () => void, ms: number) => { timers.set(++timerId, { run, ms }); return timerId }) as unknown as typeof setInterval
  globalThis.clearInterval = ((id: number) => timers.delete(id)) as unknown as typeof clearInterval
  const { act, createElement } = require('react'), { createRoot } = require('react-dom/client')
  const { TenantProvider } = require('../../src/components/TenantProvider'), { buildFallbackTenantConfig } = require('../../src/lib/tenant')
  const Page = require('../../src/app/(student)/courses/[courseSlug]/page').default
  const root = createRoot(document.getElementById('root')!)
  const tick = async () => act(async () => { for (const timer of timers.values()) if (timer.ms > 1000) timer.run() })
  const receive = async () => act(async () => { assert.ok(resolveNext); resolveNext(Response.json(snapshot)); resolveNext = null })
  const render = () => root.render(createElement(TenantProvider, { tenantConfig: buildFallbackTenantConfig('police'), children: createElement(Page) }))
  try {
    await act(async () => render())
    await tick()
    assert.equal(requests, 2, 'zero materials must still revalidate')
    await tick()
    await act(async () => document.dispatchEvent(new dom.window.Event('visibilitychange')))
    assert.equal(requests, 2, 'return and timer share one in-flight read')
    snapshot = { ...snapshot, materials: [{ id: 91, name: '새 배부자료' }], textbooks: [{ id: 92, name: '새 교재' }], receipts: { 91: '2026-09-06T00:00:00Z' }, textbookReceipts: { 92: '2026-09-06T00:00:00Z' } }
    await receive()
    assert.match(document.body.textContent ?? '', /새 교재/)
    await tick()
    assert.equal(requests, 3, 'all received must still revalidate')
    snapshot = { ...snapshot, receipts: {}, textbookReceipts: {}, seatAssignments: [{ subject_id: 3, seat_number: 'A12' }], subjects: [{ id: 3, name: '경찰학' }] }
    await receive()
    assert.match(document.body.textContent ?? '', /A12/)
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    await tick()
    assert.equal(requests, 3, 'hidden page does not poll')
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    await act(async () => document.dispatchEvent(new dom.window.Event('visibilitychange')))
    assert.equal(requests, 4, 'return revalidates even with QR disabled')
    await act(async () => { resolveNext!(Response.json({ error: 'temporary failure' }, { status: 500 })); resolveNext = null })
    assert.match(document.body.textContent ?? '', /A12/, 'refresh failure retains last authoritative view')
    await tick()
    assert.equal(requests, 5, 'failed read does not stop later refresh')
    const priorCourseResponse = resolveNext!
    enrollmentId = 9
    courseSlug = 'other-course'
    await act(async () => render())
    assert.equal(requests, 6, 'course navigation starts its own guarded snapshot')
    snapshot = { ...snapshot, enrollment: { ...snapshot.enrollment, id: 9 }, course: { ...snapshot.course, name: '새 강좌', feature_qr_pass: true }, qrToken: 'fresh-token' }
    await receive()
    assert.match(document.body.textContent ?? '', /새 강좌/)
    await act(async () => priorCourseResponse(Response.json({ ...snapshot, course: { ...snapshot.course, name: '이전 강좌 지연 응답' } })))
    assert.doesNotMatch(document.body.textContent ?? '', /이전 강좌 지연 응답/)
    const qrBefore = document.querySelector('svg')?.outerHTML
    assert.ok(qrBefore, 'QR pass is still rendered')
    const snapshotTimers = Array.from(timers.values()).filter(timer => timer.ms > 1000)
    assert.ok(snapshotTimers.length > 0, 'the mounted QR page registers an automatic snapshot timer')
    assert.ok(snapshotTimers.every(timer => timer.ms > 0 && timer.ms < tokenLifetimeMs),
      'snapshot polling must run before the actual generated QR token expires')
    await tick()
    snapshot = { ...snapshot, qrToken: 'rotated-token' }
    await receive()
    assert.notEqual(document.querySelector('svg')?.outerHTML, qrBefore, 'full snapshot rotates QR token')
    await tick()
    sessionStorage.setItem('class_pass_student_name', '다른 학생')
    snapshot = { ...snapshot, course: { ...snapshot.course, name: '오래된 응답' } }
    await receive()
    assert.doesNotMatch(document.body.textContent ?? '', /오래된 응답/, 'changed student identity rejects prior request completion')
    assert.doesNotMatch(document.body.textContent ?? '', /새 강좌/, 'changed student identity clears the prior private snapshot')
  } finally { await act(async () => root.unmount()); Module._load = original; globalThis.setInterval = originalInterval; globalThis.clearInterval = originalClear; dom.window.close() }
})
