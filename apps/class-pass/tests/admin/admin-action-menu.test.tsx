import { strict as assert } from 'node:assert'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { AdminActionMenu } from '../../src/components/admin/AdminActionMenu'

const require = createRequire(import.meta.url)
const { JSDOM } = require('../_setup/dom.cjs')

type Item = Parameters<typeof AdminActionMenu>[0]['items'][number]

function setupDom() {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div><button id="outside">outside</button></body></html>',
    { pretendToBeVisual: true, url: 'https://class-pass.test/dashboard' },
  )

  globalThis.window = dom.window as unknown as Window & typeof globalThis
  globalThis.document = dom.window.document
  globalThis.HTMLElement = dom.window.HTMLElement
  globalThis.HTMLAnchorElement = dom.window.HTMLAnchorElement
  globalThis.MouseEvent = dom.window.MouseEvent
  globalThis.KeyboardEvent = dom.window.KeyboardEvent
  globalThis.Node = dom.window.Node
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: dom.window.navigator,
  })
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

  return dom
}

async function renderMenu(items: readonly Item[], label = '명단 작업') {
  setupDom()
  const container = document.getElementById('root')
  assert.ok(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(createElement(AdminActionMenu, { label, items }))
  })

  return {
    root,
    trigger: () => document.querySelector('.admin-action-menu-trigger') as HTMLButtonElement,
    menu: () => document.querySelector('[role="menu"]') as HTMLElement | null,
    menuitems: () => Array.from(document.querySelectorAll('[role="menuitem"]')) as HTMLElement[],
  }
}

async function cleanup(root: Root) {
  await act(async () => {
    root.unmount()
  })
}

async function click(element: Element, init: MouseEventInit = {}) {
  let allowed = true
  await act(async () => {
    allowed = element.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }),
    )
  })
  return allowed
}

async function mouseDown(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
  })
}

async function keyDown(element: Element, key: string) {
  let allowed = true
  await act(async () => {
    allowed = element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  })
  return allowed
}

test('AdminActionMenu opens accessibly and moves focus among enabled menu items', async () => {
  const view = await renderMenu([
    { id: 'csv', label: 'CSV 다운로드', description: '현재 조건으로 파일을 저장합니다.' },
    { id: 'disabled', label: '업로드 준비 중', disabled: true },
    { id: 'reset', label: '전체 초기화', danger: true },
  ])

  const trigger = view.trigger()
  assert.equal(trigger.getAttribute('aria-haspopup'), 'menu')
  assert.equal(trigger.getAttribute('aria-expanded'), 'false')
  assert.equal(trigger.querySelector('[aria-hidden="true"]')?.textContent?.trim(), '▾')
  assert.equal(view.menu(), null)

  trigger.focus()
  await click(trigger)
  assert.equal(trigger.getAttribute('aria-expanded'), 'true')
  assert.ok(view.menu())

  const items = view.menuitems()
  assert.equal(items.length, 3)
  assert.equal(items[1].getAttribute('aria-disabled'), 'true')
  assert.equal(items[2].getAttribute('data-danger'), 'true')

  await keyDown(trigger, 'ArrowDown')
  assert.equal(document.activeElement, items[0])
  await keyDown(items[0], 'ArrowDown')
  assert.equal(document.activeElement, items[2], 'ArrowDown skips disabled items')
  await keyDown(items[2], 'ArrowUp')
  assert.equal(document.activeElement, items[0], 'ArrowUp skips disabled items')
  await keyDown(items[0], 'End')
  assert.equal(document.activeElement, items[2])
  await keyDown(items[2], 'Home')
  assert.equal(document.activeElement, items[0])

  await keyDown(items[0], 'Escape')
  assert.equal(view.menu(), null)
  assert.equal(document.activeElement, trigger)

  await cleanup(view.root)
})

test('AdminActionMenu closes when focus naturally leaves the open menu', async () => {
  const view = await renderMenu([{ id: 'active', label: '활성 작업' }])
  const outside = document.getElementById('outside')
  assert.ok(outside)

  view.trigger().focus()
  await click(view.trigger())
  await keyDown(view.trigger(), 'ArrowDown')
  assert.equal(document.activeElement, view.menuitems()[0])

  const tabWasAllowed = await keyDown(view.menuitems()[0], 'Tab')
  assert.equal(tabWasAllowed, true)
  await act(async () => {
    outside.focus()
  })
  assert.equal(view.menu(), null)
  assert.equal(document.activeElement, outside)

  await cleanup(view.root)
})

test('AdminActionMenu ignores disabled choices and dismisses on outside press', async () => {
  let calls = 0
  const view = await renderMenu([
    { id: 'disabled', label: '비활성 작업', disabled: true, onSelect: () => calls++ },
    { id: 'active', label: '활성 작업', onSelect: () => calls++ },
  ])

  await click(view.trigger())
  const [disabled] = view.menuitems()
  await click(disabled)
  assert.equal(calls, 0)
  assert.ok(view.menu(), 'disabled item does not close or execute')

  const outside = document.getElementById('outside')
  assert.ok(outside)
  await mouseDown(outside)
  assert.equal(view.menu(), null)

  await cleanup(view.root)
})

test('AdminActionMenu restores trigger focus synchronously before selecting once', async () => {
  const observations: boolean[] = []
  const view = await renderMenu([
    {
      id: 'native-file',
      label: '파일 선택',
      onSelect: () => observations.push(document.activeElement === view.trigger()),
    },
  ])

  const trigger = view.trigger()
  trigger.focus()
  await click(trigger)
  await click(view.menuitems()[0])
  assert.deepEqual(observations, [true])
  assert.equal(view.menu(), null)
  assert.equal(document.activeElement, trigger)

  await click(trigger)
  await keyDown(view.trigger(), 'ArrowDown')
  await keyDown(view.menuitems()[0], 'Enter')
  assert.deepEqual(observations, [true, true])
  assert.equal(view.menu(), null)
  assert.equal(document.activeElement, trigger)

  await cleanup(view.root)
})

test('AdminActionMenu renders href items as links and preserves modified clicks', async () => {
  let calls = 0
  const view = await renderMenu([
    { id: 'xlsx', label: 'XLSX 다운로드', href: '#exports-students', onSelect: () => calls++ },
  ])

  await click(view.trigger())
  const link = view.menuitems()[0] as HTMLAnchorElement
  assert.equal(link.tagName, 'A')
  assert.equal(link.getAttribute('href'), '#exports-students')

  const modifiedClickWasAllowed = await click(link, { metaKey: true })
  assert.equal(modifiedClickWasAllowed, true)
  assert.equal(calls, 0)
  assert.ok(view.menu(), 'modified link clicks keep normal browser behavior')

  link.focus()
  await keyDown(link, ' ')
  assert.equal(calls, 1)
  assert.equal(document.location.hash, '#exports-students')
  assert.equal(view.menu(), null)
  assert.equal(document.activeElement, view.trigger())

  await click(view.trigger())
  const normalClickWasAllowed = await click(view.menuitems()[0])
  assert.equal(normalClickWasAllowed, true)
  assert.equal(calls, 2)
  assert.equal(view.menu(), null)

  await cleanup(view.root)
})
