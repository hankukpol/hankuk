import { strict as assert } from 'node:assert'
import { test, type TestContext } from 'node:test'
import { createRequire } from 'node:module'
import { act, createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'

const { JSDOM } = createRequire(import.meta.url)('../_setup/dom.cjs')
const seed = [
  { id: 1, status: 'active', sort_order: 0 },
  { id: 2, status: 'archived', sort_order: 1 },
  { id: 3, status: 'active', sort_order: 2 },
  { id: 4, status: 'active', sort_order: 3 },
]

async function fixture(t: TestContext, succeed = true) {
  const path = '../../src/components/admin/useCourseOrdering'
  const module = await import(path).catch(() => null)
  assert.equal(typeof module?.useCourseOrdering, 'function', 'course ordering must expose a shared interaction boundary')
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true })
  const previous = { window: globalThis.window, document: globalThis.document }
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })
  const requests: number[][] = []
  let finishRequest: (() => void) | undefined
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    assert.equal(_url, '/api/courses/reorder')
    assert.equal(init.method, 'PATCH')
    requests.push(JSON.parse(init.body as string).courseIds)
    await new Promise<void>((resolve) => { finishRequest = resolve })
    return new Response(JSON.stringify(succeed ? { success: true } : { error: '저장 실패' }), { status: succeed ? 200 : 500 })
  })
  let current: any
  let courses = seed
  let feedback = ''
  function Harness() {
    const [items, setItems] = useState(seed)
    courses = items
    current = module.useCourseOrdering({ courses: items, filter: 'active', onChange: setItems, onFeedback: (message: string) => { feedback = message } })
    return createElement('div', null, items.map((item) => createElement('span', { key: item.id }, item.id)))
  }
  const root = createRoot(dom.window.document.getElementById('root')!)
  await act(async () => root.render(createElement(Harness)))
  t.after(async () => { await act(async () => root.unmount()); dom.window.close(); Object.assign(globalThis, previous) })
  return { get api() { return current }, get ids() { return courses.map((c) => c.id) }, get feedback() { return feedback }, requests,
    finish: async () => { await act(async () => finishRequest!()) } }
}

test('drag preview preserves hidden courses and cancellation never saves', async (t) => {
  const f = await fixture(t)
  await act(async () => { f.api.beginDrag(1); f.api.preview([3, 4, 1]) })
  assert.deepEqual(f.ids, [3, 2, 4, 1])
  assert.equal(f.requests.length, 0)
  await act(async () => f.api.cancelDrag())
  // Motion queues onDragEnd on release; a cancelled draft must remain unsaved.
  await act(async () => f.api.endDrag())
  assert.deepEqual(f.ids, [1, 2, 3, 4])
  assert.equal(f.requests.length, 0)
})

test('drop saves exactly once, blocks concurrent moves, and sends all course IDs', async (t) => {
  const f = await fixture(t)
  await act(async () => { f.api.beginDrag(1); f.api.preview([3, 4, 1]) })
  await act(async () => { void f.api.endDrag(); void f.api.move(3, 'down'); void f.api.endDrag() })
  assert.deepEqual(f.requests, [[3, 2, 4, 1]])
  assert.equal(f.api.pending, true)
  await f.finish()
  assert.equal(f.api.pending, false)
  assert.match(f.feedback, /저장/)
})

test('failed keyboard reorder restores the previous visible and hidden order', async (t) => {
  const f = await fixture(t, false)
  await act(async () => { void f.api.move(1, 'down') })
  assert.deepEqual(f.ids, [3, 2, 1, 4])
  await f.finish()
  assert.deepEqual(f.ids, [1, 2, 3, 4])
  assert.equal(f.feedback, '저장 실패')
})

test('same-position drop, boundaries, invalid IDs and duplicate drafts do not save', async (t) => {
  const f = await fixture(t)
  await act(async () => { void f.api.move(1, 'up'); void f.api.move(4, 'down'); f.api.beginDrag(2); f.api.beginDrag(1); f.api.preview([3, 3, 1]); void f.api.endDrag() })
  assert.deepEqual(f.ids, [1, 2, 3, 4])
  assert.equal(f.requests.length, 0)
})
