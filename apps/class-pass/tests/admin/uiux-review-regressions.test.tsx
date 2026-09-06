import { strict as assert } from 'node:assert'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { JSDOM } = require('../_setup/dom.cjs')

test('compact navigation closes on Escape and returns focus, and closes after selection', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/police/dashboard' })
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })
  const { act, createElement } = require('react')
  const { createRoot } = require('react-dom/client')
  const { AdminMobileNavigation } = require('../../src/components/admin/AdminMobileNavigation')
  const root = createRoot(document.getElementById('root')!)
  try {
    await act(async () => root.render(createElement(AdminMobileNavigation, {
      pathname: '/dashboard', children: createElement('a', { href: '/police/dashboard/courses' }, '강좌 관리'),
    })))
    const button = document.querySelector('button')!
    assert.equal(button.getAttribute('aria-expanded'), 'false')
    assert.equal(document.querySelector('nav'), null, 'collapsed links must not remain focusable')
    await act(async () => button.click())
    assert.equal(button.getAttribute('aria-expanded'), 'true')
    document.querySelector('a')!.focus()
    await act(async () => document.querySelector('a')!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    assert.equal(document.querySelector('nav'), null)
    assert.equal(document.activeElement, button)
    await act(async () => button.click())
    const link = document.querySelector('a')!
    link.addEventListener('click', event => event.preventDefault())
    await act(async () => link.click())
    assert.equal(button.getAttribute('aria-expanded'), 'false')
    await act(async () => button.click())
    await act(async () => document.body.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true })))
    assert.equal(document.querySelector('nav'), null, 'outside interaction dismisses the menu')
  } finally { await act(async () => root.unmount()); dom.window.close() }
})

test('course settings expose associated labels for basic, location and notice fields', () => {
  Reflect.deleteProperty(globalThis, 'window')
  Reflect.deleteProperty(globalThis, 'document')
  const Module = require('node:module')
  const originalLoad = Module._load
  Module._load = function(request: string, parent: unknown, isMain: boolean) {
    if (request === 'next/navigation') return { useParams: () => ({ id: '8' }), useRouter: () => ({ push() {}, refresh() {} }) }
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    const { createElement } = require('react')
    const { renderToStaticMarkup } = require('react-dom/server')
    const Page = require('../../src/app/(admin)/dashboard/courses/[id]/course-detail-page-client').default
    const { TenantProvider } = require('../../src/components/TenantProvider')
    const { buildFallbackTenantConfig } = require('../../src/lib/tenant')
    const html = renderToStaticMarkup(createElement(TenantProvider, { tenantConfig: buildFallbackTenantConfig('police'), children: createElement(Page, {
      initialLoaded: true, initialData: { course: { id: 8, name: '검증 강좌', slug: 'test', course_type: 'general', status: 'active', sort_order: 0, enrollment_fields: [{ key: 'region', label: '지역', type: 'select', options: ['대구'] }] }, subjects: [{ id: 1, name: '경찰학', sort_order: 0 }] },
    }) }))
    const dom = new JSDOM(html)
    const controls = [...dom.window.document.querySelectorAll('[data-admin-section="basic"] input, [data-admin-section="basic"] select, [data-admin-section="location"] input, [data-admin-section="location"] select, [data-admin-section="notices"] input, [data-admin-section="notices"] textarea')]
    assert.ok(controls.length >= 27)
    for (const control of controls as HTMLInputElement[]) assert.ok(control.labels?.length, `missing associated label: ${control.outerHTML}`)
    const ids = controls.map((control: Element) => control.id).filter(Boolean)
    assert.equal(new Set(ids).size, ids.length, 'every field needs a distinct target')
    for (const control of [...dom.window.document.querySelectorAll('[data-admin-section="fields"] input, [data-admin-section="fields"] select, [data-admin-section="subjects"] input')] as HTMLInputElement[]) {
      assert.ok(control.labels?.length || control.getAttribute('aria-label'), `unnamed repeated control: ${control.outerHTML}`)
    }
    dom.window.close()
  } finally { Module._load = originalLoad }
})

test('dashboard warning drills into affected courses without issuing writes and can clear the filter', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/police/dashboard' })
  Object.assign(globalThis, { self: dom.window })
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })
  const { act, createElement } = require('react')
  const { createRoot } = require('react-dom/client')
  const { TenantProvider } = require('../../src/components/TenantProvider')
  const { buildFallbackTenantConfig } = require('../../src/lib/tenant')
  const Page = require('../../src/app/(admin)/dashboard/page').default
  const originalFetch = globalThis.fetch
  const requests: string[] = []
  globalThis.fetch = async (_input, init) => {
    requests.push(init?.method ?? 'GET')
    return Response.json({
      overview: { activeCourses: 2, activeUniqueStudents: 2, activeEnrollmentCount: 2, duplicateEnrollmentCount: 0, pendingAuthStudents: 0, actionRequiredCourses: 1, suspendedEnrollmentCount: 0 },
      auth: { birthDateReadyCount: 0, pinRequiredCount: 0 },
      actionItems: { pendingStudentAuth: 0, attendanceNeedsSession: 1, designatedSeatNeedsLayout: 0, designatedSeatNeedsSession: 0 },
      featureUsage: { attendanceCourses: 1, designatedSeatCourses: 0, seatAssignmentCourses: 0, distributionCourses: 0, qrPassCourses: 2 },
      courses: [{ id: 8, name: '확인 강좌', courseType: 'general', activeStudents: 1, refundedStudents: 0, featureAttendance: true, needsAttendanceSession: true }, { id: 9, name: '정상 강좌', courseType: 'general', activeStudents: 1, refundedStudents: 0 }],
    })
  }
  const root = createRoot(document.getElementById('root')!)
  try {
    await act(async () => root.render(createElement(TenantProvider, { tenantConfig: buildFallbackTenantConfig('police'), children: createElement(Page) })))
    const action = document.querySelector('button[aria-label="출석 화면 시작 필요 강좌 보기"]') as HTMLButtonElement
    assert.ok(action)
    await act(async () => action.click())
    const courses = document.querySelector('.admin-dashboard-courses')!
    assert.match(courses.textContent!, /확인 강좌/)
    assert.ok(!courses.textContent!.includes('정상 강좌'))
    const clear = Array.from(courses.querySelectorAll('button')).find(el => el.textContent === '전체 강좌 보기')!
    assert.ok(clear)
    await act(async () => clear.click())
    assert.match(courses.textContent!, /정상 강좌/)
    assert.deepEqual(requests, ['GET'])
  } catch (error) {
    if (error instanceof AggregateError) throw new Error(error.errors.map(String).join('\n'))
    throw error
  } finally { await act(async () => root.unmount()); globalThis.fetch = originalFetch; dom.window.close() }
})
