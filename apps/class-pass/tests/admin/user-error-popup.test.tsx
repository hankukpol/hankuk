import { strict as assert } from 'node:assert'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { JSDOM } = require('../_setup/dom.cjs')

test('student management displays a Korean error in its actual acknowledgement popup', async () => {
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
  const originalFetch = globalThis.fetch
  // All I/O stays in this fixture; no student records are read or written.
  globalThis.fetch = async () => Response.json({ error: 'Failed to fetch' }, { status: 503 })
  const root = createRoot(document.getElementById('root')!)
  try {
    await act(async () => root.render(createElement(TenantProvider, {
      tenantConfig: buildFallbackTenantConfig('police'),
      children: createElement(Page, { initialLoaded: true, initialError: 'Failed to fetch' }),
    })))
    const dialog = document.querySelector('[role="dialog"]')
    assert.ok(dialog, 'the real error popup must open')
    assert.match(dialog.textContent ?? '', /서버에 연결하지 못했습니다/)
    assert.match(dialog.textContent ?? '', /인터넷 연결을 확인/)
    assert.match(dialog.textContent ?? '', /처리 결과를 먼저 확인/)
    assert.doesNotMatch(document.body.textContent ?? '', /Failed to fetch/)
    const confirm = Array.from(dialog.querySelectorAll('button')).find(button => button.textContent === '확인')
    assert.ok(confirm, 'the existing acknowledgement action stays available')
  } finally {
    await act(async () => root.unmount())
    globalThis.fetch = originalFetch
    Module._load = originalLoad
    dom.window.close()
  }
})
