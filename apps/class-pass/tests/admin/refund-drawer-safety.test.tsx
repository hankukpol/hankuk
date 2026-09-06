import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { enrollmentFixture, paymentFixture, refundFixture } from './refund-test-fixtures'

const require = createRequire(import.meta.url)
const { JSDOM } = require('../_setup/dom.cjs')
type RefundInput = { requestId: string; endEnrollment: boolean; refunds: Array<{ paymentId: number; amount: number }> }

async function setup(options: {
  refundResponse?: (body: RefundInput) => Response | Promise<Response>
  failRefresh?: boolean
  failParentRefresh?: boolean
  priorRefund?: boolean
  firstRead?: Promise<Response>
  secondRead?: Response | Promise<Response>
  cancelled?: boolean
  endResponse?: Response
  additionalPayment?: boolean
} = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost', pretendToBeVisual: true })
  Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element, Node: dom.window.Node, HTMLInputElement: dom.window.HTMLInputElement, MutationObserver: dom.window.MutationObserver,
    getComputedStyle: dom.window.getComputedStyle, IS_REACT_ACT_ENVIRONMENT: true })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
  Object.defineProperty(dom.window, 'matchMedia', { value: () => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }) })
  const { act, createElement } = require('react') as typeof import('react')
  const { createRoot } = require('react-dom/client') as typeof import('react-dom/client')
  const { EnrollmentPaymentDrawer } = require('../../src/components/payments/EnrollmentPaymentDrawer') as typeof import('../../src/components/payments/EnrollmentPaymentDrawer')
  const enrollment = enrollmentFixture()
  if (options.cancelled) enrollment.status = 'cancelled'
  const initial = paymentFixture()
  if (options.priorRefund) { initial.status = 'partial_refunded'; initial.enrollment_refunds = [refundFixture()] }
  const posted: Array<{ url: string; body: Record<string, unknown> }> = []
  let reads = 0
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body))
      posted.push({ url, body })
      if (url === '/api/payments/refunds') return options.refundResponse?.(body) ?? Response.json(null, { status: 201 })
      if (url === '/api/enrollments/1/end') return options.endResponse ?? Response.json({ enrollment: { ...enrollment, status: 'cancelled', ended_reason: body.reason } })
      throw new Error('Unexpected write: ' + url)
    }
    reads++
    if (reads === 1 && options.firstRead) return options.firstRead
    if (reads === 2 && options.secondRead) return options.secondRead
    if (options.failRefresh && reads > 1) return Response.json({ error: 'refresh unavailable' }, { status: 500 })
    return Response.json({ payments: options.additionalPayment
      ? [initial, { ...paymentFixture(101), amount: 5000, category: 'textbook' }]
      : [initial] })
  }
  const root = createRoot(document.getElementById('root')!)
  const renderEnrollment = (nextEnrollment: ReturnType<typeof enrollmentFixture>) => root.render(createElement(EnrollmentPaymentDrawer, { open: true, enrollment: nextEnrollment,
    course: { id: 2, name: '테스트 강좌', tuition_amount: 30000 }, onClose: () => {},
    onDataChanged: () => { if (options.failParentRefresh) throw new Error('parent refresh unavailable') },
  }))
  await act(async () => renderEnrollment(enrollment))
  const button = (label: string) => Array.from(document.querySelectorAll('button')).find((entry) => entry.textContent?.trim() === label)
  const click = async (label: string) => {
    const element = button(label)
    assert.ok(element, `${label} button must exist`)
    await act(async () => element.click())
  }
  const fill = async (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    const prototype = element instanceof dom.window.HTMLTextAreaElement ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype
    await act(async () => {
      Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value)
      element.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    })
  }
  return { posted, button, click, fill, act, readCount: () => reads,
    async switchEnrollment() {
      document.querySelector('aside')?.focus()
      await act(async () => renderEnrollment({ ...enrollment, id: 2, name: '다음 학생' }))
    },
    async close() { await act(async () => root.unmount()); globalThis.fetch = originalFetch; dom.window.close() },
  }
}

for (const failure of ['null JSON', 'missing snapshot', 'invalid JSON', 'network interruption', 'wrong request ID', 'stale snapshot'] as const) {
  test(`ambiguous refund response (${failure}) keeps the modal and the same request ID for retry`, async () => {
    const ui = await setup({ refundResponse: (body) => {
      if (failure === 'network interruption') throw new Error('connection lost after save')
      if (failure === 'invalid JSON') return new Response('{', { status: 201 })
      if (failure === 'wrong request ID' || failure === 'stale snapshot') {
        const refund = refundFixture(body.refunds[0].amount)
        return Response.json({ requestId: failure === 'wrong request ID' ? crypto.randomUUID() : body.requestId,
          enrollmentEnded: false, refunds: [refund], payments: [{ ...paymentFixture(), status: 'fully_refunded',
            enrollment_refunds: failure === 'stale snapshot' ? [] : [refund] }] }, { status: 201 })
      }
      return Response.json(failure === 'null JSON' ? null : { success: true }, { status: 201 })
    } })
    try {
      await ui.click('환불')
      await ui.click('환불 저장')
      assert.ok(ui.button('환불 저장'), 'uncertain result must leave the original request open')
      assert.equal(ui.readCount(), 1, 'do not refresh or reset an ambiguous request')
      if (ui.button('확인')) await ui.click('확인')
      await ui.click('환불 저장')
      assert.equal(ui.posted.length, 2)
      assert.match(String(ui.posted[0].body.requestId), /^[\da-f-]{36}$/i)
      assert.equal(ui.posted[0].body.requestId, ui.posted[1].body.requestId)
    } finally { await ui.close() }
  })
}

test('successful refund keeps its snapshot visible but blocks new writes when the following GET fails', async () => {
  const ui = await setup({ failRefresh: true, additionalPayment: true, refundResponse: (body) => Response.json({
    requestId: body.requestId, enrollmentEnded: false, refunds: [refundFixture()],
    payments: [{ ...paymentFixture(), status: 'partial_refunded', enrollment_refunds: [refundFixture()] }],
  }, { status: 201 }) })
  try {
    await ui.click('환불')
    await ui.fill(document.querySelector('article input[inputmode="numeric"]')!, '10000')
    await ui.click('환불 저장')
    const savedText = document.body.textContent ?? ''
    if (ui.button('확인')) await ui.click('확인')
    const metrics = document.querySelector('.admin-metric-strip')!
    assert.match(metrics.textContent ?? '', /환불−10,000원/)
    const writes = Array.from(document.querySelectorAll('button')).filter((button) => (
      ['수납 추가', '수강 종료', '환불', '정정', '취소'].includes(button.textContent?.trim() ?? '')
    ))
    assert.ok(writes.length >= 8, 'check drawer actions and both payment layouts')
    assert.ok(writes.every((button) => button.disabled), 'a cached committed snapshot cannot authorize a new write without a fresh read')
    await ui.click('환불')
    assert.equal(ui.button('환불 저장'), undefined)
    assert.equal(ui.posted.length, 1)
    assert.match(savedText, /환불.*저장.*완료.*갱신/)
    assert.match(savedText, /새로고침/)
  } finally { await ui.close() }
})

test('switching students clears the previous payment cards even when the new history fails', async () => {
  const ui = await setup({ failRefresh: true })
  try {
    assert.ok(ui.button('환불'))
    await ui.switchEnrollment()
    assert.match(document.body.textContent ?? '', /다음 학생/)
    assert.ok(!ui.button('환불'), 'student A payments must not remain under student B')
    assert.ok(!ui.button('정정'))
    assert.ok(!ui.button('취소'))
    assert.equal(ui.button('수납 추가')?.disabled, true)
    assert.equal(ui.button('수강 종료')?.disabled, true)
    assert.deepEqual(ui.posted, [])
  } finally { await ui.close() }
})

for (const outcome of ['success', 'failure'] as const) {
  test(`late previous-student read ${outcome} cannot replace the current student's successful read`, async () => {
    let finishFirst!: (response: Response) => void
    const nextPayment = { ...paymentFixture(200), enrollment_id: 2, amount: 5000,
      enrollments: { ...paymentFixture().enrollments!, id: 2, name: '다음 학생' } }
    const ui = await setup({ firstRead: new Promise<Response>((resolve) => { finishFirst = resolve }),
      secondRead: Response.json({ payments: [nextPayment] }) })
    try {
      await ui.switchEnrollment()
      const metrics = document.querySelector('.admin-metric-strip')!
      assert.match(metrics.textContent ?? '', /총 수납5,000원/)
      await ui.act(async () => finishFirst(outcome === 'success'
        ? Response.json({ payments: [paymentFixture()] })
        : Response.json({ error: 'previous student failed' }, { status: 500 })))
      assert.match(metrics.textContent ?? '', /총 수납5,000원/)
      assert.doesNotMatch(metrics.textContent ?? '', /30,000원/)
      assert.equal(ui.button('수납 추가')?.disabled, false)
      assert.ok(!ui.button('확인'), 'a stale failure must not create an error for the current student')
    } finally { await ui.close() }
  })
}

test('loading payment history does not expose an invented balance or enabled write actions', async () => {
  let finishRead!: (response: Response) => void
  const ui = await setup({ firstRead: new Promise<Response>((resolve) => { finishRead = resolve }) })
  try {
    assert.equal(ui.button('수납 추가')?.disabled, true)
    assert.equal(ui.button('수강 종료')?.disabled, true)
    assert.equal(ui.button('환불'), undefined)
    const metrics = document.querySelector('.admin-metric-strip')!
    assert.equal(metrics.textContent?.includes('30,000'), false)
    assert.match(metrics.textContent ?? '', /미납확인 중/)
    await ui.act(async () => finishRead(Response.json({ payments: [paymentFixture()] })))
    assert.equal(ui.button('수납 추가')?.disabled, false)
    assert.equal(ui.button('수강 종료')?.disabled, false)
    assert.match(metrics.textContent ?? '', /미납0원/)
  } finally { await ui.close() }
})

test('already cancelled enrollment never enables additional payment or manual end', async () => {
  const ui = await setup({ cancelled: true })
  try {
    assert.equal(ui.button('수납 추가')?.disabled, true)
    assert.equal(ui.button('수강 종료')?.disabled, true)
    const corrections = Array.from(document.querySelectorAll('button')).filter((button) => button.textContent?.trim() === '정정')
    assert.ok(corrections.length > 0)
    assert.ok(corrections.every((button) => button.disabled), 'ended enrollments cannot open a refund-and-recollection correction')
    assert.ok(corrections.every((button) => /종료/.test(button.title)), 'explain why correction is unavailable')
    await ui.click('수납 추가')
    assert.equal(ui.button('결제 저장'), undefined)
    assert.deepEqual(ui.posted, [])
  } finally { await ui.close() }
})

test('unconfirmed manual termination keeps the reason and does not mark the enrollment ended', async () => {
  const ui = await setup({ endResponse: Response.json(null) })
  try {
    await ui.click('수강 종료')
    const reason = document.querySelector('textarea[aria-label="수강 종료 사유"]') as HTMLTextAreaElement
    await ui.fill(reason, '중단 사유')
    await ui.click('수강 종료 확인')
    assert.ok(ui.button('수강 종료 확인'))
    assert.equal(reason.value, '중단 사유')
    assert.equal(ui.readCount(), 1)
    assert.equal(ui.button('수납 추가')?.disabled, false)
  } finally { await ui.close() }
})

test('manual termination requires a reason and keeps retained tuition while blocking new payments after refresh failure', async () => {
  const ui = await setup({ priorRefund: true, failRefresh: true, failParentRefresh: true })
  try {
    await ui.click('수강 종료')
    assert.match(document.body.textContent ?? '', /20,000.*보존/)
    const reason = document.querySelector('textarea[aria-label="수강 종료 사유"]') as HTMLTextAreaElement
    assert.ok(reason)
    assert.equal(ui.button('수강 종료 확인')?.disabled, true)
    await ui.fill(reason, '  개인 사정으로 수강 중단  ')
    assert.equal(ui.button('수강 종료 확인')?.disabled, false)
    await ui.click('수강 종료 확인')
    assert.deepEqual(ui.posted, [{ url: '/api/enrollments/1/end', body: { reason: '개인 사정으로 수강 중단' } }])
    assert.equal(ui.button('수납 추가')?.disabled, true)
    assert.match(document.body.textContent ?? '', /수강종료/)
    assert.match(document.body.textContent ?? '', /종료.*저장.*완료.*갱신/)
  } finally { await ui.close() }
})
