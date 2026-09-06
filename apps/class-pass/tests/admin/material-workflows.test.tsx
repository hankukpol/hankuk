import { strict as assert } from 'node:assert'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { JSDOM } = require('../_setup/dom.cjs')

test('real material and student pages recover from network errors and retain only failed assignments', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/police/dashboard/courses/8/materials', pretendToBeVisual: true })
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element, Node: dom.window.Node, HTMLInputElement: dom.window.HTMLInputElement,
    HTMLSelectElement: dom.window.HTMLSelectElement, MutationObserver: dom.window.MutationObserver,
    getComputedStyle: dom.window.getComputedStyle,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
  })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
  Object.defineProperty(dom.window, 'matchMedia', { value: () => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }) })
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const Module = require('node:module')
  const originalLoad = Module._load
  Module._load = function (request: string, parent: unknown, isMain: boolean) {
    if (request === 'next/navigation') return { useParams: () => ({ id: '8' }), useRouter: () => ({ push() {}, refresh() {} }) }
    return originalLoad.call(this, request, parent, isMain)
  }
  const { act, createElement } = require('react') as typeof import('react')
  const { createRoot } = require('react-dom/client') as typeof import('react-dom/client')
  const { TenantProvider } = require('../../src/components/TenantProvider')
  const { buildFallbackTenantConfig } = require('../../src/lib/tenant')
  const MaterialsPage = require('../../src/app/(admin)/dashboard/courses/[id]/materials/course-materials-page-client').default
  const StudentsPage = require('../../src/app/(admin)/dashboard/courses/[id]/students/course-students-page-client').default
  const course = { id: 8, name: '자료 검증 강좌', tuition_amount: 0, status: 'active', enrollment_fields: [], feature_photo: false, feature_attendance: false }
  const handout = { id: 10, course_id: 8, name: '경찰학 3회차 프린트', description: '원본 설명', subject_id: 9, material_type: 'handout', is_active: true, sort_order: 1 }
  const textbook = { ...handout, id: 20, name: '검증 교재', subject_id: null, material_type: 'textbook' }
  const subjects = [{ id: 9, name: '경찰학', course_id: 8 }]
  const enrollments = [1, 2, 3].map(id => ({ id, course_id: 8, name: `검증학생${id}`, phone: `0100000000${id}`, exam_number: `T${id}`, student_type: 'academy', series: '공채', status: 'active', custom_data: {}, created_at: '2026-09-05' }))
  const posted: Array<{ url: string; body: Record<string, unknown> }> = []
  let postMode = 'network'
  let assignments: Array<{ material_id: number; enrollment_id: number }> = []
  let seriesResolve: ((value: Response) => void) | undefined
  let createResolve: ((value: Response) => void) | undefined
  const originalFetch = globalThis.fetch
  // All network calls are intercepted in memory. Never read or write a live database.
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (init?.method === 'POST' || init?.method === 'PATCH') {
      posted.push({ url, body: JSON.parse(String(init.body)) })
      if (postMode === 'series') return new Promise<Response>(resolve => { seriesResolve = resolve })
      if (postMode === 'create') return new Promise<Response>(resolve => { createResolve = resolve })
      if (postMode === 'partial') {
        assignments = [1, 3].map(enrollment_id => ({ enrollment_id, material_id: 20 }))
        return Response.json({ assignments, failures: [{ enrollmentId: 2 }], success_count: 2, failed_count: 1 })
      }
      throw new TypeError('Failed to fetch')
    }
    if (url.includes('/receipt-matrix?')) return Response.json({ materials: url.includes('materialType=handout') ? [handout] : [textbook], assignments, logs: [], seatAssignments: [{ enrollment_id: 1, subject_id: 9 }] })
    if (url.includes('/subjects')) return Response.json({ subjects })
    if (url.startsWith('/api/courses/')) return Response.json({ course })
    if (url.startsWith('/api/materials?')) return Response.json({ materials: [handout] })
    if (url === '/api/config/series-options') return Response.json({ options: [] })
    if (url.startsWith('/api/enrollments?')) return Response.json({ enrollments, total: 3, summary: { active: 3, refunded: 0, suspended: 0 } })
    throw new Error(`Unexpected request: ${url}`)
  }
  const root = createRoot(document.getElementById('root')!)
  const waitFor = async (predicate: () => boolean, message: string) => {
    const start = Date.now()
    while (!predicate()) {
      if (Date.now() - start > 2500) assert.fail(message)
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
    }
  }
  const button = (label: string) => {
    const found = Array.from(document.querySelectorAll('button')).find(el => el.textContent?.trim() === label)
    assert.ok(found, `button ${label} exists`)
    return found as HTMLButtonElement
  }
  const click = async (label: string) => { await act(async () => button(label).click()) }
  const fill = async (input: HTMLInputElement, value: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, value)
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    })
  }
  const acknowledge = async () => {
    for (let i = 0; i < 4; i++) {
      const confirm = Array.from(document.querySelectorAll('[role="dialog"] button')).find(el => el.textContent === '확인') as HTMLButtonElement | undefined
      if (!confirm) break
      await act(async () => { confirm.click(); await new Promise(resolve => setTimeout(resolve, 50)) })
    }
  }
  try {
    await act(async () => root.render(createElement(TenantProvider, { tenantConfig: buildFallbackTenantConfig('police'), children: createElement(MaterialsPage, { initialData: { course, materials: [handout], subjects }, initialLoaded: true }) })))
    assert.ok(!document.querySelector('form.admin-material-form'), 'create form stays out of the page until requested')
    await click('새 배부자료')
    const createDrawer = document.querySelector('[role="dialog"]')!
    assert.ok(createDrawer, 'new material opens in a dialog')
    assert.match(createDrawer.textContent ?? '', /새 배부자료 만들기/)
    assert.ok(createDrawer.classList.contains('admin-drawer-panel'), 'new material uses the right drawer surface')
    const createFields = createDrawer.querySelector('fieldset.admin-material-fields')!
    const fieldSignature = (scope: Element) => Array.from(scope.querySelectorAll('label')).map(label => ({
      label: label.querySelector('span')?.textContent,
      control: label.querySelector('input, textarea, select')?.tagName,
      style: label.querySelector('input, textarea, select')?.className,
    }))
    assert.deepEqual(fieldSignature(createFields).map(field => field.label), ['배부자료 이름', '설명', '정렬 순서', '활성 상태', '배부 대상 과목 (선택)'])
    assert.ok(Array.from(createFields.querySelectorAll('input, textarea, select')).every(control => control.closest('label')), 'all material controls have a visible associated label')
    await fill(createDrawer.querySelector('input[placeholder="배부자료 이름"]')!, '새 프린트')
    await click('배부자료 생성')
    assert.equal(button('배부자료 생성').disabled, false)
    assert.match(createDrawer.textContent ?? '', /같은 요청/)
    assert.equal((createDrawer.querySelector('input[placeholder="배부자료 이름"]') as HTMLInputElement).value, '새 프린트', 'failed create keeps the draft in the drawer')
    assert.equal(button('취소').disabled, true, 'uncertain creation cannot discard request identity')
    const firstCreation = posted.at(-1)?.body
    postMode = 'create'
    await click('배부자료 생성')
    assert.deepEqual(posted.at(-1)?.body, firstCreation, 'retry reuses frozen creation identity and payload')
    await act(async () => createResolve!(Response.json({ material: handout })))
    await waitFor(() => !document.querySelector('[role="dialog"]'), 'confirmed retry closes the creation drawer')
    await click('교재')
    await waitFor(() => !!Array.from(document.querySelectorAll('button')).find(el => el.textContent?.trim() === '새 교재'), 'textbook tab shows its own create action')
    button('새 교재').focus()
    await click('새 교재')
    assert.equal(document.querySelector('[role="dialog"] select'), null, 'textbook creation does not expose handout subject gating')
    await fill(document.querySelector('[role="dialog"] input[placeholder="교재 이름"]')!, '새 검증 교재')
    postMode = 'create'
    const beforeCreate = posted.length
    const createFormElement = document.querySelector<HTMLFormElement>('form[role="dialog"]')!
    await act(async () => {
      createFormElement.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))
      createFormElement.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))
    })
    assert.equal(posted.length, beforeCreate + 1, 'rapid submits create only one material')
    assert.equal(posted.at(-1)?.body.material_type, 'textbook')
    assert.equal(posted.at(-1)?.body.subject_id, null)
    assert.equal(button('생성 중...').disabled, true)
    assert.equal(button('취소').disabled, true)
    assert.ok(document.querySelector<HTMLButtonElement>('[role="dialog"] button[aria-label="닫기"]')?.disabled)
    await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    assert.ok(document.querySelector('[role="dialog"]'), 'Escape cannot close a saving drawer')
    await act(async () => createResolve!(Response.json({ material: { ...textbook, id: 30, name: '새 검증 교재' } })))
    await waitFor(() => !document.querySelector('[role="dialog"]'), 'successful create closes the drawer')
    assert.match(document.querySelector('.admin-material-list')?.textContent ?? '', /새 검증 교재/)
    assert.equal(document.activeElement?.textContent?.trim(), '새 교재', 'closing restores focus to the create action')
    await click('배부자료')
    await waitFor(() => !!Array.from(document.querySelectorAll('button')).find(el => el.textContent?.trim() === '새 배부자료'), 'handout tab restores its create action')
    postMode = 'network'
    await click('수정')
    const editFields = document.querySelector('[role="dialog"] fieldset.admin-material-fields')!
    assert.deepEqual(fieldSignature(editFields), fieldSignature(createFields), 'create and edit must share label hierarchy and control styles')
    assert.ok(button('변경사항 저장').closest('.admin-dialog-footer'), 'material save stays outside the scrollable body')
    assert.equal(button('변경사항 저장').form, editFields.closest('form'), 'footer save remains associated with the edit form')
    await click('변경사항 저장')
    assert.equal(button('변경사항 저장').disabled, false)
    assert.match(document.querySelector('[role="dialog"]')?.textContent ?? '', /수정 결과를 확인하지 못했습니다/)
    await click('취소')
    await click('다음 회차 만들기')
    assert.match(document.querySelector('[role="dialog"]')?.textContent ?? '', /경찰학 4회차 프린트/)
    assert.match(document.querySelector('[role="dialog"]')?.textContent ?? '', /경찰학 좌석 배정자만/)
    await click('1개 회차 생성')
    assert.equal(button('1개 회차 생성').disabled, false)
    assert.match(document.querySelector('[role="dialog"] [role="alert"]')?.textContent ?? '', /인터넷 연결/)
    const numbers = document.querySelectorAll<HTMLInputElement>('[role="dialog"] input[type="number"]')
    await fill(numbers[1], '6')
    assert.equal(document.querySelector('.admin-material-preview')?.getAttribute('tabindex'), '0', 'long preview is keyboard scrollable')
    assert.equal(document.querySelector('.admin-material-preview')?.getAttribute('aria-label'), '생성될 자료 이름')
    assert.ok(button('3개 회차 생성'))
    postMode = 'series'
    const before = posted.length
    await act(async () => { button('3개 회차 생성').click(); button('3개 회차 생성').click() })
    assert.equal(posted.length, before + 1, 'double clicks must not send two requests')
    assert.equal(button('생성 중...').disabled, true)
    assert.deepEqual(posted.at(-1)?.body, { courseId: 8, sourceMaterialId: 10, namePattern: '경찰학 {회차}회차 프린트', startRound: 4, endRound: 6 })
    await act(async () => seriesResolve!(Response.json({ materials: [4, 5, 6].map(round => ({ ...handout, id: 100 + round, name: `경찰학 ${round}회차 프린트`, is_active: false })) })))
    assert.match(document.body.textContent ?? '', /3개 회차를 비활성 자료로/)
    await act(async () => root.render(createElement(TenantProvider, { tenantConfig: buildFallbackTenantConfig('police'), children: createElement(StudentsPage, { initialData: { course, enrollments, textbooks: [textbook], seriesOptions: [] }, initialLoaded: true }) })))
    await click('교재 배정')
    await waitFor(() => !!document.querySelector('tbody input'), 'assignment matrix must load')
    postMode = 'network'
    await click('전체 배정')
    assert.equal(button('전체 배정').disabled, false)
    assert.match(document.body.textContent ?? '', /배정 현황/)
    await acknowledge()
    const header = Array.from(document.querySelectorAll('th')).find(el => el.textContent?.trim() === textbook.name)!
    assert.equal(header.querySelector('button')?.getAttribute('aria-pressed'), 'false')
    await act(async () => header.querySelector('button')!.click())
    assert.equal(header.querySelector('button')?.getAttribute('aria-pressed'), 'true', 'material filter exposes its selection state')
    await act(async () => (document.querySelector('thead input[type="checkbox"]') as HTMLInputElement).click())
    postMode = 'partial'
    await click('선택 3명 일괄 배정')
    assert.equal(button('선택 1명 일괄 배정').disabled, false)
    assert.match(document.body.textContent ?? '', /1명의 배정 결과를 확인하지 못했습니다 \(검증학생2\)/)
    assert.equal(document.querySelectorAll('tbody input[type="checkbox"]:checked').length, 1)
    await acknowledge()
    postMode = 'network'
    await click('선택 1명 일괄 배정')
    assert.equal(button('교재 배정').disabled, false)
    assert.match(document.body.textContent ?? '', /일부 배정이 저장됐을 수 있습니다/)
    await acknowledge()
    await click('교재 수령현황')
    await click('필터 해제')
    await waitFor(() => Array.from(document.querySelectorAll('.admin-material-status')).some(el => el.textContent === '미구매'), 'unbought wording and readable status style must stay after the receipt matrix loads')
    await click('배부자료 수령현황')
    await waitFor(() => (document.body.textContent ?? '').includes('대상 아님'), 'handout matrix must load')
    const handoutHeader = Array.from(document.querySelectorAll('th')).find(el => el.textContent?.trim() === handout.name)!
    await act(async () => handoutHeader.querySelector('button')!.click())
    assert.equal(document.querySelectorAll('tbody tr').length, 1, 'pending filter must exclude both non-target students')
    assert.match(document.querySelector('tbody')?.textContent ?? '', /검증학생1/)
    const { StudentsMatrixPanel } = require('../../src/app/(admin)/dashboard/courses/[id]/students/students-matrix-panel')
    const noop = () => {}
    let undoCalls = 0
    for (const mode of ['receipts', 'textbook-receipts']) {
      const material = mode === 'receipts' ? handout : textbook
      await act(async () => root.render(createElement(StudentsMatrixPanel, {
        tab: mode, matrixLoading: false, matrixMaterials: [material], matrixSearch: '', filterMatId: null,
        selectedIds: new Set(), bulkActionEnabled: false, bulkProcessing: true, bulkProgress: { done: 0, total: 1 },
        filteredMatrixRows: [{ enrollment: enrollments[0], assignments: { [material.id]: true }, seatSubjects: { 9: true }, receipts: { [material.id]: { logId: 1, distributed_at: '2026-09-05T00:00:00Z' } } }],
        onMatrixSearchChange: noop, onToggleFilterMaterial: noop, onClearFilter: noop, onReplaceSelectedIds: noop,
        onToggleRowSelection: noop, onDistribute: noop, onAssignTextbook: noop, onRunBulkAction: noop,
        onUndo: () => { undoCalls += 1 },
      })))
      const undo = document.querySelector<HTMLButtonElement>('button[aria-label$="수령 취소"]')!
      assert.ok(undo, 'receipt status action names the student, material and action')
      assert.equal(undo.disabled, true, 'receipt undo must remain locked during bulk writes')
      await act(async () => undo.click())
    }
    assert.equal(undoCalls, 0)
  } finally {
    await act(async () => root.unmount())
    globalThis.fetch = originalFetch
    Module._load = originalLoad
    dom.window.close()
  }
})
