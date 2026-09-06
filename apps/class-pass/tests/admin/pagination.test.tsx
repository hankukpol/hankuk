import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { createElement, act, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AdminPagination } from '../../src/components/admin/AdminPagination'

const require = createRequire(import.meta.url)
const { JSDOM } = require('../_setup/dom.cjs')

test('empty and fixed-size lists cannot navigate outside their page bounds', () => {
  for (const [currentPage, pageCount, totalCount, disabled] of [[1, 0, 0, [true, true]], [1, 3, 126, [true, false]], [3, 3, 126, [false, true]]] as const) {
    const dom = new JSDOM(renderToStaticMarkup(createElement(AdminPagination, {currentPage, pageCount, totalCount, pageSize: 50, onPageChange: () => {}})))
    const buttons = Array.from(dom.window.document.querySelectorAll('button')) as HTMLButtonElement[]
    assert.deepEqual(buttons.map(button => button.disabled), disabled)
    assert.ok(buttons.every(button => button.type === 'button'))
    assert.equal(dom.window.document.querySelector('select'), null, 'fixed-size matrix must not expose unsupported size changes')
    if (!totalCount) assert.match(dom.window.document.body.textContent, /0~0명 표시/)
    dom.window.close()
  }
})

test('previous/next and page-size selection update the rendered range without submitting', async () => {
  const dom = new JSDOM('<div id="root"></div>', {url: 'http://localhost'})
  Object.assign(globalThis, {window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true})
  const { createRoot } = require('react-dom/client') as typeof import('react-dom/client')
  function Fixture() {
    const [page, setPage] = useState(1)
    const [size, setSize] = useState(50)
    return <AdminPagination currentPage={page} pageCount={Math.ceil(126/size)} pageSize={size} totalCount={126} onPageChange={setPage} onPageSizeChange={next=>{setSize(next);setPage(1)}} />
  }
  const root = createRoot(document.getElementById('root')!)
  try {
    await act(async () => root.render(createElement(Fixture)))
    const buttons = () => document.querySelectorAll('button')
    await act(async () => buttons()[1].click())
    assert.match(document.body.textContent!, /51~100명 표시/)
    await act(async () => buttons()[1].click())
    assert.match(document.body.textContent!, /101~126명 표시/)
    assert.equal(buttons()[1].disabled, true)
    await act(async () => buttons()[0].click())
    assert.match(document.body.textContent!, /51~100명 표시/)
    const select = document.querySelector('select')!
    await act(async () => {select.value = '20';select.dispatchEvent(new dom.window.Event('change', {bubbles:true}))})
    assert.match(document.body.textContent!, /1~20명 표시/)
    assert.equal(buttons()[0].disabled, true)
    assert.match(document.querySelector('.admin-pagination-current')!.getAttribute('aria-label')!, /전체 7페이지/)
  } finally {
    await act(async () => root.unmount())
    dom.window.close()
  }
})
