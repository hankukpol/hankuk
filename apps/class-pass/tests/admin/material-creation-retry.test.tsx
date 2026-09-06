import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
const require = createRequire(import.meta.url)
const { JSDOM } = require('../_setup/dom.cjs')

test('HTTP material creation uses secure UUID fallback, separates pre-send errors, and retains committed retries across auth failures', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/police/dashboard/courses/8/materials', pretendToBeVisual: true })
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element, Node: dom.window.Node, HTMLInputElement: dom.window.HTMLInputElement,
    HTMLSelectElement: dom.window.HTMLSelectElement, MutationObserver: dom.window.MutationObserver,
    getComputedStyle: dom.window.getComputedStyle, requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
  Object.defineProperty(dom.window, 'matchMedia', { value: () => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }) })
  const Module = require('node:module'), original = Module._load, originalFetch = globalThis.fetch
  const originalCryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto')!
  const secureCrypto = globalThis.crypto
  Module._load = function (id: string, parent: unknown, isMain: boolean) {
    if (id === 'next/navigation') return { useParams: () => ({ id: '8' }) }
    return original.call(this, id, parent, isMain)
  }
  const { act, createElement } = require('react'), { createRoot } = require('react-dom/client')
  const { TenantProvider } = require('../../src/components/TenantProvider')
  const { buildFallbackTenantConfig } = require('../../src/lib/tenant')
  const Page = require('../../src/app/(admin)/dashboard/courses/[id]/materials/course-materials-page-client').default
  const root = createRoot(document.getElementById('root')!)
  const posted: Array<Record<string, unknown>> = []
  const committedMaterials = new Map<string, { id: number; course_id: number; name: string; material_type: string; is_active: boolean; sort_order: number }>()
  const retryErrors = [401, 403, 400, 409]
  globalThis.fetch = async (_url, init) => {
    posted.push(JSON.parse(String(init?.body)))
    const requestId = String(posted.at(-1)!.requestId)
    const status = retryErrors[posted.length - 2]
    if (status) return Response.json({ error: '인증 또는 요청 확인이 필요합니다.' }, { status })
    if (!committedMaterials.has(requestId)) committedMaterials.set(requestId, { id: 90 + committedMaterials.size + 1, course_id: 8, name: '자료', material_type: 'handout', is_active: true, sort_order: 0 })
    if (posted.length === 1) throw new TypeError('response lost after commit')
    return Response.json({ material: committedMaterials.get(requestId), warning: '저장 완료. 반영 지연 안내' }, { status: 201 })
  }
  const button = (text: string) => { const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === text); assert.ok(b, text); return b }
  try {
    await act(async () => root.render(createElement(TenantProvider, { tenantConfig: buildFallbackTenantConfig('police'), children: createElement(Page, { initialData: { course: { id: 8, name: '강좌' }, materials: [], subjects: [] } }) })))
    await act(async () => button('새 배부자료').click())
    const input = document.querySelector<HTMLInputElement>('input[placeholder="배부자료 이름"]')!
    await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, '자료'); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })) })
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined })
    await act(async () => button('배부자료 생성').click())
    assert.equal(posted.length, 0, 'no secure random source means no request is sent')
    assert.ok(!input.closest('fieldset')?.disabled, 'pre-send error must keep the draft editable')
    assert.ok(!button('취소').disabled, 'pre-send error can be closed')
    assert.doesNotMatch(document.querySelector('[role="alert"]')?.textContent ?? '', /저장됐을|잠갔습니다|중복 생성/, 'pre-send failure must not claim an uncertain commit')
    // Browsers on a non-secure HTTP host can lack randomUUID while retaining secure getRandomValues.
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues: secureCrypto.getRandomValues.bind(secureCrypto) } })
    await act(async () => button('배부자료 생성').click())
    assert.equal(posted.length, 1, 'HTTP randomUUID fallback must reach the POST boundary')
    assert.match(String(posted[0].requestId), /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i, 'fallback sets UUID v4 version and RFC variant bits')
    assert.equal(input.value, '자료')
    assert.ok(input.closest('fieldset')?.disabled, 'uncertain result locks payload edits')
    assert.ok(button('취소').disabled, 'cannot discard uncertain identity')
    assert.ok(!button('배부자료 생성').disabled, 'same logical request can be retried')
    for (const status of retryErrors) {
      await act(async () => button('배부자료 생성').click())
      assert.deepEqual(posted.at(-1), posted[0], `retry ${status} sends the original request`)
      assert.equal(input.value, '자료')
      assert.ok(input.closest('fieldset')?.disabled, `retry ${status} cannot establish whether the original request committed`)
      assert.ok(button('취소').disabled, `retry ${status} must not discard uncertain identity`)
      assert.ok(document.querySelector<HTMLButtonElement>('[role="dialog"] button[aria-label="닫기"]')?.disabled)
      assert.ok(!button('배부자료 생성').disabled, `retry ${status} retains a recovery action`)
    }
    await act(async () => button('배부자료 생성').click())
    assert.deepEqual(posted.at(-1), posted[0], 'authentication recovery must replay the original committed request')
    assert.equal(committedMaterials.size, 1, 'the persisted request boundary contains only the first committed material')
    assert.equal(document.querySelectorAll('.admin-material-item').length, 1)
    assert.match(document.querySelector('[role="status"]')?.textContent ?? '', /반영 지연 안내/)
  } finally { await act(async () => root.unmount()); Module._load = original; globalThis.fetch = originalFetch; Object.defineProperty(globalThis, 'crypto', originalCryptoDescriptor); dom.window.close() }
})
