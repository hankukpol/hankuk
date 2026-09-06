import { strict as assert } from 'node:assert'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import type { Course, Enrollment } from '../../src/types/database'

const require = createRequire(import.meta.url)
const { JSDOM } = require('../_setup/dom.cjs')

type EnrollmentPayload = {
  enrollments: Enrollment[]
  total: number
  summary: { active: number; refunded: number; suspended: number }
}

function makeCourse(): Course {
  return {
    id: 8,
    name: '형사법 기본이론',
    course_type: 'single',
    tuition_amount: 100000,
    status: 'active',
    sort_order: 1,
    created_at: '2026-09-05T00:00:00.000Z',
    enrollment_fields: [],
    feature_photo: false,
    feature_attendance: false,
    feature_designated_seat: false,
  } as unknown as Course
}

function makeEnrollment(id: number, status: 'active' | 'refunded', suspended = false): Enrollment {
  return {
    id,
    course_id: 8,
    student_id: id,
    name: `학생 ${String(id).padStart(2, '0')}`,
    phone: `010-0000-${String(id).padStart(4, '0')}`,
    exam_number: `E${String(id).padStart(3, '0')}`,
    cohort_label: '1기',
    gender: id % 2 === 0 ? '남' : '여',
    series: '공채',
    series_group: 'public',
    student_type: 'academy',
    status,
    suspended_at: suspended ? '2026-09-05T01:00:00.000Z' : null,
    suspension_reason: suspended ? '테스트 정지' : null,
    custom_data: {},
    created_at: `2026-09-05T00:${String(id).padStart(2, '0')}:00.000Z`,
    student_profile: {
      id,
      name: `학생 ${String(id).padStart(2, '0')}`,
      phone: `010-0000-${String(id).padStart(4, '0')}`,
      exam_number: `E${String(id).padStart(3, '0')}`,
      auth_method: 'birth_date',
    },
  } as unknown as Enrollment
}

function fullPayload(rows: Enrollment[]): EnrollmentPayload {
  return {
    enrollments: rows,
    total: rows.length,
    summary: { active: 8, refunded: 2, suspended: 2 },
  }
}

function emptyFilteredPayload(): EnrollmentPayload {
  return {
    enrollments: [],
    total: 0,
    summary: { active: 8, refunded: 2, suspended: 2 },
  }
}

test('roster reset clears pending search, restores all status and ignores stale filtered responses', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/police/dashboard/courses/8/students',
    pretendToBeVisual: true,
  })
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
    HTMLInputElement: dom.window.HTMLInputElement,
    HTMLSelectElement: dom.window.HTMLSelectElement,
    MutationObserver: dom.window.MutationObserver,
    getComputedStyle: dom.window.getComputedStyle,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
  })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
  Object.defineProperty(dom.window, 'matchMedia', {
    value: () => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }),
  })
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

  const Module = require('node:module')
  const originalLoad = Module._load
  Module._load = function (request: string, parent: unknown, isMain: boolean) {
    if (request === 'next/navigation') {
      return { useParams: () => ({ id: '8' }), useRouter: () => ({ push() {}, refresh() {} }) }
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  const { act, createElement } = require('react') as typeof import('react')
  const { createRoot } = require('react-dom/client') as typeof import('react-dom/client')
  const { TenantProvider } = require('../../src/components/TenantProvider')
  const { buildFallbackTenantConfig } = require('../../src/lib/tenant')
  const Page = require('../../src/app/(admin)/dashboard/courses/[id]/students/course-students-page-client').default

  const course = makeCourse()
  const rows = [
    ...Array.from({ length: 8 }, (_, index) => makeEnrollment(index + 1, 'active')),
    ...Array.from({ length: 2 }, (_, index) => makeEnrollment(index + 9, 'refunded')),
    ...Array.from({ length: 2 }, (_, index) => makeEnrollment(index + 11, 'active', true)),
  ]
  const staleRow = { ...makeEnrollment(99, 'active', true), name: 'STALE FILTERED ROW' } as Enrollment
  const enrollmentRequests: string[] = []
  const suspendedDeferred: Array<(payload: EnrollmentPayload) => void> = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.startsWith('/api/courses/')) return Response.json({ course })
    if (url.startsWith('/api/materials?')) return Response.json({ materials: [] })
    if (url === '/api/config/series-options') return Response.json({ options: [] })
    if (url.startsWith('/api/enrollments?')) {
      enrollmentRequests.push(url)
      const params = new URL(`http://localhost${url}`).searchParams
      if (params.get('status') === 'refunded') return Response.json(emptyFilteredPayload())
      if (params.get('status') === 'suspended') {
        return new Promise<Response>((resolve) => {
          suspendedDeferred.push((payload) => resolve(Response.json(payload)))
        })
      }
      return Response.json(fullPayload(rows))
    }
    throw new Error(`Unexpected request: ${url}`)
  }

  const root = createRoot(document.getElementById('root')!)
  const flush = () => act(async () => { await Promise.resolve() })
  const waitFor = async (predicate: () => boolean, message: string) => {
    const start = Date.now()
    while (!predicate()) {
      if (Date.now() - start > 1500) assert.fail(message)
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)) })
    }
  }
  const statusButton = (label: string) => {
    const group = document.querySelector('[role="group"][aria-label="수강생 상태 필터"]')
    assert.ok(group, 'status filter group is rendered')
    const button = Array.from(group.querySelectorAll('button')).find((el) => el.textContent?.trim() === label)
    assert.ok(button, `status button ${label} is rendered`)
    return button as HTMLButtonElement
  }
  const clickButton = async (label: string) => {
    const button = Array.from(document.querySelectorAll('button')).find((el) => el.textContent?.trim() === label)
    assert.ok(button, `button ${label} is rendered`)
    await act(async () => { button.click() })
  }
  const setInput = async (element: HTMLInputElement, value: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(element, value)
      element.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    })
  }

  try {
    await act(async () => {
      root.render(createElement(TenantProvider, {
        tenantConfig: buildFallbackTenantConfig('police'),
        children: createElement(Page, {
          initialData: { course, enrollments: rows, textbooks: [], seriesOptions: [] },
          initialLoaded: true,
        }),
      }))
    })
    await waitFor(() => (document.body.textContent ?? '').includes('전체 등록 12명'), 'initial full-course count should load')

    const pageSizeSelect = document.querySelector('select[aria-label="페이지당 수강생 수"]') as HTMLSelectElement | null
    assert.ok(pageSizeSelect, 'page-size selector is rendered')
    await act(async () => {
      pageSizeSelect.value = '20'
      pageSizeSelect.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
    })
    await waitFor(() => enrollmentRequests.some((url) => url.includes('limit=20') && url.includes('offset=0')), 'page-size change should fetch the first 20-row page')

    await act(async () => { statusButton('환불완료').click() })
    await waitFor(() => (document.body.textContent ?? '').includes('조회 결과 0명'), 'filtered empty result should render')
    assert.match(document.body.textContent ?? '', /전체 등록\s*12명/)
    assert.match(document.body.textContent ?? '', /수강중\s*8명/)
    assert.match(document.body.textContent ?? '', /정지\s*2명/)
    assert.match(document.body.textContent ?? '', /환불\s*2명/)
    assert.equal(statusButton('환불완료').getAttribute('aria-pressed'), 'true')

    await act(async () => { statusButton('정지').click() })
    await setInput(document.querySelector('input[aria-label="수강생 검색"]') as HTMLInputElement, '홍길동')
    await clickButton('조건 초기화')
    await waitFor(() => {
      const latestAllRequest = enrollmentRequests.at(-1)
      return Boolean(latestAllRequest?.includes('limit=20') && latestAllRequest.includes('offset=0') && !latestAllRequest.includes('status=') && !latestAllRequest.includes('search='))
    }, 'reset should refetch the first all-status page with the existing page size')
    await flush()

    assert.equal((document.querySelector('input[aria-label="수강생 검색"]') as HTMLInputElement).value, '')
    assert.equal(pageSizeSelect.value, '20', 'reset preserves selected page size')
    assert.equal(statusButton('전체').getAttribute('aria-pressed'), 'true')
    assert.equal(statusButton('정지').getAttribute('aria-pressed'), 'false')
    assert.match(document.body.textContent ?? '', /1\s*\/\s*1/, 'reset returns to page 1')
    assert.match(document.body.textContent ?? '', /전체 등록\s*12명/)

    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 550)) })
    assert.equal(enrollmentRequests.some((url) => url.includes('search=%ED%99%8D%EA%B8%B8%EB%8F%99')), false, 'reset cancels the pending debounced search request')

    assert.equal(suspendedDeferred.length, 1, 'a filtered request is deliberately left stale')
    suspendedDeferred[0]({ enrollments: [staleRow], total: 1, summary: { active: 0, refunded: 0, suspended: 1 } })
    await flush()
    assert.equal((document.body.textContent ?? '').includes('STALE FILTERED ROW'), false, 'stale filtered response cannot overwrite the reset all-status roster')
    assert.equal(statusButton('전체').getAttribute('aria-pressed'), 'true')
    assert.match(document.body.textContent ?? '', /전체 등록\s*12명/)
  } finally {
    await act(async () => { root.unmount() })
    globalThis.fetch = originalFetch
    Module._load = originalLoad
    dom.window.close()
  }
})
