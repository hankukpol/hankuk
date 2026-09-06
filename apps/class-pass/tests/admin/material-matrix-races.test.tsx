import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { JSDOM } = require('../_setup/dom.cjs')

test('real administrator matrix ignores stale reads and reconciles ambiguous writes', async (t) => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/police/dashboard/courses/8/students', pretendToBeVisual: true })
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, HTMLInputElement: dom.window.HTMLInputElement, HTMLSelectElement: dom.window.HTMLSelectElement, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
  Object.defineProperty(dom.window, 'matchMedia', { value: () => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }) })
  const Module = require('node:module')
  const originalLoad = Module._load, originalFetch = globalThis.fetch
  Module._load = function (request: string, parent: unknown, isMain: boolean) {
    if (request === 'next/navigation') return { useParams: () => ({ id: '8' }), useRouter: () => ({ push() {}, refresh() {} }) }
    return originalLoad.call(this, request, parent, isMain)
  }
  const { act, createElement } = require('react') as typeof import('react')
  const { createRoot } = require('react-dom/client') as typeof import('react-dom/client')
  const { TenantProvider } = require('../../src/components/TenantProvider')
  const { buildFallbackTenantConfig } = require('../../src/lib/tenant')
  const StudentsPage = require('../../src/app/(admin)/dashboard/courses/[id]/students/course-students-page-client').default
  const course = { id: 8, name: '매트릭스 검증', tuition_amount: 0, status: 'active', enrollment_fields: [], feature_photo: false, feature_attendance: false }
  const handout = { id: 10, course_id: 8, name: '늦은 프린트', subject_id: null, material_type: 'handout', is_active: true, sort_order: 1 }
  const textbook = { ...handout, id: 20, name: '현재 교재', material_type: 'textbook' }
  const enrollments = [{ id: 1, course_id: 8, name: '검증학생', phone: '01000000001', exam_number: 'T1', status: 'active', custom_data: {}, created_at: '2026-09-05' }]
  let root: ReturnType<typeof createRoot> | undefined
  let assigned = false, received = false, matrixFails = false, writeMode = 'network', writes = 0, reads = 0
  let deferredHandout: ((response: Response) => void) | undefined
  let delayHandout = false
  const matrix = (isHandout: boolean) => Response.json({ materials: [isHandout ? handout : textbook], logs: received && isHandout ? [{ id: 99, enrollment_id: 1, material_id: 10, distributed_at: '2026-09-05T01:00:00Z' }] : [], assignments: assigned ? [{ enrollment_id: 1, material_id: 20 }] : [], seatAssignments: [] })
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (init?.method === 'POST' || init?.method === 'DELETE') {
      if (url === '/api/distribution/manual' || url === '/api/distribution/undo') {
        writes++; received = url.endsWith('/manual')
        if (writeMode === 'network') throw new TypeError('Failed to fetch')
        return Response.json({ success: true, logId: 99, success_count: 1, failed_count: 0, student_name: '검증학생', material_name: '늦은 프린트', refreshRequired: true, warning: '저장됐습니다. 화면 갱신 경고', logs: [{ log_id: 99, material_id: 10, distributed_at: '2026-09-05T01:00:00Z' }] })
      }
      assert.equal(url, '/api/textbook-assignments')
      writes++; assigned = init.method === 'POST'
      if (writeMode === 'network') throw new TypeError('Failed to fetch')
      return new Response('unreadable response', { status: 200 })
    }
    if (url.includes('/receipt-matrix?')) {
      reads++
      if (matrixFails) throw new TypeError('Failed to refresh')
      const isHandout = url.includes('materialType=handout')
      if (delayHandout && isHandout) return new Promise(resolve => { deferredHandout = resolve })
      return matrix(isHandout)
    }
    if (url.startsWith('/api/enrollments?')) return Response.json({ enrollments, total: 1, summary: { active: 1, refunded: 0, suspended: 0, cancelled: 0 } })
    if (url.startsWith('/api/courses/')) return Response.json({ course })
    if (url.startsWith('/api/materials?')) return Response.json({ materials: [textbook] })
    if (url === '/api/config/series-options') return Response.json({ options: [] })
    throw new Error(`Unexpected request: ${url}`)
  }
  const button = (label: string) => {
    const result = Array.from(document.querySelectorAll('button')).find(el => el.textContent?.trim() === label)
    assert.ok(result, `button ${label}`)
    return result as HTMLButtonElement
  }
  const click = async (label: string) => { await act(async () => button(label).click()) }
  const waitFor = async (predicate: () => boolean) => {
    const start = Date.now()
    while (!predicate()) {
      assert.ok(Date.now() - start < 2500, 'expected rendered matrix state')
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
    }
  }
  const checkbox = () => document.querySelector<HTMLInputElement>('input[aria-label="검증학생 현재 교재 구매·배정"]')
  const mount = async () => {
    assigned = false; received = false; matrixFails = false; writes = 0; reads = 0; deferredHandout = undefined
    root = createRoot(document.getElementById('root')!)
    await act(async () => root!.render(createElement(TenantProvider, { tenantConfig: buildFallbackTenantConfig('police'), children: createElement(StudentsPage, { initialData: { course, enrollments, textbooks: [textbook], seriesOptions: [] }, initialLoaded: true }) })))
  }
  const unmount = async () => { await act(async () => root?.unmount()); root = undefined }
  try {
    await t.test('late handout response cannot replace current textbook matrix', async () => {
      await mount()
      try {
        delayHandout = true
        await click('배부자료 수령현황')
        await waitFor(() => !!deferredHandout)
        assert.ok(deferredHandout)
        await click('교재 수령현황')
        await waitFor(() => (document.querySelector('thead')?.textContent ?? '').includes('현재 교재'))
        assert.match(document.querySelector('thead')?.textContent ?? '', /현재 교재/)
        await act(async () => deferredHandout!(matrix(true)))
        assert.match(document.querySelector('thead')?.textContent ?? '', /현재 교재/)
        assert.doesNotMatch(document.querySelector('thead')?.textContent ?? '', /늦은 프린트/)
      } finally { delayHandout = false; await unmount() }
    })
    for (const mode of ['network', 'malformed']) {
      await t.test(`saved assignment survives ${mode} response loss via authoritative reload`, async () => {
        await mount()
        try {
          writeMode = mode
          await click('교재 배정')
          await waitFor(() => !!checkbox())
          assert.equal(checkbox()?.checked, false)
          const before = reads
          await act(async () => { checkbox()!.click(); checkbox()!.click() })
          assert.equal(writes, 1, 'same-tick repeated action makes one write')
          assert.ok(reads > before, 'ambiguous response must reload the matrix')
          assert.equal(checkbox()?.checked, true, 'server saved state wins over optimistic rollback')
          assert.match(document.body.textContent ?? '', /결과를 확인하지 못|배정 현황/)
        } finally { await unmount() }
      })
    }
    await t.test('failed authoritative refresh leaves no stale writable matrix', async () => {
      await mount()
      try {
        writeMode = 'network'
        await click('교재 배정')
        await waitFor(() => !!checkbox())
        matrixFails = true
        await act(async () => checkbox()!.click())
        assert.ok(!checkbox() || checkbox()!.disabled)
        assert.equal(writes, 1)
        matrixFails = false
        await click('교재 배정')
        await waitFor(() => !!checkbox())
        assert.equal(checkbox()!.checked, true, 'same-tab retry recovers persisted assignment')
      } finally { await unmount() }
    })
    for (const mode of ['network', 'cache-warning']) {
      await t.test(`manual receipt and undo reconcile ${mode} results`, async () => {
        await mount()
        try {
          writeMode = mode
          await click('배부자료 수령현황')
          await waitFor(() => Array.from(document.querySelectorAll('tbody button')).some(el => el.textContent?.trim() === '배부'))
          const before = reads
          await click('배부')
          assert.ok(reads > before)
          const receipt = () => document.querySelector<HTMLButtonElement>('button[aria-label="검증학생 늦은 프린트 수령 취소"]')
          assert.ok(receipt(), 'committed receipt remains visible')
          assert.match(document.body.textContent ?? '', mode === 'network' ? /결과를 확인하지 못/ : /화면 갱신 경고/)
          for (const confirm of Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).filter(el => el.textContent === '확인')) {
            await act(async () => confirm.click())
          }
          await act(async () => receipt()!.click())
          await click('기록 취소')
          assert.equal(received, false)
          assert.equal(receipt(), null, 'committed undo is reconciled even when response is lost')
          assert.equal(writes, 2)
        } finally { await unmount() }
      })
    }
  } finally {
    if (root) await unmount()
    Module._load = originalLoad; globalThis.fetch = originalFetch; dom.window.close()
  }
})
