import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { act, createElement } from 'react'
import { StudentsManageTable } from '../../src/app/(admin)/dashboard/courses/[id]/students/students-manage-table'
import type { Enrollment } from '../../src/types/database'

const require = createRequire(import.meta.url)
const { JSDOM } = require('../_setup/dom.cjs')
const noop = () => {}

test('row actions retain their student target and disabled device conditions inside More', async () => {
  const dom = new JSDOM('<div class="admin-shell"><div id="root"></div></div>', {url:'http://localhost', pretendToBeVisual:true})
  Object.assign(globalThis, { window:dom.window, document:dom.window.document, HTMLElement:dom.window.HTMLElement, Node:dom.window.Node, IS_REACT_ACT_ENVIRONMENT:true })
  const { createRoot } = require('react-dom/client') as typeof import('react-dom/client')
  const root = createRoot(document.getElementById('root')!)
  const rows = [1,2].map(id => ({ id, course_id:8, name:`학생${id}`, phone:'010-0000-0000', exam_number:`M${id}`, status:'active', custom_data:{}, created_at:'2026-09-05T00:00:00Z', attendance_device:{status:'unregistered', registered_count:0} } as Enrollment))
  const calls: Array<[string,number]> = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => Response.json({memos:[{enrollment_id:2,body:'상담 후 다음 주 확인',revision:1,created_at:'2026-09-05T00:00:00Z',updated_at:'2026-09-05T00:00:00Z'}]})
  const handler = (name:string) => (e:Enrollment) => calls.push([name,e.id])
  try {
    await act(async()=>root.render(createElement(StudentsManageTable, {
      filtered:rows, summary:{active:2,refunded:0,suspended:0}, search:'',statusFilter:'all',customFields:[],attendanceEnabled:true,
      currentPage:1,pageCount:1,pageSize:50,totalCount:2,onPageChange:noop,onPageSizeChange:noop,onSearchChange:noop,onStatusFilterChange:noop,onResetFilters:noop,
      onOpenDetail:handler('detail'),onOpenStudentHistory:noop,onEdit:handler('edit'),onResetPin:noop,onApproveDeviceReRegistration:noop,onResetAttendanceDevice:handler('device'),onSuspend:handler('suspend'),onUnsuspend:noop,onDelete:handler('delete'),
    })))
    const row = document.querySelectorAll('tbody tr')[1]
    const button = (label:string) => Array.from(row.querySelectorAll('button')).find(b=>b.textContent?.trim()===label)!
    const headers = Array.from(document.querySelectorAll('thead th'))
    const memoIndex = headers.findIndex(th=>th.textContent==='메모')
    assert.ok(memoIndex >= 0, 'memo has its own visible column')
    assert.match(row.children[memoIndex].textContent!, /상담 후 다음 주 확인/)
    assert.ok(row.children[memoIndex].querySelector('button'), 'memo preview opens the editor')
    assert.match(document.querySelector('tbody tr')!.children[memoIndex].textContent!, /메모 추가/)
    assert.equal(button('삭제'),undefined, 'destructive action is not a primary row button')
    await act(async()=>button('수납·환불').click())
    await act(async()=>button('편집').click())
    await act(async()=>button('더보기▾').click())
    const menu = document.querySelector('[role="menu"]')!
    assert.ok(menu.textContent?.includes('학생2'), 'menu identifies the student')
    assert.ok(!row.contains(menu), 'menu escapes table overflow clipping')
    const items = Array.from(menu.querySelectorAll('button'))
    const reset = items.find(b=>b.textContent?.includes('기기 초기화'))!
    assert.equal(reset.disabled,true)
    await act(async()=>reset.click())
    await act(async()=>items.find(b=>b.textContent?.trim()==='정지')!.click())
    await act(async()=>button('더보기▾').click())
    await act(async()=>Array.from(document.querySelectorAll('[role="menuitem"]')).find(b=>b.textContent?.trim()==='삭제')!.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})))
    assert.deepEqual(calls,[['detail',2],['edit',2],['suspend',2],['delete',2]])
  } finally { await act(async()=>root.unmount());globalThis.fetch=originalFetch;dom.window.close() }
})
