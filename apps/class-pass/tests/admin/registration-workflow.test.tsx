import { strict as assert } from 'node:assert'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import type { Course } from '../../src/types/database'

const require = createRequire(import.meta.url)
const { JSDOM } = require('../_setup/dom.cjs')

test('registration preserves billing, payment drafts and per-course exemptions', async (t) => {
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
  const courses = Array.from({ length: 9 }, (_, i) => ({ id: i + 8, name: `검증 강좌 ${i}`, tuition_amount: i === 1 ? 60000 : 100000, status: 'active', sort_order: i, created_at: '2026-09-05', enrollment_fields: [], feature_photo: false, feature_attendance: false } as unknown as Course))
  const posted: Array<{ url: string; body: any }> = []
  let pendingPost: Promise<Response> | null = null
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (init?.method === 'POST') {
      posted.push({ url, body: JSON.parse(String(init.body)) })
      if (pendingPost) return pendingPost
      return Response.json({ error: '검증용 요청 차단' }, { status: 400 })
    }
    if (url.startsWith('/api/courses?')) return Response.json({ courses })
    if (url.startsWith('/api/courses/')) return Response.json({ course: courses[0] })
    if (url.startsWith('/api/enrollments?')) return Response.json({ enrollments: [], totalCount: 0, summary: { total: 0, active: 0, suspended: 0, refunded: 0 } })
    if (url.startsWith('/api/materials?')) return Response.json({ materials: [] })
    if (url === '/api/config/series-options') return Response.json({ options: [] })
    throw new Error(`Unexpected request: ${url}`)
  }
  const root = createRoot(document.getElementById('root')!)
  let renderKey = 0
  const click = async (button: HTMLButtonElement | HTMLInputElement) => act(async () => button.click())
  const button = (text: string) => {
    const found = Array.from(document.querySelectorAll('button')).find((el) => el.textContent?.trim() === text)
    assert.ok(found, `button ${text} must be visible`)
    return found
  }
  const field = (label: string, scope: ParentNode = document) => {
    const found = Array.from(scope.querySelectorAll('label')).find((el) => el.querySelector('span')?.textContent?.trim() === label)?.querySelector('input,textarea,select')
    assert.ok(found, `${label} field must exist`)
    return found as HTMLInputElement
  }
  const input = async (element: HTMLInputElement, value: string) => {
    const proto = element.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype
    await act(async () => {
      Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(element, value)
      element.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    })
  }
  const select = async (element: HTMLSelectElement, value: string) => act(async () => {
    element.value = value
    element.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
  })
  const add = async (id: number) => {
    await select(document.querySelector('select[aria-label="추가 강좌 선택"]')!, String(id))
    await click(button('추가'))
  }
  const row = (index: number) => document.querySelectorAll('.admin-registration-course')[index]
  const submit = async (mode = 'with-payment') => act(async () => {
    document.getElementById('create-student-form')!.dispatchEvent(new dom.window.SubmitEvent('submit', { bubbles: true, cancelable: true, submitter: document.querySelector('[data-payment-mode="' + mode + '"]') }))
  })
  const open = async (fillIdentity = true) => {
    posted.length = 0
    pendingPost = null
    await act(async () => root.render(createElement(TenantProvider, { key: ++renderKey, tenantConfig: buildFallbackTenantConfig('police'), children: createElement(Page, { initialData: { course: courses[0], enrollments: [], textbooks: [], seriesOptions: [] }, initialLoaded: true }) })))
    await click(button('+ 수강생 등록'))
    if (!fillIdentity) return
    // 인적 사항은 검색으로 채우는 것이 기본이라 접혀 있다. 신규 수강생은 직접 입력을 열고 채운다.
    await click(button('새 수강생 직접 입력'))
    await input(document.querySelector('input[placeholder="홍길동"]')!, '검증학생')
    await input(document.querySelector('input[placeholder="010-0000-0000"]')!, '01012345678')
    await input(document.querySelector('input[placeholder="YYMMDD"]')!, '990101')
  }
  try {
    await t.test('single-course visible discount is the saved discount', async () => {
      await open()
      await input(field('할인', row(0)), '10000')
      await input(field('할인 사유', row(0)), '형제 할인')
      await submit()
      assert.equal(posted.length, 1)
      assert.equal(posted[0].body.billing.discountAmount, 10000)
      assert.equal(posted[0].body.billing.payableAmount, 90000)
      assert.equal(posted[0].body.payments[0].amount, 90000)
    })
    await t.test('adding then removing a course preserves cash, timestamp, memo and discount', async () => {
      await open()
      await input(field('할인', row(0)), '10000')
      await input(field('할인 사유', row(0)), '형제 할인')
      const method = document.querySelector('select option[value="cash"]')!.parentElement as HTMLSelectElement
      await select(method, 'cash')
      await input(field('공통 메모'), '입력 유지')
      await input(field('수납일시'), '2026-09-01T13:20')
      await add(9)
      await click(row(1).querySelector('button[aria-label="강좌 제거"]')!)
      assert.equal((document.querySelector('select option[value="cash"]')!.parentElement as HTMLSelectElement).value, 'cash')
      assert.equal(field('공통 메모').value, '입력 유지')
      assert.equal(field('수납일시').value, '2026-09-01T13:20')
      await submit()
      assert.equal(posted[0].body.billing.payableAmount, 90000)
      assert.equal(posted[0].body.payments[0].method, 'cash')
      assert.equal(posted[0].body.payments[0].memo, '입력 유지')
    })
    await t.test('one course may be free while another retains its paid amount', async () => {
      await open()
      await add(9)
      const free = row(1).querySelector<HTMLInputElement>('input[type="checkbox"]')
      assert.ok(free, 'every course has its own exemption control')
      await click(free)
      await input(field('면제 사유', row(1)), '장학생')
      await submit()
      assert.equal(posted.length, 1)
      assert.equal(posted[0].url, '/api/enrollments/batch')
      assert.equal(posted[0].body.registrations[0].billing.tuitionExempt, false)
      assert.equal(posted[0].body.registrations[0].billing.payableAmount, 100000)
      assert.equal(posted[0].body.registrations[1].billing.tuitionExempt, true)
      assert.equal(posted[0].body.registrations[1].billing.tuitionExemptReason, '장학생')
      assert.equal(posted[0].body.registrations[1].billing.payableAmount, 0)
      assert.equal(posted[0].body.payments[0].amount, 100000)
    })
    await t.test('blank name and invalid calendar date are blocked before posting', async () => {
      await open()
      await input(document.querySelector('input[placeholder="홍길동"]')!, '  ')
      await input(document.querySelector('input[placeholder="YYMMDD"]')!, '990230')
      await submit()
      assert.equal(posted.length, 0)
      assert.ok(document.querySelector('[aria-invalid="true"]'), 'invalid identity fields have inline feedback')
    })
    await t.test('edited price is also the only price used for saving', async () => {
      await open()
      await input(field('강좌 정가', row(0)), '120000')
      await input(field('할인', row(0)), '20000')
      await input(field('할인 사유', row(0)), '등록 할인')
      await submit()
      assert.equal(posted[0].body.billing.expectedAmount, 120000)
      assert.equal(posted[0].body.billing.discountAmount, 20000)
      assert.equal(posted[0].body.billing.payableAmount, 100000)
      assert.equal(posted[0].body.payments[0].amount, 100000)
    })
    await t.test('single-course free toggle preserves discount and payment metadata on return to paid', async () => {
      await open()
      await input(field('할인', row(0)), '10000')
      await input(field('할인 사유', row(0)), '형제 할인')
      await input(field('공통 메모'), '이미 받은 금액')
      const free = row(0).querySelector<HTMLInputElement>('input[type="checkbox"]')!
      await click(free)
      await input(field('면제 사유', row(0)), '장학생')
      assert.equal(document.querySelector('[data-payment-mode="without-payment"]')?.hasAttribute('hidden'), true)
      await click(free)
      assert.equal(field('할인', row(0)).value, '10000')
      assert.equal(field('할인 사유', row(0)).value, '형제 할인')
      assert.equal(field('공통 메모').value, '이미 받은 금액')
      await submit()
      assert.equal(posted[0].body.billing.tuitionExempt, false)
      assert.equal(posted[0].body.payments[0].amount, 90000)
    })
    await t.test('removing and re-adding a course restores its discount draft', async () => {
      await open()
      await add(9)
      await input(field('할인', row(1)), '10000')
      await input(field('할인 사유', row(1)), '다과목 할인')
      await click(row(1).querySelector('button[aria-label="강좌 제거"]')!)
      await add(9)
      assert.equal(field('할인', row(1)).value, '10000')
      await submit()
      assert.equal(posted[0].body.registrations[1].billing.payableAmount, 50000)
      assert.equal(posted[0].body.payments[0].amount, 150000)
    })
    await t.test('mixed unpaid registration sends no paid entry but keeps the exemption', async () => {
      await open()
      await add(9)
      await click(row(1).querySelector<HTMLInputElement>('input[type="checkbox"]')!)
      await input(field('면제 사유', row(1)), '무료 체험')
      await submit('without-payment')
      assert.equal(posted.length, 0, 'unpaid registration waits for confirmation')
      await click(button('수납 없이 등록하기'))
      assert.equal(posted.length, 1)
      assert.deepEqual(posted[0].body.payments, [])
      assert.equal(posted[0].body.registrations[0].billing.payableAmount, 100000)
      assert.equal(posted[0].body.registrations[1].billing.tuitionExempt, true)
    })
    await t.test('zero-price course saves without a fake payment or compulsory exemption', async () => {
      await open()
      await input(field('강좌 정가', row(0)), '0')
      await submit()
      assert.equal(posted.length, 1)
      assert.equal(posted[0].body.billing.expectedAmount, 0)
      assert.equal(posted[0].body.billing.tuitionExempt, false)
      assert.deepEqual(posted[0].body.payments, [])
    })
    await t.test('invalid dates and phone numbers each block a request with otherwise valid identity', async () => {
      await open()
      await input(document.querySelector('input[placeholder="YYMMDD"]')!, '990230')
      await submit()
      assert.equal(posted.length, 0)
      assert.equal(document.querySelector('[data-registration-field="birth_date"]')?.getAttribute('aria-invalid'), 'true')
      await input(document.querySelector('input[placeholder="YYMMDD"]')!, '990101')
      await input(document.querySelector('input[placeholder="010-0000-0000"]')!, 'wrong-phone')
      await submit()
      assert.equal(posted.length, 0)
      assert.equal(document.querySelector('[data-registration-field="phone"]')?.getAttribute('aria-invalid'), 'true')
    })
    await t.test('a discount exceeding one course price cannot be hidden by the bundle total', async () => {
      await open()
      await add(9)
      await input(field('할인', row(1)), '70000')
      await input(field('할인 사유', row(1)), '잘못된 할인')
      await submit()
      assert.equal(posted.length, 0)
      assert.equal(field('할인', row(1)).getAttribute('aria-invalid'), 'true')
    })
    await t.test('the course selector stops at the API limit of eight', async () => {
      await open()
      for (let id = 9; id <= 15; id += 1) await add(id)
      assert.equal(document.querySelectorAll('.admin-registration-course').length, 8)
      assert.equal(button('추가').disabled, true)
      assert.equal(document.querySelector<HTMLSelectElement>('select[aria-label="추가 강좌 선택"]')!.disabled, true)
      await submit()
      assert.equal(posted[0].body.registrations.length, 8)
    })
    await t.test('exemption date is retained when a free course is combined with an ordinary zero-price course', async () => {
      await open()
      await input(field('강좌 정가', row(0)), '0')
      await add(9)
      await click(row(1).querySelector<HTMLInputElement>('input[type="checkbox"]')!)
      await input(field('면제 사유', row(1)), '무료 체험')
      await input(field('수납일시'), '2026-09-01T13:20')
      await submit()
      assert.equal(posted.length, 1)
      assert.deepEqual(posted[0].body.payments, [])
      assert.equal(posted[0].body.exemptionPaidAt, new Date('2026-09-01T13:20').toISOString())
    })
    await t.test('payment shortage and excess are visible before submitting and clear when balanced', async () => {
      await open()
      await input(field('수납 금액'), '50000')
      const balance = () => document.querySelector('[aria-label="수납 금액 확인"]')
      assert.match(balance()?.textContent ?? '', /50,000원 부족/)
      await input(field('수납 금액'), '120000')
      assert.equal(field('수납 금액').value, '120000', 'do not silently reduce what the operator entered')
      assert.match(balance()?.textContent ?? '', /20,000원 초과/)
      await input(field('수납 금액'), '100000')
      assert.match(balance()?.textContent ?? '', /일치/)
      assert.equal(posted.length, 0)
    })
    await t.test('unpaid confirmation explains discarded payment input and cancel preserves the draft', async () => {
      await open()
      await input(field('수납 금액'), '50000')
      await click(button('수납 없이 등록'))
      assert.equal(posted.length, 0)
      assert.match(document.body.textContent ?? '', /50,000원.*저장되지 않/)
      assert.match(document.body.textContent ?? '', /100,000원.*미수납/)
      await click(button('돌아가기'))
      assert.equal(field('수납 금액').value, '50000')
      assert.equal(posted.length, 0)
      await click(button('수납 없이 등록'))
      await click(button('수납 없이 등록하기'))
      assert.equal(posted.length, 1)
      assert.deepEqual(posted[0].body.payments, [])
      assert.equal(posted[0].body.billing.payableAmount, 100000)
    })
    await t.test('unchanged registration closes without a discard prompt', async () => {
      await open(false)
      await click(document.querySelector<HTMLButtonElement>('[aria-label="수강생 등록"] button[aria-label="닫기"]')!)
      assert.equal(document.querySelector('[aria-label="수강생 등록"]'), null)
      assert.doesNotMatch(document.body.textContent ?? '', /입력 내용을 버리고/)
    })
    await t.test('closing a changed registration asks first and can preserve or discard the draft', async () => {
      await open()
      await input(field('수납 금액'), '50000')
      await click(document.querySelector<HTMLButtonElement>('[aria-label="수강생 등록"] button[aria-label="닫기"]')!)
      assert.match(document.body.textContent ?? '', /입력 내용을 버리고/)
      await click(button('계속 작성'))
      assert.equal(field('이름').value, '검증학생')
      assert.equal(field('수납 금액').value, '50000')
      await click(button('취소'))
      await click(button('입력 버리고 닫기'))
      assert.equal(document.querySelector('[aria-label="수강생 등록"]'), null)
      await click(button('+ 수강생 등록'))
      // 초안을 버렸으므로 인적 사항은 검색부터 시작하는 접힌 기본 상태로 돌아온다.
      assert.equal(field('수납 금액').value, '100000')
      await click(button('새 수강생 직접 입력'))
      assert.equal(field('이름').value, '')
      assert.equal(posted.length, 0)
    })
    await t.test('Escape also protects unsaved payment-only edits and cancelling returns to the drawer', async () => {
      await open(false)
      await input(field('공통 메모'), '보존할 수납 메모')
      await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
      assert.match(document.body.textContent ?? '', /입력 내용을 버리고/)
      await click(button('계속 작성'))
      assert.equal(field('공통 메모').value, '보존할 수납 메모')
      assert.ok(document.querySelector('[aria-label="수강생 등록"]'))
    })
    await t.test('reverting a field to its opening value does not leave a false dirty state', async () => {
      await open(false)
      await input(field('공통 메모'), '임시 메모')
      await input(field('공통 메모'), '')
      await click(button('취소'))
      assert.equal(document.querySelector('[aria-label="수강생 등록"]'), null)
    })
    await t.test('collapsed course keeps its amount and draft, and can be reopened and saved', async () => {
      await open()
      await add(9)
      await input(field('할인', row(1)), '10000')
      await input(field('할인 사유', row(1)), '다과목 할인')
      const collapse = row(1).querySelector<HTMLButtonElement>('button[aria-expanded="true"]')
      assert.ok(collapse, 'course settings must be collapsible')
      await click(collapse)
      assert.equal(collapse.getAttribute('aria-expanded'), 'false')
      assert.match(row(1).textContent ?? '', /50,000원/)
      assert.ok(field('할인', row(1)).closest('[hidden]'))
      assert.match(document.querySelector('[aria-label="등록 요약"]')?.textContent ?? '', /150,000원/)
      await click(collapse)
      assert.equal(field('할인', row(1)).value, '10000')
      await click(collapse)
      await submit()
      assert.equal(posted[0].body.registrations[1].billing.payableAmount, 50000)
    })
    await t.test('a collapsed course with a missing exemption reason opens on validation failure', async () => {
      await open()
      await add(9)
      const collapse = row(1).querySelector<HTMLButtonElement>('button[aria-expanded="true"]')
      assert.ok(collapse, 'course settings must be collapsible')
      await click(collapse)
      const globalFree = Array.from(document.querySelectorAll('label')).find((label) => label.textContent?.includes('전체 강좌 무료 수강'))!.querySelector<HTMLInputElement>('input')!
      await click(globalFree)
      await submit()
      assert.equal(posted.length, 0)
      assert.equal(collapse.getAttribute('aria-expanded'), 'true')
      assert.match(row(1).textContent ?? '', /면제 사유를 입력/)
      await click(button('확인'))
      await input(field('공통 면제 사유'), '장학생')
      assert.equal(collapse.getAttribute('aria-expanded'), 'true', 'correcting the error must not collapse the focused section again')
    })
    await t.test('editing a discount reason does not erase a manually entered receipt amount', async () => {
      await open()
      await input(field('수납 금액'), '50000')
      await input(field('할인 사유', row(0)), '수납액 확인 중')
      assert.equal(field('수납 금액').value, '50000')
    })
    await t.test('split receipt inputs are not silently redistributed by registration', async () => {
      await open()
      await input(field('수납 금액'), '50000')
      await click(button('수단 추가'))
      const entries = document.querySelectorAll('#create-student-form article')
      await input(field('수납 금액', entries[1]), '70000')
      assert.equal(field('수납 금액', entries[0]).value, '50000')
      assert.equal(field('수납 금액', entries[1]).value, '70000')
      assert.match(document.querySelector('[aria-label="수납 금액 확인"]')?.textContent ?? '', /20,000원 초과/)
      await submit()
      assert.equal(posted.length, 0, 'the overpayment warning is still enforced on save')
    })
    await t.test('a split reduces the auto-filled amount so the entries still add up to the bill', async () => {
      await open()
      // 강좌 정가에서 자동으로 채워진 100,000원이다. 아직 아무도 정하지 않은 몫이라 나눠 담을 수 있다.
      assert.equal(field('수납 금액').value, '100000')
      await click(button('수단 추가'))
      const entries = document.querySelectorAll('#create-student-form article')
      await input(field('수납 금액', entries[1]), '30000')
      assert.equal(field('수납 금액', entries[0]).value, '70000', 'the auto-filled entry gives way to the split')
      assert.equal(field('수납 금액', entries[1]).value, '30000')
      assert.match(document.querySelector('[aria-label="수납 금액 확인"]')?.textContent ?? '', /일치/)
      // 수단을 더 추가해도 같은 방식으로 자동 입력분에서 빠진다.
      await click(button('수단 추가'))
      const three = document.querySelectorAll('#create-student-form article')
      await input(field('수납 금액', three[2]), '10000')
      assert.equal(field('수납 금액', three[0]).value, '60000')
      assert.equal(field('수납 금액', three[1]).value, '30000', 'an amount the operator typed stays put')
    })
    await t.test('other payment screens retain their default amount-capping behavior', async () => {
      const { PaymentSection, createPaymentSectionValueForAmount } = require('../../src/components/payments/PaymentSection')
      const { useState } = require('react') as typeof import('react')
      function PaymentFixture() {
        const [value, onChange] = useState(() => createPaymentSectionValueForAmount(100000))
        return createElement(PaymentSection, { value, onChange })
      }
      await act(async () => root.render(createElement(PaymentFixture)))
      await input(field('수납 금액'), '120000')
      assert.equal(field('수납 금액').value, '100000')
    })
    await t.test('pending registration freezes drafts and ignores a duplicate submit', async () => {
      await open()
      let release!: (response: Response) => void
      pendingPost = new Promise<Response>((resolve) => { release = resolve })
      await submit()
      assert.equal(document.querySelector<HTMLFieldSetElement>('#create-student-form > fieldset')?.disabled, true)
      assert.equal(document.querySelector<HTMLButtonElement>('[data-payment-mode="with-payment"]')?.disabled, true)
      await submit()
      assert.equal(posted.length, 1)
      await act(async () => release(Response.json({ error: '검증용 오류' }, { status: 400 })))
      assert.equal(document.querySelector<HTMLFieldSetElement>('#create-student-form > fieldset')?.disabled, false)
      assert.equal(document.querySelector<HTMLInputElement>('input[placeholder="홍길동"]')?.value, '검증학생')
    })
  } finally {
    await act(async () => root.unmount())
    globalThis.fetch = originalFetch
    Module._load = originalLoad
    dom.window.close()
  }
})
