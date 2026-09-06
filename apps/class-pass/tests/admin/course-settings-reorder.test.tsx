import { strict as assert } from 'node:assert'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { JSDOM } = require('../_setup/dom.cjs')

test('named field order controls move the intended draft and disable list boundaries without saving', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/police/dashboard/courses/8/settings' })
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })
  const Module = require('node:module')
  const originalLoad = Module._load
  const originalFetch = globalThis.fetch
  let writes = 0
  globalThis.fetch = async () => { writes++; throw new Error('Draft controls must not save') }
  Module._load = function(request: string, parent: unknown, isMain: boolean) {
    if (request === 'next/navigation') return { useParams: () => ({ id: '8' }), useRouter: () => ({ push() {}, refresh() {} }) }
    return originalLoad.call(this, request, parent, isMain)
  }
  const { act, createElement } = require('react')
  const { createRoot } = require('react-dom/client')
  const { TenantProvider } = require('../../src/components/TenantProvider')
  const { buildFallbackTenantConfig } = require('../../src/lib/tenant')
  const Page = require('../../src/app/(admin)/dashboard/courses/[id]/course-detail-page-client').default
  const root = createRoot(document.getElementById('root')!)
  try {
    await act(async () => root.render(createElement(TenantProvider, { tenantConfig: buildFallbackTenantConfig('police'), children: createElement(Page, {
      initialLoaded: true, initialData: { course: { id: 8, name: '검증 강좌', course_type: 'general', status: 'active', sort_order: 0,
        enrollment_fields: [{ key: 'region', label: '지역', type: 'text' }, { key: 'school', label: '학교', type: 'text' }] }, subjects: [] },
    }) })))
    const tab = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(el => el.textContent === '수강생 정보')!
    await act(async () => tab.click())
    const order = () => Array.from(document.querySelectorAll<HTMLInputElement>('[data-admin-section="fields"] article input')).map(input => input.value)
    const button = (name: string) => document.querySelector<HTMLButtonElement>(`article button[aria-label="${name}"]`)
    assert.deepEqual(order(), ['지역', '학교'])
    assert.ok(button('필드 1 위로 이동'), 'order controls need a clear accessible action')
    assert.equal(button('필드 1 위로 이동')!.disabled, true)
    assert.equal(button('필드 2 아래로 이동')!.disabled, true)
    await act(async () => button('필드 1 아래로 이동')!.click())
    assert.deepEqual(order(), ['학교', '지역'])
    await act(async () => button('필드 2 위로 이동')!.click())
    assert.deepEqual(order(), ['지역', '학교'])
    assert.equal(writes, 0)
  } finally {
    await act(async () => root.unmount())
    Module._load = originalLoad
    globalThis.fetch = originalFetch
    dom.window.close()
  }
})
