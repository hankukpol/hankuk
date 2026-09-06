import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { enrollmentFixture, paymentFixture, refundFixture } from './refund-test-fixtures'

const require = createRequire(import.meta.url)
const { JSDOM } = require('../_setup/dom.cjs')

async function setup(failure: 'network' | 'malformed' | 'wrong-scope' | 'refresh' | 'pending' | 'unknown-conflict') {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost', pretendToBeVisual: true })
  Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element, Node: dom.window.Node, HTMLInputElement: dom.window.HTMLInputElement, MutationObserver: dom.window.MutationObserver,
    getComputedStyle: dom.window.getComputedStyle, IS_REACT_ACT_ENVIRONMENT: true })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
  Object.defineProperty(dom.window, 'matchMedia', { value: () => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }) })
  const { act, createElement } = require('react') as typeof import('react')
  const { createRoot } = require('react-dom/client') as typeof import('react-dom/client')
  const { EnrollmentPaymentDrawer } = require('../../src/components/payments/EnrollmentPaymentDrawer') as typeof import('../../src/components/payments/EnrollmentPaymentDrawer')
  const posted: Array<Record<string, any>> = []
  let reads = 0
  let release: (() => void) | undefined
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (_url, init) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body)); posted.push(body)
      if (failure === 'unknown-conflict') {
        if (posted.length === 1) throw new Error('response lost')
        return Response.json({ error: '요청 정보가 변경되었습니다.' }, { status: 409 })
      }
      if (failure === 'network') throw new Error('response lost')
      if (failure === 'malformed') return Response.json({ success: true }, { status: 201 })
      if (failure === 'pending') await new Promise<void>(resolve => { release = resolve })
      const refund = refundFixture(body.refund.amount)
      return Response.json({ requestId: body.requestId, refunds: [refund],
        refundedPayments: [{ ...paymentFixture(), status: 'fully_refunded', enrollment_refunds: [refund] }],
        payments: [{ ...paymentFixture(101), enrollment_id: failure === 'wrong-scope' ? 99 : 1,
          amount: body.payment.amount, memo: '정정 신규 재수납', paid_at: '2026-09-06T01:00:00Z' }],
      }, { status: 201 })
    }
    reads++
    if (failure === 'refresh' && reads > 1) return Response.json({ error: 'refresh unavailable' }, { status: 500 })
    return Response.json({ payments: [paymentFixture()] })
  }
  const root = createRoot(document.getElementById('root')!)
  const render = () => root.render(createElement(EnrollmentPaymentDrawer, { open: true, enrollment: enrollmentFixture(),
    course: { id: 2, name: '테스트 강좌', tuition_amount: 30000 }, onClose: () => {}, onDataChanged: () => {},
  }))
  await act(async () => render())
  const button = (label: string) => Array.from(document.querySelectorAll('button')).find(item => item.textContent?.trim() === label)
  const click = async (label: string) => { const item = button(label); assert.ok(item, label); await act(async () => item.click()) }
  return { posted, button, click, act, reads: () => reads, release: () => release?.(),
    async rerenderSameEnrollment() { await act(async () => render()) },
    async close() { release?.(); await act(async () => root.unmount()); globalThis.fetch = originalFetch; dom.window.close() },
  }
}

for (const failure of ['network', 'malformed', 'wrong-scope'] as const) {
  test(`uncertain correction ${failure} preserves the UUID and original payload for retry`, async () => {
    const ui = await setup(failure)
    try {
      await ui.click('정정'); await ui.click('정정 저장')
      assert.ok(ui.button('정정 저장'), 'ambiguous success cannot dismiss correction')
      assert.equal(ui.reads(), 1)
      if (ui.button('확인')) await ui.click('확인')
      const numericInput = document.querySelector('input[inputmode="numeric"]') as HTMLInputElement
      assert.ok(numericInput.matches(':disabled'), 'unknown result must freeze amounts until resolved')
      await ui.click('정정 저장')
      assert.equal(ui.posted.length, 2)
      assert.match(String(ui.posted[0].requestId), /^[\da-f-]{36}$/i)
      assert.deepEqual(ui.posted[1], ui.posted[0])
    } finally { await ui.close() }
  })
}

test('committed correction snapshot survives failed refresh and blocks fresh financial actions', async () => {
  const ui = await setup('refresh')
  try {
    await ui.click('정정'); await ui.click('정정 저장')
    assert.equal(ui.button('정정 저장'), undefined)
    assert.match(document.body.textContent ?? '', /정정.*저장.*완료.*갱신/)
    if (ui.button('확인')) await ui.click('확인')
    assert.equal(ui.button('수납 추가')?.disabled, true)
    const paymentRows = Array.from(document.querySelectorAll('tbody tr'))
    assert.equal(paymentRows.length, 2, 'both the refunded original and new replacement payment must remain visible')
    assert.equal(paymentRows.filter(row => row.textContent?.includes('정정 신규 재수납')).length, 1,
      'the new payment must be added exactly once')
    assert.match(document.body.textContent ?? '', /전체 2건 · 합계 60,000원/)
    const metrics = Array.from(document.querySelectorAll('.admin-metric-strip article')).map(article => article.textContent)
    assert.deepEqual(metrics, ['총 수납60,000원', '환불−30,000원', '미납0원'])
    const renderedAmounts = Array.from(document.querySelectorAll('.admin-metric-strip article p:last-child'))
      .map(value => Number(value.textContent?.replace(/[^\d]/g, '')))
    assert.equal(renderedAmounts[0] - renderedAmounts[1], 30000, 'visible net collection must include the replacement payment')
    assert.equal(ui.posted.length, 1)
  } finally { await ui.close() }
})

test('saving correction freezes input and prevents synchronous double submission', async () => {
  const ui = await setup('pending')
  try {
    await ui.click('정정')
    await ui.act(async () => { const save = ui.button('정정 저장')!; save.click(); save.click() })
    assert.equal(ui.posted.length, 1)
    assert.ok(document.querySelector('input[inputmode="numeric"]')?.matches(':disabled'))
    await ui.act(async () => ui.release())
  } finally { await ui.close() }
})

test('a conflict after an uncertain commit cannot discard the original request key', async () => {
  const ui = await setup('unknown-conflict')
  try {
    await ui.click('정정')
    for (let index = 0; index < 3; index++) {
      await ui.click('정정 저장')
      if (ui.button('확인')) await ui.click('확인')
    }
    assert.equal(ui.posted.length, 3)
    assert.deepEqual(ui.posted[2], ui.posted[0])
    assert.ok(document.querySelector('input[inputmode="numeric"]')?.matches(':disabled'))
  } finally { await ui.close() }
})

test('same-student parent rerender preserves unresolved correction and blocks fresh financial actions', async () => {
  const ui = await setup('network')
  try {
    await ui.click('정정'); await ui.click('정정 저장')
    if (ui.button('확인')) await ui.click('확인')
    await ui.rerenderSameEnrollment()
    assert.ok(ui.button('정정 저장'), 'new props object for the same student cannot discard unresolved correction')
    assert.equal(ui.button('수납 추가')?.disabled, true)
    assert.equal(ui.button('수강 종료')?.disabled, true)
    assert.equal(ui.reads(), 1, 'same identity must not reset or refresh an unresolved request')
    await ui.click('정정 저장')
    assert.equal(ui.posted.length, 2)
    assert.deepEqual(ui.posted[1], ui.posted[0])
  } finally { await ui.close() }
})
