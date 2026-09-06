import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { act, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StudentsManageTable } from '../../src/app/(admin)/dashboard/courses/[id]/students/students-manage-table'
import type { Enrollment } from '../../src/types/database'
import { StudentHistoryPanel } from '../../src/components/admin/student-history-panel'
import { TenantProvider } from '../../src/components/TenantProvider'
import { getTenantConfigByType } from '../../src/lib/tenant'

const require = createRequire(import.meta.url)
const { JSDOM } = require('../_setup/dom.cjs')
const noop = () => {}

test('cancelled enrollment has a separate roster filter and is counted without being labelled refunded', () => {
  const cancelled = {
    id: 101, name: '종료 학생', phone: '01012345678', status: 'cancelled',
    suspended_at: null, custom_data: {}, created_at: '2026-09-05T09:00:00Z',
    student_type: 'academy', gender: null, series: null, exam_number: null,
  } as unknown as Enrollment
  const dom = new JSDOM(renderToStaticMarkup(createElement(StudentsManageTable, {
    filtered: [cancelled], summary: { active: 2, suspended: 1, refunded: 1, cancelled: 3 },
    search: '', statusFilter: 'cancelled', customFields: [], attendanceEnabled: false,
    currentPage: 1, pageCount: 1, pageSize: 50, totalCount: 3,
    onPageChange: noop, onPageSizeChange: noop, onSearchChange: noop, onStatusFilterChange: noop,
    onResetFilters: noop, onOpenDetail: noop, onOpenStudentHistory: noop, onEdit: noop,
    onResetPin: noop, onApproveDeviceReRegistration: noop, onResetAttendanceDevice: noop,
    onSuspend: noop, onUnsuspend: noop, onDelete: noop,
  } as never)))
  try {
    const body = dom.window.document.body
    assert.match(body.textContent ?? '', /전체 등록\s*7명/)
    const selected = body.querySelector('button[aria-pressed="true"]')
    assert.equal(selected?.textContent, '수강종료')
    const row = body.querySelector('tbody tr')
    assert.ok(row)
    assert.match(row.textContent ?? '', /수강종료/)
    assert.ok(!Array.from(row.querySelectorAll('span') as NodeListOf<HTMLSpanElement>).some((badge) => badge.textContent === '환불'))
    assert.ok(Array.from(row.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).some((button) => button.textContent === '수납·환불'))
  } finally {
    dom.window.close()
  }
})

test('student history renders a cancelled group with termination reason instead of dropping the record', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true })
  Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true })
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => Response.json({
    resolution: 'student_id', student: { id: 501, name: '종료 학생', phone: '01012345678', exam_number: null, cohort_option_id: null, cohort_label: null, auth_method: null },
    active: [], history: [{ enrollment_id: 101, course_id: 10, course_name: '종료된 수강', course_slug: 'course', course_status: 'active',
      status: 'cancelled', lifecycle_status: 'cancelled', suspended_at: null, refunded_at: null, ended_at: '2026-09-05T09:00:00Z', ended_reason: '개인 사정',
      series_label: null, student_type: 'academy', exam_number: null, cohort_label: null, created_at: '2026-09-01T00:00:00Z' }],
  })
  const { createRoot } = require('react-dom/client') as typeof import('react-dom/client')
  const root = createRoot(document.getElementById('root')!)
  try {
    await act(async () => root.render(createElement(TenantProvider, { tenantConfig: getTenantConfigByType('police'),
      children: createElement(StudentHistoryPanel, { enrollmentId: 101, onClose: noop }),
    })))
    assert.match(document.body.textContent ?? '', /수강종료/)
    assert.match(document.body.textContent ?? '', /종료된 수강/)
    assert.match(document.body.textContent ?? '', /종료일.*개인 사정/)
  } finally {
    await act(async () => root.unmount())
    globalThis.fetch = originalFetch
    dom.window.close()
  }
})
