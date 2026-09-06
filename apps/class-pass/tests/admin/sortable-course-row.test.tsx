import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'

const { JSDOM } = createRequire(import.meta.url)('../_setup/dom.cjs')

test('course grip supports keyboard ordering, locks while disabled and cancels with Escape', async (t) => {
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true })
  const environment = {
    window: dom.window, document: dom.window.document,
    HTMLElement: dom.window.HTMLElement, SVGElement: dom.window.SVGElement,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  }
  const previous = Object.fromEntries(Object.keys(environment).map(key => [key, Reflect.get(globalThis, key)]))
  Object.assign(globalThis, environment)
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  // Match tsx's CJS transform of the component so both use the same React context.
  const { Reorder } = createRequire(import.meta.url)('framer-motion')
  const { SortableCourseRow } = await import('../../src/components/admin/SortableCourseRow')
  const root = createRoot(dom.window.document.getElementById('root')!, { onRecoverableError: (error) => { throw error } })
  t.after(async () => { await act(async () => root.unmount()); dom.window.close(); Object.assign(globalThis, previous) })
  const moves: string[] = []
  let cancelled = 0
  let opened = 0
  let ended = 0
  async function render(disabled: boolean, dragging: boolean) {
    await act(async () => root.render(createElement('table', null,
      createElement(Reorder.Group, { as: 'tbody', values: [1], onReorder() {} },
        createElement(SortableCourseRow, {
          id: 1, name: '테스트 강좌', disabled, dragging,
          onBegin: () => true, onEnd: () => { ended++ }, onCancel: () => { cancelled++ },
          onMove: (direction) => moves.push(direction), onOpen: () => { opened++ },
          children: (handle) => createElement('td', null, handle, '테스트 강좌'),
        })))))
  }
  await render(false, false)
  const grip = dom.window.document.querySelector('button')!
  assert.equal(grip.getAttribute('aria-keyshortcuts'), 'ArrowUp ArrowDown')
  await act(async () => grip.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })))
  assert.deepEqual(moves, ['down'])
  await act(async () => grip.click())
  assert.equal(opened, 0, 'the grip must not navigate to the course')
  await render(true, false)
  assert.equal(grip.getAttribute('aria-disabled'), 'true')
  await act(async () => grip.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })))
  assert.deepEqual(moves, ['down'])
  await render(false, true)
  await act(async () => grip.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  assert.equal(cancelled, 1)
  assert.equal(ended, 0, 'cancellation must not call the save callback')
})
