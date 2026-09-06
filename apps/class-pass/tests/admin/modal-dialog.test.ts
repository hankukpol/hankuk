import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { createRequire } from 'node:module'

const { JSDOM } = createRequire(import.meta.url)('../_setup/dom.cjs')

async function fixture() {
  const dom = new JSDOM('<!doctype html><body><main><button id="opener">열기</button></main><div id="portal"></div></body>', { pretendToBeVisual: true })
  const modulePath = '../../src/components/admin/modal-dialog-controller'
  const controller = await import(modulePath).catch(() => null)
  assert.equal(typeof controller?.mountModalDialog, 'function', 'shared modal controller must implement the interaction contract')
  const doc: Document = dom.window.document
  doc.getElementById('opener')!.focus()
  function panel(z: number) {
    const overlay = doc.createElement('div')
    overlay.className = 'admin-dialog-backdrop'
    overlay.style.zIndex = String(z)
    overlay.innerHTML = '<div role="dialog" tabindex="-1"><button id="first">취소</button><input disabled /><button hidden>숨김</button><button id="last">확인</button></div>'
    doc.getElementById('portal')!.append(overlay)
    return { overlay, element: overlay.firstElementChild as HTMLElement }
  }
  function key(value: string, shiftKey = false) {
    const event = new dom.window.KeyboardEvent('keydown', { key: value, shiftKey, bubbles: true, cancelable: true })
    doc.activeElement!.dispatchEvent(event)
    return event
  }
  return { dom, doc, panel, key, mount: controller.mountModalDialog }
}

test('opening moves focus inside, locks background and loops Tab around enabled controls', async () => {
  const f = await fixture()
  const p = f.panel(100)
  const dispose = f.mount(p.element, { onClose() {} })
  assert.equal(f.doc.activeElement, p.element)
  assert.equal(f.doc.body.style.overflow, 'hidden')
  assert.equal(f.doc.documentElement.style.overflow, 'hidden', 'root scroller also locks when global overflow-x is set')
  assert.ok(f.doc.querySelector('main')!.hasAttribute('inert'))
  assert.ok(!p.overlay.hasAttribute('inert'), 'backdrop remains clickable')
  f.key('Tab')
  assert.equal(f.doc.activeElement, p.element.querySelector('#first'))
  f.key('Tab', true)
  assert.equal(f.doc.activeElement, p.element.querySelector('#last'))
  f.key('Tab')
  assert.equal(f.doc.activeElement, p.element.querySelector('#first'))
  dispose()
  assert.equal(f.doc.activeElement, f.doc.getElementById('opener'))
  assert.equal(f.doc.body.style.overflow, '')
  assert.equal(f.doc.documentElement.style.overflow, '')
  assert.ok(!f.doc.querySelector('main')!.hasAttribute('inert'))
  f.dom.window.close()
})

test('nested dialogs close only the topmost and preserve parent scroll/focus state', async () => {
  const f = await fixture()
  let parentCloses = 0
  let childCloses = 0
  const parent = f.panel(120)
  const unmountParent = f.mount(parent.element, { onClose() { parentCloses++ } })
  const opener = parent.element.querySelector<HTMLElement>('#last')!
  opener.focus()
  const child = f.panel(140)
  const unmountChild = f.mount(child.element, { onClose() { childCloses++ } })
  f.key('Escape')
  assert.equal(childCloses, 1)
  assert.equal(parentCloses, 0)
  unmountChild()
  child.overlay.remove()
  assert.equal(f.doc.activeElement, opener)
  assert.equal(f.doc.body.style.overflow, 'hidden')
  f.key('Escape')
  assert.equal(parentCloses, 1)
  unmountParent()
  f.dom.window.close()
})

test('pending topmost operation consumes Escape without closing its parent', async () => {
  const f = await fixture()
  let closes = 0
  const parent = f.panel(120)
  const cleanupParent = f.mount(parent.element, { onClose() { closes++ } })
  const child = f.panel(220)
  const options = { onClose() { closes++ }, closeDisabled: true }
  const cleanupChild = f.mount(child.element, options)
  assert.equal(f.key('Escape').defaultPrevented, true)
  assert.equal(closes, 0)
  options.closeDisabled = false
  f.key('Escape')
  assert.equal(closes, 1)
  cleanupChild()
  cleanupParent()
  f.dom.window.close()
})

test('empty/loading panel remains keyboard-contained and existing inert/overflow values restore', async () => {
  const f = await fixture()
  const main = f.doc.querySelector('main')!
  main.setAttribute('inert', '')
  f.doc.body.style.setProperty('overflow', 'scroll', 'important')
  const p = f.panel(100)
  p.element.innerHTML = '<p>불러오는 중</p>'
  const cleanup = f.mount(p.element, { onClose() {} })
  f.key('Tab')
  assert.equal(f.doc.activeElement, p.element)
  cleanup()
  assert.ok(main.hasAttribute('inert'))
  assert.equal(f.doc.body.style.overflow, 'scroll')
  assert.equal(f.doc.body.style.getPropertyPriority('overflow'), 'important')
  f.dom.window.close()
})

test('unmounting a lower dialog does not release the active child or strand focus on removal', async () => {
  const f = await fixture()
  const parent = f.panel(120)
  const disposeParent = f.mount(parent.element, { onClose() {} })
  const child = f.panel(220)
  const disposeChild = f.mount(child.element, { onClose() {} })
  disposeParent()
  parent.overlay.remove()
  assert.equal(f.doc.activeElement, child.element)
  assert.equal(f.doc.body.style.overflow, 'hidden')
  disposeChild()
  assert.equal(f.doc.body.style.overflow, '')
  assert.equal(f.doc.activeElement, f.doc.getElementById('opener'))
  f.dom.window.close()
})

test('removing a dialog DOM node before lifecycle cleanup still restores its opener', async () => {
  const f = await fixture()
  const p = f.panel(100)
  const cleanup = f.mount(p.element, { onClose() {} })
  p.overlay.remove()
  cleanup()
  assert.equal(f.doc.activeElement, f.doc.getElementById('opener'))
  assert.equal(f.doc.body.style.overflow, '')
  assert.ok(!f.doc.querySelector('main')!.hasAttribute('inert'))
  f.dom.window.close()
})
