import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { JSDOM } = require('../_setup/dom.cjs')

// Breaks caught: stale batch commits, writable old filters, stale pre-write polls,
// absent live refresh, and ambiguous submission responses leaving pending/stale UI.
test('attendance pages preserve the current authoritative workflow', async (t) => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/police/courses/test/attendance?enrollmentId=1', pretendToBeVisual: true })
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, sessionStorage: dom.window.sessionStorage, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, HTMLInputElement: dom.window.HTMLInputElement, HTMLSelectElement: dom.window.HTMLSelectElement, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
  Object.defineProperty(dom.window, 'matchMedia', { value: () => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }) })
  const Module = require('node:module'), originalLoad = Module._load
  const originalFetch = globalThis.fetch, originalInterval = globalThis.setInterval, originalClear = globalThis.clearInterval
  const router = { push() {}, replace() {}, refresh() {} }
  const searchParams = new URLSearchParams('enrollmentId=1')
  Module._load = function (request: string, parent: unknown, isMain: boolean) {
    if (request === 'next/navigation') return { useParams: () => ({ id: '8', courseSlug: 'test' }), useRouter: () => router, useSearchParams: () => searchParams }
    return originalLoad.call(this, request, parent, isMain)
  }
  const { act, createElement } = require('react') as typeof import('react')
  const { createRoot } = require('react-dom/client') as typeof import('react-dom/client')
  const { TenantProvider } = require('../../src/components/TenantProvider')
  const { buildFallbackTenantConfig } = require('../../src/lib/tenant')
  const AdminPage = require('../../src/app/(admin)/dashboard/courses/[id]/attendance/page').default
  const StudentPage = require('../../src/app/(student)/courses/[courseSlug]/attendance/page').default
  const intervals = new Map<number, () => void>()
  let timerId = 0
  globalThis.setInterval = ((callback: () => void) => { intervals.set(++timerId, callback); return timerId }) as unknown as typeof setInterval
  globalThis.clearInterval = ((id: number) => { intervals.delete(id) }) as unknown as typeof clearInterval
  let visible = 'visible'
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visible })
  const course = { id: 8, slug: 'test', name: '출석 검증', feature_attendance: true, enrolled_from: '2026-01-01', presence_mode: 'off', presence_required_for_attendance: false }
  const student = { id: 1, course_id: 8, name: '검증학생', phone: '01000000001', exam_number: 'T1', status: 'active' }
  const subjects = [{ id: 11, course_id: 8, name: '경찰학', sort_order: 0 }, { id: 22, course_id: 8, name: '형사법', sort_order: 1 }]
  const target = (name: string, present = false) => ({ enrollmentId: 1, studentName: name, examNumber: 'T1', phone: student.phone, seatLabel: 'A1', status: present ? 'present' : 'absent', attendedAt: present ? '2026-09-06T01:00:00Z' : null, consecutiveAbsences: 0, attendanceStartDate: '2026-01-01', excuseId: null, excuseReason: null, excuseSubjectId: null, excuseSubjectName: null })
  const dashboard = (date: string, name = '검증학생', present = false) => ({ date, attendanceStarted: true, attendanceStartDate: '2026-01-01', totalEnrolled: 1, presentCount: present ? 1 : 0, absentCount: present ? 0 : 1, excusedCount: 0, attendanceRate: present ? 100 : 0, targets: [target(name, present)], absentees: present ? [] : [target(name)], recentRecords: [], checkedSubjects: [], displaySession: { id: 5, isActive: true, expiresAt: null, subjectId: null, subjectName: null } })
  const pass = (open: boolean, attended = false, subjectId = 11) => ({ course, enrollment: student, attendance: { enabled: true, open, attended_today: attended, attended_at: attended ? '2026-09-06T01:00:00Z' : null, subject_id: subjectId, subject_name: subjectId === 11 ? '경찰학' : '형사법', consecutive_absences: 0, warning_threshold: 2 }, attendanceHistory: [], materials: [], designatedSeat: null, subjects })
  let root: ReturnType<typeof createRoot> | undefined
  let reads = 0, writes = 0, currentPass = pass(false), persisted = false
  let readHandler: ((url: URL) => Promise<Response> | Response | undefined) | undefined
  let submitHandler: (() => Promise<Response> | Response) | undefined
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), 'http://localhost')
    if (url.pathname.endsWith('/attendance/submit')) {
      writes++
      assert.equal(init?.credentials, 'same-origin', 'student session transport remains authenticated')
      const body = JSON.parse(String(init?.body))
      assert.equal(body.code, '123456'); assert.match(body.localDeviceKey, /^[A-Za-z0-9_-]{16,128}$/)
      return submitHandler ? submitHandler() : Response.json({ ok: true, date: '2026-09-06' })
    }
    if (url.pathname.endsWith('/attendance/admin/override')) { writes++; persisted = true; return Response.json({ success: true }) }
    const override = readHandler?.(url)
    if (override) return override
    if (url.pathname.endsWith('/enrollments/pass')) { reads++; return Response.json(currentPass) }
    if (url.pathname.endsWith('/bootstrap')) return Response.json({ course, enrollments: [student] })
    if (url.pathname.endsWith('/subjects')) return Response.json({ subjects })
    if (url.pathname.endsWith('/dashboard')) { reads++; return Response.json(dashboard(url.searchParams.get('date')!, '검증학생', persisted)) }
    if (url.pathname.endsWith('/absence-report')) return Response.json({ threshold: 2, flaggedStudents: [] })
    if (url.pathname.endsWith('/excuses')) return Response.json({ excuses: [] })
    if (url.pathname === '/api/courses/8') return Response.json({ course })
    throw new Error(`Unexpected request: ${url}`)
  }
  const button = (label: string) => Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(el => el.textContent?.trim() === label)
  const click = async (label: string) => { const el = button(label); assert.ok(el, label); await act(async () => el.click()) }
  const tick = async () => { await act(async () => { for (const callback of [...intervals.values()]) callback() }) }
  const foreground = async () => { visible = 'visible'; await act(async () => document.dispatchEvent(new dom.window.Event('visibilitychange'))) }
  const change = async (el: HTMLInputElement | HTMLSelectElement, value: string) => {
    const proto = el.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype
    await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value); el.dispatchEvent(new dom.window.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })) })
  }
  const mount = async (page: unknown) => {
    reads = 0; writes = 0; persisted = false; visible = 'visible'; readHandler = undefined; submitHandler = undefined
    sessionStorage.setItem('class_pass_student_name', student.name); sessionStorage.setItem('class_pass_student_phone', student.phone)
    root = createRoot(document.getElementById('root')!)
    await act(async () => root!.render(createElement(TenantProvider, { tenantConfig: buildFallbackTenantConfig('police'), children: createElement(page as never) })))
  }
  const unmount = async () => { await act(async () => root?.unmount()); root = undefined }
  const pasteCode = async () => {
    const event = new dom.window.Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: { getData: () => '123456' } })
    await act(async () => document.querySelector('input')!.dispatchEvent(event))
  }
  try {
    for (const filter of ['date', 'subject']) {
      await t.test(`admin ignores late ${filter} batch after the newest filter commits`, async () => {
        await mount(AdminPage)
        try {
          let resolveOld!: (response: Response) => void
          readHandler = url => {
            if (!url.pathname.endsWith('/dashboard')) return
            const key = url.searchParams.get(filter === 'date' ? 'date' : 'subjectId')
            if (key === (filter === 'date' ? '2026-09-04' : '11')) return new Promise(resolve => { resolveOld = resolve })
            return Response.json(dashboard(url.searchParams.get('date')!, '최신학생'))
          }
          const field = () => document.querySelector<HTMLInputElement>('input[type="date"]')!
          const subject = () => Array.from(document.querySelectorAll('select')).find(el => el.querySelector('option[value="11"]'))!
          await change(filter === 'date' ? field() : subject(), filter === 'date' ? '2026-09-04' : '11')
          await change(filter === 'date' ? field() : subject(), filter === 'date' ? '2026-09-05' : '22')
          assert.match(document.querySelector('tbody')!.textContent!, /최신학생/)
          await act(async () => resolveOld(Response.json(dashboard('2026-09-04', '이전학생'))))
          assert.match(document.querySelector('tbody')!.textContent!, /최신학생/)
          assert.doesNotMatch(document.querySelector('tbody')!.textContent!, /이전학생/)
        } finally { await unmount() }
      })
    }
    await t.test('admin cannot manually change old rows while a new filter is pending or failed', async () => {
      await mount(AdminPage)
      try {
        let finish!: (response: Response) => void
        readHandler = url => url.pathname.endsWith('/dashboard') ? new Promise(resolve => { finish = resolve }) : undefined
        await change(document.querySelector('input[type="date"]')!, '2026-09-03')
        assert.ok(!button('출석 처리') || button('출석 처리')!.disabled, 'old rows must not be writable')
        await act(async () => finish(Response.json({ error: '조회 실패' }, { status: 503 })))
        assert.ok(!button('출석 처리') || button('출석 처리')!.disabled, 'failed filter must not unlock old rows')
        assert.equal(writes, 0)
      } finally { await unmount() }
    })
    await t.test('pre-mutation poll cannot overwrite the authoritative manual attendance result', async () => {
      await mount(AdminPage)
      try {
        let finish!: (response: Response) => void
        let delay = true
        readHandler = url => url.pathname.endsWith('/dashboard') && delay ? new Promise(resolve => { finish = resolve }) : undefined
        await tick(); delay = false
        await click('출석 처리')
        assert.equal(writes, 1)
        await act(async () => finish(Response.json(dashboard('2026-09-06'))))
        assert.ok(button('결석 처리'), 'manual saved attendance wins over the older poll')
      } finally { await unmount() }
    })
    await t.test('admin slow passive read survives two further timer ticks and foreground refresh', async () => {
      await mount(AdminPage)
      try {
        const replies: Array<(response: Response) => void> = []
        readHandler = url => url.pathname.endsWith('/dashboard') ? new Promise(resolve => { replies.push(resolve) }) : undefined
        await tick()
        await tick()
        await tick()
        await foreground()
        await act(async () => replies[0](Response.json(dashboard('2026-09-06', '느린조회완료'))))
        assert.match(document.querySelector('tbody')!.textContent!, /느린조회완료/, 'a slow valid read must eventually commit')
        assert.equal(replies.length, 1, 'passive triggers do not launch replacement requests')
        await tick()
        assert.equal(replies.length, 2, 'successful completion permits the next passive read')
        await act(async () => replies[1](Response.json({ error: '일시 오류' }, { status: 503 })))
        readHandler = undefined
        await tick()
        assert.equal(button('출석 처리')?.disabled, false, 'failed completion also permits a later passive retry')
      } finally { await unmount() }
    })
    await t.test('admin explicit refresh still supersedes a slow same-filter passive read', async () => {
      await mount(AdminPage)
      try {
        let oldReply!: (response: Response) => void
        readHandler = url => url.pathname.endsWith('/dashboard') ? new Promise(resolve => { oldReply = resolve }) : undefined
        await tick()
        readHandler = url => url.pathname.endsWith('/dashboard') ? Response.json(dashboard('2026-09-06', '명시조회완료')) : undefined
        await click('새로고침')
        await act(async () => oldReply(Response.json(dashboard('2026-09-06', '이전자동조회'))))
        assert.match(document.querySelector('tbody')!.textContent!, /명시조회완료/)
        assert.doesNotMatch(document.querySelector('tbody')!.textContent!, /이전자동조회/)
      } finally { await unmount() }
    })
    await t.test('admin failed filter has an explicit retry that restores the current dataset', async () => {
      await mount(AdminPage)
      try {
        readHandler = url => url.pathname.endsWith('/dashboard') ? Response.json({ error: '조회 실패' }, { status: 503 }) : undefined
        await change(document.querySelector('input[type="date"]')!, '2026-09-02')
        readHandler = undefined
        await click('새로고침')
        assert.equal(button('출석 처리')?.disabled, false)
        assert.match(document.body.textContent!, /2026-09-02/)
      } finally { await unmount() }
    })
    await t.test('starting a session invalidates polls before the mutation completes', async () => {
      await mount(AdminPage)
      try {
        await change(Array.from(document.querySelectorAll('select')).find(el => el.querySelector('option[value="11"]'))!, '11')
        let oldRead!: (response: Response) => void, writeReply!: (response: Response) => void
        readHandler = url => {
          if (url.pathname.endsWith('/dashboard')) return new Promise(resolve => { oldRead = resolve })
          if (url.pathname.endsWith('/display')) return new Promise(resolve => { writeReply = resolve })
        }
        await tick()
        await click('출석 시작')
        await act(async () => oldRead(Response.json(dashboard('2026-09-06', '오래된조회'))))
        assert.doesNotMatch(document.querySelector('tbody')!.textContent!, /오래된조회/)
        readHandler = undefined
        await act(async () => writeReply(Response.json({ displayUrl: '/attendance/display/test' })))
        assert.equal(button('출석 시작')!.disabled, false)
      } finally { await unmount() }
    })
    await t.test('student observes closed to open without remounting', async () => {
      currentPass = pass(false); await mount(StudentPage)
      try {
        assert.equal(button('출석하기')!.disabled, true)
        currentPass = pass(true); await tick()
        assert.equal(button('출석하기')!.disabled, false)
      } finally { await unmount() }
    })
    await t.test('student subject change and foreground refresh preserve the code draft without overlapping reads', async () => {
      currentPass = pass(true); await mount(StudentPage)
      try {
        await pasteCode()
        let finish!: (response: Response) => void, requests = 0
        readHandler = url => url.pathname.endsWith('/enrollments/pass') ? (requests++, new Promise(resolve => { finish = resolve })) : undefined
        await tick(); await tick(); await foreground()
        assert.equal(requests, 1, 'background refresh has at most one pending request')
        assert.equal(document.querySelector<HTMLInputElement>('input')!.value, '1')
        await act(async () => finish(Response.json(pass(true, true))))
        assert.equal(document.querySelector<HTMLInputElement>('input')!.disabled, true)
        readHandler = undefined; currentPass = pass(true, false, 22)
        visible = 'hidden'; const before = reads; await tick(); assert.equal(reads, before)
        await foreground()
        assert.equal(button('출석하기')!.disabled, false)
        assert.equal(document.querySelector<HTMLInputElement>('input')!.value, '1')
      } finally { await unmount() }
    })
    await t.test('student date rollover refreshes yesterday completed attendance', async () => {
      t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-06T14:59:59Z') })
      currentPass = pass(true, true); await mount(StudentPage)
      try {
        t.mock.timers.setTime(new Date('2026-09-06T15:00:01Z').valueOf())
        currentPass = pass(true, false); await tick()
        assert.equal(button('출석하기')?.disabled, false)
      } finally { await unmount(); t.mock.timers.reset() }
    })
    await t.test('student failed reconciliation releases pending but blocks duplicate writes until refresh recovers', async () => {
      currentPass = pass(true); await mount(StudentPage)
      try {
        await pasteCode()
        submitHandler = () => new Response('invalid json')
        readHandler = url => url.pathname.endsWith('/enrollments/pass') ? Response.json({ error: 'offline' }, { status: 503 }) : undefined
        await click('출석하기')
        assert.doesNotMatch(document.body.textContent!, /위치 확인 중/)
        assert.equal(button('출석하기')!.disabled, true)
        assert.equal(writes, 1)
        readHandler = undefined; await tick()
        assert.equal(button('출석하기')!.disabled, false)
        assert.equal(document.querySelector<HTMLInputElement>('input')!.value, '1')
        submitHandler = () => { currentPass = pass(true, true); return Response.json({ ok: true, date: '2026-09-06' }) }
        await click('출석하기')
        assert.equal(writes, 2)
        assert.match(document.body.textContent!, /오늘의 출석 완료/)
      } finally { await unmount() }
    })
    await t.test('student departure cancels reconciliation work after a late submission reply', async () => {
      currentPass = pass(true); await mount(StudentPage)
      let reply!: (response: Response) => void
      await pasteCode()
      submitHandler = () => new Promise(resolve => { reply = resolve })
      await click('출석하기')
      const before = reads
      await unmount()
      await act(async () => reply(Response.json({ ok: true, date: '2026-09-06' })))
      assert.equal(reads, before, 'a departed page must not launch a new attendance read')
    })
    for (const mode of ['malformed', 'invalid-shape', 'server-error', 'already-attended', 'network']) {
      await t.test(`student reconciles committed attendance after ${mode} response loss and releases pending`, async () => {
        currentPass = pass(true); await mount(StudentPage)
        try {
          await pasteCode()
          let reconcile!: (response: Response) => void
          let reconcileReads = 0
          readHandler = url => url.pathname.endsWith('/enrollments/pass') ? (reconcileReads++, new Promise(resolve => { reconcile = resolve })) : undefined
          submitHandler = () => {
            currentPass = pass(true, true)
            if (mode === 'network') throw new TypeError('Failed to fetch')
            if (mode === 'server-error') return Response.json({ error: 'post-commit failure' }, { status: 500 })
            if (mode === 'already-attended') return Response.json({ error: '이미 출석 처리되었습니다.', code: 'ALREADY_ATTENDED' }, { status: 409 })
            if (mode === 'invalid-shape') return Response.json({})
            return new Response('invalid json')
          }
          await click('출석하기')
          assert.ok(reconcileReads > 0, 'lost response requires authoritative state read')
          assert.doesNotMatch(document.body.textContent!, /오늘 출석이 완료되었습니다/, 'do not claim completion before reconciliation')
          await act(async () => reconcile(Response.json(currentPass)))
          assert.doesNotMatch(document.body.textContent!, /위치 확인 중/)
          assert.match(document.body.textContent!, /오늘의 출석 완료/)
          assert.equal(writes, 1)
        } finally { await unmount() }
      })
    }
  } finally {
    if (root) await unmount()
    Module._load = originalLoad; globalThis.fetch = originalFetch; globalThis.setInterval = originalInterval; globalThis.clearInterval = originalClear
    dom.window.close()
  }
})
