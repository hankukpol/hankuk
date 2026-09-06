import { strict as assert } from 'node:assert'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import type { Course } from '../../src/types/database'

const require = createRequire(import.meta.url)
const { JSDOM } = require('../_setup/dom.cjs')

test('multi-course form sends every course as exempt, requires a reason, and restores paid drafts', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/police/dashboard/courses/8/students', pretendToBeVisual: true })
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, HTMLInputElement: dom.window.HTMLInputElement, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window) })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
  Object.defineProperty(dom.window, 'matchMedia', { value: () => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }) })
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const Module = require('node:module')
  const originalLoad = Module._load
  Module._load = function (request: string, parent: unknown, isMain: boolean) {
    if (request === 'next/navigation') return { useParams: () => ({ id: '8' }), useRouter: () => ({ push() {}, refresh() {} }) }
    return originalLoad.call(this, request, parent, isMain)
  }
  const { act, createElement } = require('react') as typeof import('react')
  const { createRoot } = require('react-dom/client') as typeof import('react-dom/client')
  const { TenantProvider } = require('../../src/components/TenantProvider')
  const { buildFallbackTenantConfig } = require('../../src/lib/tenant')
  const Page = require('../../src/app/(admin)/dashboard/courses/[id]/students/course-students-page-client').default
  const courses = [0, 60000, 120000].map((amount, index) => ({ id: 8 + index, name: `테스트 강좌 ${index}`, tuition_amount: amount, status: 'active', sort_order: index, created_at: '2026-09-05', enrollment_fields: [], feature_photo: false, feature_attendance: false } as unknown as Course))
  const posted: Array<{ url: string; body: any }> = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (init?.method === 'POST') {
      posted.push({ url, body: JSON.parse(String(init.body)) })
      return Response.json({ error: 'TEST_REQUEST_CAPTURED' }, { status: 400 })
    }
    if (url.startsWith('/api/courses?')) return Response.json({ courses })
    if (url.startsWith('/api/courses/')) return Response.json({ course: courses[0] })
    if (url.startsWith('/api/enrollments?')) return Response.json({ enrollments: [], totalCount: 0, summary: { total: 0, active: 0, suspended: 0, refunded: 0 } })
    if (url.startsWith('/api/materials?')) return Response.json({ materials: [] })
    if (url === '/api/config/series-options') return Response.json({ options: [] })
    throw new Error(`Unexpected request: ${url}`)
  }
  const root = createRoot(document.getElementById('root')!)
  const clickText = async (text: string) => {
    const button = Array.from(document.querySelectorAll('button')).find((el) => el.textContent?.trim() === text)
    assert.ok(button, `button ${text} must be visible`)
    await act(async () => button.click())
  }
  const setInput = async (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    const proto = element instanceof dom.window.HTMLTextAreaElement ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype
    await act(async () => {
      Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(element, value)
      element.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    })
  }
  const addCourse = async (id: number) => {
    const select = Array.from(document.querySelectorAll('select')).find((el) => el.options[0]?.textContent === '추가 강좌 선택')!
    await act(async () => { select.value = String(id); select.dispatchEvent(new dom.window.Event('change', { bubbles: true })) })
    await clickText('추가')
  }
  try {
    await act(async () => root.render(createElement(TenantProvider, { tenantConfig: buildFallbackTenantConfig('police'), children: createElement(Page, { initialData: { course: courses[0], enrollments: [], textbooks: [], seriesOptions: [] }, initialLoaded: true }) })))
    await clickText('+ 수강생 등록')
    // 인적 사항은 검색으로 채우는 것이 기본이라 접혀 있다. 신규 수강생은 직접 입력을 열고 채운다.
    await clickText('새 수강생 직접 입력')
    await setInput(document.querySelector('input[placeholder="홍길동"]')!, '검증학생')
    await setInput(document.querySelector('input[placeholder="010-0000-0000"]')!, '01012345678')
    await addCourse(9)
    const freeLabel = Array.from(document.querySelectorAll('label')).find((el) => el.textContent?.includes('전체 강좌 무료 수강'))
    assert.ok(freeLabel, 'bundle registration exposes an actionable all-course free control')
    const free = freeLabel.querySelector('input[type="checkbox"]') as HTMLInputElement
    assert.equal(free.disabled, false)
    const courseField = (label: string) => Array.from(document.querySelectorAll('.admin-registration-course')[1].querySelectorAll('label')).find((el) => el.querySelector('span')?.textContent === label)!.querySelector('input')!
    const courseDiscount = courseField('할인')
    const courseReason = courseField('할인 사유')
    await setInput(courseDiscount, '10000')
    await setInput(courseReason, '형제 할인')
    await act(async () => free.click())
    assert.equal(free.checked, true)
    await addCourse(10)
    assert.equal(free.checked, true, 'adding a course does not clear the exemption')
    assert.equal(document.querySelectorAll('.admin-registration-course input:disabled').length, 6)
    await act(async () => free.click())
    assert.equal(courseDiscount.value, '10000', 'paid discount draft survives toggle')
    await act(async () => free.click())
    const birth = document.querySelector('input[placeholder="990101"]') as HTMLInputElement | null
    const birthField = birth ?? Array.from(document.querySelectorAll('label')).find((el) => el.textContent?.trim() === '생년월일')?.querySelector('input')!
    await setInput(birthField, '990101')
    const form = document.getElementById('create-student-form')!
    const submitter = document.querySelector('[data-payment-mode="with-payment"]') as HTMLButtonElement
    const submit = () => act(async () => { form.dispatchEvent(new dom.window.SubmitEvent('submit', { bubbles: true, cancelable: true, submitter })) })
    await submit()
    assert.equal(posted.length, 0, 'reason is required before posting')
    assert.match(document.body.textContent ?? '', /면제 사유를 입력/)
    await clickText('확인')
    await setInput(document.querySelector('textarea[placeholder="예: 장학생, 무료 체험, 운영 지원"]')!, '포인트 사용')
    await submit()
    assert.equal(posted.length, 0, 'point payment cannot masquerade as an exemption')
    assert.match(document.body.textContent ?? '', /포인트/)
    await clickText('확인')
    await setInput(document.querySelector('textarea[placeholder="예: 장학생, 무료 체험, 운영 지원"]')!, '장학생')
    await submit()
    assert.equal(posted.length, 1)
    assert.equal(posted[0].url, '/api/enrollments/batch')
    assert.deepEqual(posted[0].body.registrations.map((r: any) => r.billing), [0, 60000, 120000].map((amount) => ({ expectedAmount: amount, discountAmount: 0, discountReason: null, payableAmount: 0, tuitionExempt: true, tuitionExemptReason: '장학생' })))
    assert.ok(posted[0].body.payments.every((p: any) => p.method === 'free' && p.amount === 0), 'never send a card/cash payment for exempt courses')
    assert.equal(document.querySelector('[data-payment-mode="without-payment"]')?.hasAttribute('hidden'), true)
    assert.equal(submitter.textContent?.trim(), '무료 수강 등록')
    await clickText('확인')
    await act(async () => free.click())
    const unpaidSubmitter = document.querySelector('[data-payment-mode="without-payment"]') as HTMLButtonElement
    await act(async () => { form.dispatchEvent(new dom.window.SubmitEvent('submit', { bubbles: true, cancelable: true, submitter: unpaidSubmitter })) })
    assert.equal(posted.length, 1, 'unpaid action waits for confirmation')
    await clickText('수납 없이 등록하기')
    assert.equal(posted.length, 2)
    assert.equal(posted[1].body.registrations[1].billing.discountAmount, 10000)
    assert.equal(posted[1].body.registrations[1].billing.discountReason, '형제 할인')
    assert.equal(posted[1].body.registrations[1].billing.payableAmount, 50000)
    assert.ok(posted[1].body.registrations.every((r: any) => r.billing.tuitionExempt === false))
    assert.deepEqual(posted[1].body.payments, [])
    await clickText('확인')
    await act(async () => free.click())
    for (let i = 0; i < 2; i += 1) {
      const remove = document.querySelector<HTMLButtonElement>('.admin-registration-course button[aria-label="강좌 제거"]')!
      await act(async () => remove.click())
    }
    await submit()
    assert.equal(posted.length, 3)
    assert.equal(posted[2].url, '/api/enrollments')
    assert.equal(posted[2].body.billing.tuitionExempt, true, 'removing all added courses keeps the base course exempt')
    assert.equal(posted[2].body.billing.tuitionExemptReason, '장학생')
  } finally {
    await act(async () => root.unmount())
    globalThis.fetch = originalFetch
    Module._load = originalLoad
    dom.window.close()
  }
})
