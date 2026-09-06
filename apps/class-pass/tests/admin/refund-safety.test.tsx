import { strict as assert } from 'node:assert'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { RefundModal } from '../../src/components/payments/RefundModal'
import { paymentFixture as fixture } from './refund-test-fixtures'

const require = createRequire(import.meta.url)
const { JSDOM } = require('../_setup/dom.cjs')
async function setup() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true, url: 'https://class-pass.test' })
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, MouseEvent: dom.window.MouseEvent, KeyboardEvent: dom.window.KeyboardEvent, IS_REACT_ACT_ENVIRONMENT: true })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
  const root = createRoot(document.getElementById('root')!)
  const payments = [fixture(100,'same'),fixture(101,'same'),fixture(102,'other')]
  const submitted: Array<Parameters<Parameters<typeof RefundModal>[0]['onConfirm']>[0]> = []
  await act(async () => { root.render(createElement(RefundModal, { open: true, payment: payments[0], payments, courseName: '테스트 강좌', onClose: () => {}, onConfirm: (input) => submitted.push(input) })) })
  return { root, submitted }
}
async function click(element: HTMLElement) { await act(async () => { element.click() }) }

test('opening a refund selects only the clicked transaction, not all of the student payments', async () => {
  const { root } = await setup()
  try {
    const choices = Array.from(document.querySelectorAll('article input[type="checkbox"]')) as HTMLInputElement[]
    assert.deepEqual(choices.map((choice) => choice.checked), [true,false,false])
  } finally { await act(async () => root.unmount()) }
})

test('explicit bundle selection includes same checkout group only', async () => {
  const { root } = await setup()
  try {
    const button = Array.from(document.querySelectorAll('button')).find((entry) => entry.textContent === '동일 결제 모두 선택')
    assert.ok(button)
    await click(button)
    const choices = Array.from(document.querySelectorAll('article input[type="checkbox"]')) as HTMLInputElement[]
    assert.deepEqual(choices.map((choice) => choice.checked), [true,true,false])
  } finally { await act(async () => root.unmount()) }
})

test('retries reuse the request identifier and course termination is an explicit choice', async () => {
  const { root, submitted } = await setup()
  try {
    const save = Array.from(document.querySelectorAll('button')).find((entry) => entry.textContent === '환불 저장')!
    await click(save)
    await click(save)
    assert.equal(submitted.length, 2)
    assert.match(submitted[0].requestId, /^[\da-f-]{36}$/i)
    assert.equal(submitted[0].requestId, submitted[1].requestId)
    assert.equal(submitted[0].endEnrollment, false)
    const endChoice = document.querySelector('input[aria-label="환불 후 수강 종료"]') as HTMLInputElement
    assert.ok(endChoice)
    await click(endChoice)
    await click(save)
    assert.equal(submitted[2].endEnrollment, true)
  } finally { await act(async () => root.unmount()) }
})
