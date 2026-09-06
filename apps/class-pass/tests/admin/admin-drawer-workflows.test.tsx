import { strict as assert } from 'node:assert'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { JSDOM } = require('../_setup/dom.cjs')

test('list editors use shared drawers, preserve failed drafts and submit only once', async (t) => {
  const dom = new JSDOM('<div class="admin-shell"><div id="root"></div><div id="admin-portal-root"></div></div>', { url: 'http://localhost/police/dashboard/courses', pretendToBeVisual: true })
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
    if (request === 'next/navigation') return { useParams: () => ({}), useRouter: () => ({ push() {}, refresh() {} }), usePathname: () => '/police/dashboard/courses' }
    return originalLoad.call(this, request, parent, isMain)
  }
  const { act, createElement: h } = require('react') as typeof import('react')
  const { createRoot } = require('react-dom/client') as typeof import('react-dom/client')
  const { TenantProvider } = require('../../src/components/TenantProvider')
  const { buildFallbackTenantConfig } = require('../../src/lib/tenant')
  const root = createRoot(document.getElementById('root')!)
  const originalFetch = globalThis.fetch
  const cases = [
    { file: 'staff/staff-page-client', props: { initialAccounts: [] }, trigger: '+ 직원 등록', input: '직원 로그인 ID', field: 'name', response: { account: { id: 'test', name: '검증 입력', created_at: '2026-09-05' } } },
    { file: 'popups/popups-page-client', props: { initialPopups: [] }, trigger: '+ 새 팝업', input: '제목', field: 'title', response: { popup: { id: 1, title: '검증 입력', content: '', type: 'notice', is_active: true, created_at: '2026-09-05' } } },
    { file: 'courses/courses-page-client', props: { initialCourses: [] }, trigger: '+ 새 강좌', input: '예: 2026 경찰 기본반', field: 'name', response: { course: { id: 1 } } },
  ]
  try {
    for (const entry of cases) await t.test(entry.file, async () => {
      const Page = require(`../../src/app/(admin)/dashboard/${entry.file}`).default
      const requests: Array<Record<string, unknown>> = []
      let resolve: (response: Response) => void = () => {}
      let reject: (reason: Error) => void = () => {}
      globalThis.fetch = async (_input, init) => {
        if (init?.method === 'POST') {
          requests.push(JSON.parse(String(init.body)))
          return new Promise((yes, no) => { resolve = yes; reject = no })
        }
        return Response.json({ courses: [] })
      }
      await act(async () => root.render(h(TenantProvider, { tenantConfig: buildFallbackTenantConfig('police'), children: h(Page, entry.props as Record<string, unknown>) })))
      assert.ok(!document.querySelector('form'), 'creation form is not permanently expanded in the list')
      const trigger = Array.from(document.querySelectorAll('button')).find(el => el.textContent?.trim() === entry.trigger)!
      assert.ok(trigger)
      trigger.focus()
      await act(async () => trigger.click())
      const dialog = document.querySelector<HTMLFormElement>('[role="dialog"]')!
      assert.ok(dialog.classList.contains('admin-drawer-panel'))
      assert.ok(dialog.closest('#admin-portal-root'))
      const input = dialog.querySelector<HTMLInputElement>(`input[placeholder="${entry.input}"]`)!
      await act(async () => {
        Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, '검증 입력')
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
      })
      const submit = () => dialog.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))
      await act(async () => { submit(); submit() })
      assert.equal(requests.length, 1)
      assert.equal(requests[0][entry.field], '검증 입력')
      assert.equal(dialog.querySelector<HTMLButtonElement>('[aria-label="닫기"]')!.disabled, true)
      await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
      assert.ok(dialog.isConnected, 'saving blocks Escape')
      await act(async () => reject(new TypeError('Failed to fetch')))
      assert.equal(input.value, '검증 입력', 'network errors retain draft')
      assert.ok(dialog.querySelector('[role="alert"]'), 'error is visible inside the drawer')
      await act(async () => submit())
      assert.equal(requests.length, 2, 'retry is enabled')
      await act(async () => resolve(Response.json(entry.response)))
      for (let i = 0; i < 40 && document.querySelector('[role="dialog"]'); i++) {
        await act(async () => new Promise(done => setTimeout(done, 25)))
      }
      assert.ok(!document.querySelector('[role="dialog"]'), 'successful save closes drawer')
      assert.ok(document.activeElement === trigger, 'close restores originating action focus')
      await act(async () => root.render(null))
    })
  } finally {
    await act(async () => root.unmount())
    globalThis.fetch = originalFetch
    Module._load = originalLoad
    dom.window.close()
  }
})
