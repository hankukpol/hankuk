import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { createElement, act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StudentsManageTable } from '../../src/app/(admin)/dashboard/courses/[id]/students/students-manage-table'
import { SortableHeader, useSortState } from '../../src/components/admin/sortable-header'

const require = createRequire(import.meta.url)
const { JSDOM } = require('../_setup/dom.cjs')
const noop = () => {}
const props = {
  filtered: [], summary: { total: 0, active: 8, refunded: 2, suspended: 2 },
  search: '', statusFilter: 'refunded' as const, customFields: [], attendanceEnabled: true,
  currentPage: 1, pageCount: 1, pageSize: 50, totalCount: 0,
  onPageChange: noop, onPageSizeChange: noop, onSearchChange: noop, onStatusFilterChange: noop,
  onResetFilters: noop, onOpenDetail: noop, onOpenStudentHistory: noop, onEdit: noop,
  onResetPin: noop, onApproveDeviceReRegistration: noop, onResetAttendanceDevice: noop,
  onSuspend: noop, onUnsuspend: noop, onDelete: noop,
}

test('roster totals do not turn into the filtered result count and empty filters can be cleared', () => {
  const dom = new JSDOM(renderToStaticMarkup(createElement(StudentsManageTable, props)))
  const text = dom.window.document.body.textContent ?? ''
  assert.match(text, /전체 등록\s*12명/, '8 active + 2 suspended + 2 refunded, not zero filtered results')
  assert.match(text, /조회 결과\s*0명/)
  assert.ok(!text.includes('등록된 수강생이 없습니다.'), 'an empty filter is not an empty course')
  assert.ok(Array.from(dom.window.document.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).some(b => b.textContent === '조건 초기화'))
  assert.equal(dom.window.document.querySelector('input')?.getAttribute('aria-label'), '수강생 검색')
  dom.window.close()
})

test('a truly empty course does not show a misleading filter reset', () => {
  const dom = new JSDOM(renderToStaticMarkup(createElement(StudentsManageTable, {
    ...props, summary: { active: 0, suspended: 0, refunded: 0 }, statusFilter: 'all',
  })))
  assert.match(dom.window.document.body.textContent ?? '', /등록된 수강생이 없습니다/)
  assert.ok(!Array.from(dom.window.document.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).some(b => b.textContent === '조건 초기화'))
  dom.window.close()
})

test('roster pagination separates total/range, page size and navigation into an accessible footer', () => {
  const dom = new JSDOM(renderToStaticMarkup(createElement(StudentsManageTable, {
    ...props, totalCount: 126, currentPage: 2, pageCount: 3, pageSize: 50,
  })))
  const footer = dom.window.document.querySelector('nav[aria-label="목록 페이지 이동"]')
  assert.ok(footer, 'pagination must be a named navigation region rather than an unstructured card strip')
  assert.match(footer.textContent, /조회 126명/)
  assert.match(footer.textContent, /51~100명 표시/)
  assert.equal(footer.querySelector('select')?.getAttribute('aria-label'), '페이지당 수강생 수')
  assert.equal(footer.querySelectorAll('button').length, 2)
  dom.window.close()
})

test('sortable headers expose native keyboard buttons and announce the actual sort cycle', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' })
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })
  const { createRoot } = require('react-dom/client') as typeof import('react-dom/client')
  function Table() {
    const { sort, toggle } = useSortState<'name'>()
    return <table><thead><tr><SortableHeader label="이름" sortKey="name" sort={sort} onSort={toggle} /></tr></thead></table>
  }
  const root = createRoot(document.getElementById('root')!)
  try {
    await act(async () => root.render(createElement(Table)))
    const button = document.querySelector('th button') as HTMLButtonElement
    assert.ok(button, 'click-only th is not keyboard-operable')
    assert.equal(button.type, 'button', 'sorting must never submit an enclosing form')
    assert.match(button.title, /오름차순/, 'the unsorted header explains its next action')
    for (const expected of ['ascending', 'descending', 'none']) {
      await act(async () => button.click())
      assert.equal(document.querySelector('th')?.getAttribute('aria-sort'), expected)
      const nextAction = expected === 'ascending' ? /내림차순/ : expected === 'descending' ? /해제/ : /오름차순/
      assert.match(button.title, nextAction, 'the next-action hint follows the actual sort cycle')
    }
  } finally {
    await act(async () => root.unmount())
    dom.window.close()
  }
})

test('roster offers all lifecycle filters on compact screens and an explicit detailed-column toggle', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' })
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })
  const { createRoot } = require('react-dom/client') as typeof import('react-dom/client')
  const root = createRoot(document.getElementById('root')!)
  let selected = ''
  try {
    await act(async () => root.render(createElement(StudentsManageTable, { ...props, onStatusFilterChange: value => { selected = value } })))
    const select = document.querySelector('select[aria-label="수강생 상태 필터"]') as HTMLSelectElement
    assert.ok(select)
    assert.deepEqual(Array.from(select.options).map(option => option.value), ['all', 'active', 'refunded', 'cancelled', 'suspended'])
    await act(async () => { select.value = 'cancelled'; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })) })
    assert.equal(selected, 'cancelled')
    const toggle = document.querySelector('button[aria-label="상세 열 표시"]') as HTMLButtonElement
    assert.ok(toggle)
    assert.equal(toggle.getAttribute('aria-pressed'), 'false')
    await act(async () => toggle.click())
    assert.equal(toggle.getAttribute('aria-pressed'), 'true')
  } finally { await act(async () => root.unmount()); dom.window.close() }
})
