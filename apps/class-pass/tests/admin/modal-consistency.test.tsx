import { strict as assert } from 'node:assert'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { JSDOM } = require('../_setup/dom.cjs')

test('modal actions stay outside the scroll body, preserve form submission and block closing while saving', async (t) => {
  const dom = new JSDOM('<div class="admin-shell"><button id="trigger">열기</button><div id="root"></div><div id="admin-portal-root"></div></div>', { url: 'http://localhost/police/dashboard/courses/8/students', pretendToBeVisual: true })
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element, Node: dom.window.Node, HTMLInputElement: dom.window.HTMLInputElement,
    MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
  Object.defineProperty(dom.window, 'matchMedia', { value: () => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }) })
  const Module = require('node:module')
  const originalLoad = Module._load
  Module._load = function(request: string, parent: unknown, isMain: boolean) {
    if (request === 'next/navigation') return { useParams: () => ({ id: '8' }), useRouter: () => ({ push() {}, refresh() {} }) }
    return originalLoad.call(this, request, parent, isMain)
  }
  const { act, createElement: h } = require('react') as typeof import('react')
  const { createRoot } = require('react-dom/client') as typeof import('react-dom/client')
  const { SeatEditModal } = require('../../src/components/designated-seat/SeatEditModal')
  const root = createRoot(document.getElementById('root')!)
  const originalFetch = globalThis.fetch
  const button = (label: string) => {
    const found = Array.from(document.querySelectorAll('button')).find(el => el.textContent?.trim() === label)
    assert.ok(found, `visible action: ${label}`)
    return found
  }
  const escape = () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  try {
    await t.test('shared footer submits its body form and pending guard covers every dismissal path', async () => {
      let closes = 0
      let submits = 0
      const render = (saving: boolean) => act(async () => root.render(h(SeatEditModal, {
        open: true, title: '좌석 편집', closeDisabled: saving, onClose: () => { closes++ },
        footer: h('button', { type: 'submit', form: 'seat-test-form', disabled: saving }, '변경 저장'),
        children: h('form', { id: 'seat-test-form', onSubmit: (event: React.FormEvent) => { event.preventDefault(); submits++ } }, h('input', { name: 'label', defaultValue: 'A-1' })),
      })))
      document.getElementById('trigger')!.focus()
      await render(false)
      const panel = document.querySelector('[role="dialog"]')!
      assert.ok(panel.closest('#admin-portal-root'), 'dialog must escape the page clipping inside its admin theme')
      const footer = panel.querySelector(':scope > .admin-dialog-footer')
      assert.ok(footer, 'actions must remain outside the independently scrolling body')
      assert.ok(!panel.querySelector('.admin-dialog-body')!.contains(button('변경 저장')))
      await act(async () => button('변경 저장').click())
      assert.equal(submits, 1, 'footer action retains native form association')
      await render(true)
      const close = panel.querySelector<HTMLButtonElement>('[aria-label="닫기"]')!
      assert.equal(close.disabled, true)
      await act(async () => { close.click(); escape(); (document.querySelector('.admin-dialog-backdrop') as HTMLElement).click() })
      assert.equal(closes, 0, 'pending dialog cannot close by button, Escape or backdrop')
      await render(false)
      await act(async () => escape())
      assert.equal(closes, 1, 'Escape works again after saving ends')
      await act(async () => root.render(null))
      assert.equal(document.activeElement?.id, 'trigger', 'portal unmount restores the original trigger')
      assert.equal(document.body.style.overflow, '')
    })

    await t.test('read-only detail keeps per-item actions without an empty footer', async () => {
      let selectedDate = ''
      await act(async () => root.render(h(SeatEditModal, {
        open: true, title: '연속 결석 상세', onClose() {},
        children: h('button', { onClick: () => { selectedDate = '2026-09-05' } }, '사유 등록'),
      })))
      assert.equal(document.querySelector('.admin-dialog-footer'), null)
      await act(async () => button('사유 등록').click())
      assert.equal(selectedDate, '2026-09-05')
      await act(async () => root.render(null))
    })

    await t.test('attendance footer submits the selected excuse and remains locked until its response', async () => {
      const { AttendanceExcuseModal } = require('../../src/app/(admin)/dashboard/courses/[id]/attendance/attendance-excuse-modal')
      const record = { id: 5, courseId: 8, enrollmentId: 12, subjectId: 9, excuseDate: '2026-09-05', reason: '검증 사유', createdBy: 'admin', createdAt: '2026-09-05', updatedAt: '2026-09-05', studentName: '검증학생', examNumber: 'T12', phone: '01000000012', subjectName: '경찰학' }
      let finish: ((response: Response) => void) | undefined
      let closes = 0
      const writes: Array<{ url: string; body: unknown }> = []
      globalThis.fetch = async (input, init) => {
        writes.push({ url: String(input), body: JSON.parse(String(init?.body)) })
        return new Promise(resolve => { finish = resolve })
      }
      await act(async () => root.render(h(AttendanceExcuseModal, {
        open: true, courseId: 8, subjects: [{ id: 9, course_id: 8, name: '경찰학' }], students: [],
        defaultDate: '2026-09-05', editingExcuse: record, onClose: () => { closes++ }, onSaved() {},
      })))
      const save = button('사유서 수정')
      assert.ok(save.closest('.admin-dialog-footer'))
      assert.equal(save.form, document.querySelector('.admin-dialog-body form'))
      await act(async () => save.click())
      assert.deepEqual(writes, [{ url: '/api/attendance/admin/excuses/5', body: { courseId: 8, excuseDate: '2026-09-05', reason: '검증 사유' } }])
      assert.equal(button('취소').disabled, true)
      assert.equal(document.querySelector<HTMLButtonElement>('[aria-label="닫기"]')!.disabled, true)
      await act(async () => escape())
      assert.equal(closes, 0)
      await act(async () => finish!(Response.json({ error: '검증용 저장 실패' }, { status: 400 })))
      assert.equal(button('사유서 수정').disabled, false)
      assert.equal(document.querySelector<HTMLTextAreaElement>('textarea')!.value, '검증 사유')
      await act(async () => root.render(null))
    })

    await t.test('student edit uses a drawer and retains the selected student and guarded save', async () => {
      const { TenantProvider } = require('../../src/components/TenantProvider')
      const { buildFallbackTenantConfig } = require('../../src/lib/tenant')
      const Page = require('../../src/app/(admin)/dashboard/courses/[id]/students/course-students-page-client').default
      const course = { id: 8, name: '검증 강좌', tuition_amount: 100000, status: 'active', enrollment_fields: [], feature_photo: false, feature_attendance: false }
      const enrollment = { id: 12, course_id: 8, name: '편집검증학생', phone: '01000000012', exam_number: 'TEST-12', student_type: 'academy', series: '공채', status: 'active', custom_data: {}, created_at: '2026-09-05' }
      let finish: ((response: Response) => void) | undefined
      const writes: Array<{ url: string; body: Record<string, unknown> }> = []
      globalThis.fetch = async (input, init) => {
        const url = String(input)
        if (init?.method === 'PATCH') {
          writes.push({ url, body: JSON.parse(String(init.body)) })
          return new Promise(resolve => { finish = resolve })
        }
        if (url.startsWith('/api/courses/')) return Response.json({ course })
        if (url.startsWith('/api/enrollments?')) return Response.json({ enrollments: [enrollment], totalCount: 1, summary: { total: 1, active: 1, suspended: 0, refunded: 0 } })
        if (url.startsWith('/api/materials?')) return Response.json({ materials: [] })
        if (url === '/api/config/series-options') return Response.json({ options: [] })
        throw new Error(`Unexpected request: ${url}`)
      }
      await act(async () => root.render(h(TenantProvider, { tenantConfig: buildFallbackTenantConfig('police'), children: h(Page, { initialLoaded: true, initialData: { course, enrollments: [enrollment], textbooks: [], seriesOptions: [] } }) })))
      button('편집').focus()
      await act(async () => button('편집').click())
      const drawer = document.querySelector<HTMLFormElement>('[role="dialog"][aria-label="수강생 편집"]')!
      assert.ok(drawer.classList.contains('admin-drawer-panel'), 'edit follows the same drawer contract as registration')
      assert.ok(drawer.closest('#admin-portal-root'))
      assert.equal(drawer.querySelector<HTMLInputElement>('input[placeholder="이름"]')!.value, '편집검증학생')
      await act(async () => button('저장').click())
      assert.equal(writes.length, 1)
      assert.equal(writes[0].url, '/api/enrollments/12')
      assert.equal(writes[0].body.name, '편집검증학생')
      assert.equal(button('취소').disabled, true)
      await act(async () => escape())
      assert.ok(document.querySelector('[aria-label="수강생 편집"]'), 'pending edit stays open')
      await act(async () => finish!(Response.json({ error: '검증용 저장 실패' }, { status: 400 })))
      assert.equal(drawer.querySelector<HTMLInputElement>('input[placeholder="이름"]')!.value, '편집검증학생')
      assert.equal(button('저장').disabled, false)
      await act(async () => root.render(null))
    })
  } finally {
    await act(async () => root.unmount())
    globalThis.fetch = originalFetch
    Module._load = originalLoad
    dom.window.close()
  }
})
