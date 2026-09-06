import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { JSDOM } = require('../_setup/dom.cjs')

test('real seat components preserve user intent across blur and response loss', async (t) => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/police/courses/test/designated-seat?enrollmentId=1', pretendToBeVisual: true })
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, sessionStorage: dom.window.sessionStorage, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, HTMLInputElement: dom.window.HTMLInputElement, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
  Object.defineProperty(dom.window, 'matchMedia', { value: () => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }) })
  const Module = require('node:module')
  const originalLoad = Module._load, originalFetch = globalThis.fetch
  const router = { push() {}, replace() {}, refresh() {} }
  const params = { id: '8', courseSlug: 'test' }, searchParams = new URLSearchParams('enrollmentId=1')
  Module._load = function(request: string, parent: unknown, isMain: boolean) {
    if (request === 'next/navigation') return { useParams: () => params, useRouter: () => router, useSearchParams: () => searchParams }
    return originalLoad.call(this, request, parent, isMain)
  }
  const { act, createElement } = require('react') as typeof import('react')
  const { createRoot } = require('react-dom/client') as typeof import('react-dom/client')
  const AdminSeats = require('../../src/app/(admin)/dashboard/courses/[id]/seats/course-seats-page-client').default
  const StudentSeats = require('../../src/app/(student)/courses/[courseSlug]/designated-seat/page').default
  const { TenantProvider } = require('../../src/components/TenantProvider')
  const { buildFallbackTenantConfig } = require('../../src/lib/tenant')
  const course = { id: 8, name: '좌석 검증', slug: 'test', theme_color: '#0071e3' }
  const subject = { id: 2, course_id: 8, name: '형사법', sort_order: 1 }
  const enrollment = { id: 1, course_id: 8, name: '검증학생', phone: '01000000001', exam_number: 'T1', status: 'active' }
  const assignment = (value: string) => ({ id: 3, course_id: 8, enrollment_id: 1, subject_id: 2, seat_number: value, course_subjects: subject })
  const seat = { id: 7, layout_id: 5, label: 'A-7', position_x: 1, position_y: 1, is_active: true }
  const studentState = (reserved = false) => ({ enabled: true, open: true, verified: !reserved, writable: !reserved, requires_reauth: reserved, restriction_reason: null, active_room_id: 4, rooms: [{ id: 4, name: '1강의실', is_open: true }], layout: { id: 5, rows: 1, columns: 1, aisle_columns: [] }, seats: [seat], occupied_seat_ids: reserved ? [7] : [], reservation: reserved ? { id: 9, seat_id: 7, room_id: 4, seat } : null })
  let root: ReturnType<typeof createRoot> | undefined
  let serverSeat = 'A-1', reserved = false, mode = 'deferred', writes = 0, reads = 0, refreshFails = false, refreshMalformed = false
  let pending: Array<{ value: string; resolve: (response: Response) => void }> = []
  let seatReadUrls: string[] = []
  let delayInitialSeatRead = false
  let finishInitialSeatRead: (() => void) | undefined
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url === '/api/seats' && init?.method === 'PATCH') {
      writes++
      const body = JSON.parse(String(init.body))
      assert.deepEqual({ courseId: body.courseId, enrollmentId: body.enrollmentId, subjectId: body.subjectId }, { courseId: 8, enrollmentId: 1, subjectId: 2 })
      if (mode === 'deferred') return new Promise(resolve => pending.push({ value: body.seatNumber ?? '', resolve }))
      serverSeat = body.seatNumber ?? ''
      if (mode === 'network') throw new TypeError('Failed to fetch')
      if (mode === 'post-commit-500') return Response.json({ error: 'Read after commit failed' }, { status: 500 })
      return new Response('lost JSON', { status: 200 })
    }
    if (url === '/police/api/designated-seats/reserve') {
      writes++
      assert.equal(init?.credentials, 'same-origin', 'real student-session fetch stays in use')
      assert.equal(JSON.parse(String(init?.body)).seatId, 7)
      reserved = true
      if (mode === 'network') throw new TypeError('Failed to fetch')
      if (mode === 'post-commit-500') return Response.json({ error: 'Read after commit failed' }, { status: 500 })
      return new Response('lost JSON', { status: 200 })
    }
    if (url === '/police/api/designated-seats/state') {
      reads++
      if (refreshFails) throw new TypeError('Refresh unavailable')
      return Response.json({ state: studentState(reserved) })
    }
    if (url === '/police/api/enrollments/pass') return Response.json({ course, enrollment, designatedSeat: studentState(reserved) })
    if (url.startsWith('/api/courses/')) return Response.json({ course })
    if (url.startsWith('/api/enrollments?')) return Response.json({ enrollments: [enrollment] })
    if (url.startsWith('/api/seats?')) {
      seatReadUrls.push(url)
      reads++
      if (delayInitialSeatRead && reads === 1) {
        const snapshot = { subjects: [subject], seatAssignments: [assignment(serverSeat)] }
        return new Promise(resolve => { finishInitialSeatRead = () => resolve(Response.json(snapshot)) })
      }
      if (refreshFails) throw new TypeError('Refresh unavailable')
      if (refreshMalformed) return Response.json({ subjects: [subject] })
      return Response.json({ subjects: [subject], seatAssignments: serverSeat ? [assignment(serverSeat)] : [] })
    }
    throw new Error(`Unexpected request: ${url}`)
  }
  const mount = async (student = false, withInitialData = false) => {
    serverSeat = 'A-1'; reserved = false; writes = 0; reads = 0; pending = []; seatReadUrls = []; refreshFails = false; refreshMalformed = false
    delayInitialSeatRead = withInitialData; finishInitialSeatRead = undefined
    sessionStorage.setItem('class_pass_student_name', enrollment.name); sessionStorage.setItem('class_pass_student_phone', enrollment.phone)
    root = createRoot(document.getElementById('root')!)
    await act(async () => root!.render(createElement(TenantProvider, { tenantConfig: buildFallbackTenantConfig('police'), children: createElement(student ? StudentSeats : AdminSeats, withInitialData ? { initialData: { course, subjects: [subject], seatAssignments: [assignment('A-1')], enrollments: [enrollment] }, initialLoaded: true } : undefined) })))
  }
  const unmount = async () => { await act(async () => root?.unmount()); root = undefined }
  const input = () => { const el = document.querySelector<HTMLInputElement>('input[placeholder="-"]'); assert.ok(el); return el }
  const edit = async (value: string) => {
    await act(async () => {
      input().focus()
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input(), value)
      input().dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    })
  }
  const blur = async () => { await act(async () => input().blur()) }
  const finish = async (index = 0) => {
    const item = pending[index]; assert.ok(item)
    serverSeat = item.value
    await act(async () => item.resolve(Response.json(item.value ? { action: 'updated', seatAssignment: assignment(item.value) } : { action: 'cleared' })))
  }
  const click = async (label: string) => {
    const el = Array.from(document.querySelectorAll('button')).find(el => el.textContent?.trim() === label)
    assert.ok(el, `button ${label}`)
    await act(async () => el.click())
  }
  const runTest = async (name: string, body: () => Promise<void>) => {
    if (!process.env.SEAT_TEST_FILTER || name.includes(process.env.SEAT_TEST_FILTER)) await t.test(name, body)
  }
  try {
    for (const committedValue of ['A-2', '']) {
      await runTest(`delayed initialData read cannot replace acknowledged ${committedValue || 'cleared'} seat or Escape baseline`, async () => {
        mode = 'deferred'; await mount(false, true)
        try {
          assert.ok(finishInitialSeatRead, 'initial request is pending while initialData is editable')
          assert.equal(input().value, 'A-1')
          await edit(committedValue); await blur(); await finish()
          await act(async () => finishInitialSeatRead!())
          assert.equal(input().value, committedValue)
          const afterReadText = document.body.textContent ?? ''
          await edit('A-3')
          await act(async () => input().dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
          assert.equal(input().value, committedValue, 'Escape restores latest acknowledged value, not stale initial read')
          assert.doesNotMatch(afterReadText, /저장 전 변경됨/, 'late read must not replace acknowledged seatAssignments')
          assert.equal(serverSeat, committedValue); assert.equal(writes, 1)
        } finally { await unmount() }
      })
    }
    await runTest('delayed initialData read cannot supersede an explicit fresh read', async () => {
      mode = 'deferred'; await mount(false, true)
      try {
        serverSeat = 'A-2'
        await click('새로고침')
        assert.equal(input().value, 'A-2')
        await act(async () => finishInitialSeatRead!())
        assert.equal(input().value, 'A-2')
        assert.equal(writes, 0)
      } finally { await unmount() }
    })
    await runTest('same-cell second blur waits for first commit and latest value wins on server and UI', async () => {
      mode = 'deferred'; await mount()
      try {
        await edit('A-2'); await blur(); await edit('A-3'); await blur()
        assert.equal(pending.length, 1, 'only one write may be in flight per cell')
        await finish()
        assert.equal(input().value, 'A-3', 'older completion must not replace latest draft')
        assert.equal(pending.length, 2)
        await finish(1)
        assert.equal(serverSeat, 'A-3'); assert.equal(input().value, 'A-3')
        assert.doesNotMatch(document.body.textContent ?? '', /저장 중/)
      } finally { await unmount() }
    })
    await runTest('a pending save completion preserves a newer unblurred draft without auto-saving it', async () => {
      mode = 'deferred'; await mount()
      try {
        await edit('A-2'); await blur(); await edit('A-3'); await finish()
        assert.equal(input().value, 'A-3'); assert.equal(serverSeat, 'A-2'); assert.equal(writes, 1)
        assert.match(document.body.textContent ?? '', /저장 전 변경됨/)
      } finally { await unmount() }
    })
    await runTest('Escape restores saved seat and its synchronous blur sends no cancelled mutation', async () => {
      mode = 'deferred'; await mount()
      try {
        await edit('cancelled')
        await act(async () => input().dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
        assert.equal(writes, 0); assert.equal(input().value, 'A-1')
        await edit('A-4'); await blur(); assert.equal(writes, 1, 'only the cancelled blur is skipped'); await finish()
      } finally { await unmount() }
    })
    for (const loss of ['network', 'malformed', 'post-commit-500']) {
      await runTest(`admin ${loss} response loss reconciles committed seat and clears pending`, async () => {
        mode = loss; await mount()
        try {
          const before = reads; await edit('A-8'); await blur()
          assert.ok(reads > before, 'ambiguous result is read back')
          assert.match(seatReadUrls.at(-1) ?? '', /[?&]fresh=1/, 'read-back bypasses the server data cache')
          assert.equal(input().value, 'A-8'); assert.equal(writes, 1)
          assert.doesNotMatch(document.body.textContent ?? '', /저장 중/)
        } finally { await unmount() }
      })
      await runTest(`student ${loss} reservation response loss reconciles committed seat and unlocks`, async () => {
        mode = loss; await mount(true)
        try {
          await click('A-7'); await click('좌석 확정')
          assert.ok(reads > 0, 'reservation state must be read back')
          assert.match(document.body.textContent ?? '', /내 좌석/)
          assert.match(document.body.textContent ?? '', /QR 재인증 필요/)
          assert.doesNotMatch(document.body.textContent ?? '', /처리 중/)
          assert.equal(writes, 1, 'ambiguous reservation is never automatically repeated')
        } finally { await unmount() }
      })
    }
    await runTest('admin keeps unknown writes blocked until a successful explicit refresh', async () => {
      mode = 'malformed'; await mount()
      try {
        refreshFails = true; await edit('A-8'); await blur()
        assert.doesNotMatch(document.body.textContent ?? '', /저장 중/)
        await edit('A-9'); await blur()
        assert.equal(writes, 1, 'unknown result blocks a follow-up mutation')
        refreshFails = false; await click('새로고침')
        assert.match(seatReadUrls.at(-1) ?? '', /[?&]fresh=1/)
        assert.equal(input().value, 'A-8')
        mode = 'deferred'; await edit('A-9'); await blur(); await finish()
        assert.equal(serverSeat, 'A-9'); assert.equal(writes, 2)
      } finally { await unmount() }
    })
    await runTest('malformed administrator read-back cannot be mistaken for a successful recovery', async () => {
      mode = 'malformed'; await mount()
      try {
        refreshMalformed = true; await edit('A-8'); await blur(); await click('새로고침')
        await edit('A-9'); await blur()
        assert.equal(writes, 1, 'malformed refresh must not unlock unknown saves')
        assert.doesNotMatch(document.body.textContent ?? '', /저장 중/)
      } finally { await unmount() }
    })
    await runTest('student cannot reserve again after failed reconciliation until an explicit state refresh succeeds', async () => {
      mode = 'malformed'; await mount(true)
      try {
        refreshFails = true; await click('A-7'); await click('좌석 확정')
        assert.doesNotMatch(document.body.textContent ?? '', /처리 중/)
        await click('A-7')
        assert.equal(document.querySelector('[role="dialog"]'), null, 'unknown reservation state blocks new confirmation')
        refreshFails = false; await click('좌석 상태 다시 확인')
        assert.match(document.body.textContent ?? '', /내 좌석/); assert.equal(writes, 1)
      } finally { await unmount() }
    })
  } finally {
    if (root) await unmount()
    Module._load = originalLoad; globalThis.fetch = originalFetch; dom.window.close()
  }
})
