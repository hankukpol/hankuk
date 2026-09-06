import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { JSDOM } = require('../_setup/dom.cjs')
const Module = require('node:module')
const originalLoad = Module._load
const searchParams = new URLSearchParams()
const routerReplacements: string[] = []
const router = { push() {}, replace(url: string) { routerReplacements.push(url) }, refresh() {} }
let scanCallback: ((token: string) => void) | null = null

// Only the camera hardware, Next routing, and HTTP boundaries are substituted.
// StaffScanPage and both distribution panels run as real React components.
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'next/navigation') return { useRouter: () => router, useSearchParams: () => searchParams }
  if (request === '@/lib/camera/access') return { getCameraReadinessError: async () => null, getCameraAccessErrorMessage: () => 'Camera unavailable' }
  return originalLoad.call(this, request, parent, isMain)
}

const materials = [
  { id: 20, name: '공통 배부자료', material_type: 'handout' },
  { id: 21, name: '추가 배부자료', material_type: 'handout' },
]
type Call = { url: string; body: Record<string, unknown>; resolve: (response: Response) => void }

async function harness(mode: 'quick' | 'qr', run: (context: {
  calls: Call[]
  act: typeof import('react').act
  click: (label: string) => Promise<void>
  button: (label: string) => HTMLButtonElement
  fillPhone: (phone: string) => Promise<void>
  scan: (token: string) => Promise<void>
  reply: (index: number, payload: unknown, status?: number) => Promise<void>
  changeCourse: (id: number) => Promise<void>
  finishCourseBootstrap: () => Promise<void>
  finishCameraStart: () => Promise<void>
  routerReplacements: string[]
  materialButton: (id: number) => HTMLButtonElement | undefined
}) => Promise<void>, deferCourseBootstrap = false, options: { deferCameraStart?: boolean; initialToken?: string } = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/police/staff/scan', pretendToBeVisual: true })
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element, Node: dom.window.Node, HTMLInputElement: dom.window.HTMLInputElement,
    HTMLSelectElement: dom.window.HTMLSelectElement, MutationObserver: dom.window.MutationObserver,
    getComputedStyle: dom.window.getComputedStyle,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
  const qr = require('html5-qrcode')
  let deferCameraStart = options.deferCameraStart ?? false
  let cameraStartResolve: (() => void) | null = null
  qr.Html5Qrcode.getCameras = async () => [{ id: 'test-camera', label: 'Back main camera' }]
  qr.Html5Qrcode.prototype.start = async function (_target: unknown, _config: unknown, callback: (token: string) => void) {
    scanCallback = callback
    if (deferCameraStart) {
      deferCameraStart = false
      await new Promise<void>(resolve => { cameraStartResolve = resolve })
    }
  }
  qr.Html5Qrcode.prototype.stop = async function () {}
  qr.Html5Qrcode.prototype.clear = function () {}
  const { act, createElement } = require('react') as typeof import('react')
  const { createRoot } = require('react-dom/client') as typeof import('react-dom/client')
  const { TenantProvider } = require('../../src/components/TenantProvider')
  const { buildFallbackTenantConfig } = require('../../src/lib/tenant')
  const StaffScanPage = require('../../src/app/(staff)/scan/page').default
  const originalFetch = globalThis.fetch
  const calls: Call[] = []
  let courseBootstrapResolve: (() => void) | null = null
  scanCallback = null
  routerReplacements.length = 0
  searchParams.delete('token')
  if (options.initialToken) searchParams.set('token', options.initialToken)
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url.startsWith('/api/distribution/staff-bootstrap')) {
      if (deferCourseBootstrap && url.includes('courseId=9')) await new Promise<void>(resolve => { courseBootstrapResolve = resolve })
      return Response.json({
      session: { role: 'staff' }, staffScanEnabled: mode === 'qr', staffQuickEnabled: true,
      selectedCourseId: url.includes('courseId=9') ? 9 : 8,
      courses: [{ id: 8, name: '배부 검증 강좌 A' }, { id: 9, name: '배부 검증 강좌 B' }], materials: [],
      })
    }
    if (url === '/api/distribution/scan' || url === '/api/distribution/quick') {
      return new Promise<Response>(resolve => calls.push({ url, body: JSON.parse(String(init?.body)), resolve }))
    }
    throw new Error(`Blocked unexpected request ${url}`)
  }
  const root = createRoot(document.getElementById('root')!)
  const button = (label: string) => {
    const found = [...document.querySelectorAll('button')].find(el => el.textContent?.trim() === label)
    assert.ok(found, `Missing button ${label}`)
    return found as HTMLButtonElement
  }
  const click = async (label: string) => { await act(async () => button(label).click()) }
  const reply = async (index: number, payload: unknown, status = 200) => { await act(async () => calls[index].resolve(Response.json(payload, { status }))) }
  const fillPhone = async (value: string) => {
    const input = document.querySelector('input[placeholder="01012345678"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, value)
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    })
  }
  const materialButton = (id: number) => [...document.querySelectorAll('button')].find(el => {
    const material = materials.find(item => item.id === id)!
    return el.textContent?.includes(material.name)
  }) as HTMLButtonElement | undefined
  try {
    await act(async () => root.render(createElement(TenantProvider, { tenantConfig: buildFallbackTenantConfig('police'), children: createElement(StaffScanPage) })))
    if (mode === 'qr') {
      for (let attempt = 0; attempt < 50 && !scanCallback; attempt++) {
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
      }
      assert.ok(scanCallback, 'camera callback must attach before the test begins')
    }
    await run({ calls, act, click, button, fillPhone, reply, materialButton,
      scan: async token => { await act(async () => scanCallback!(token)) },
      changeCourse: async id => { await act(async () => {
        const select = document.querySelector<HTMLSelectElement>('select')!
        select.value = String(id)
        select.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
      }) },
      finishCourseBootstrap: async () => { await act(async () => courseBootstrapResolve!()) },
      finishCameraStart: async () => {
        assert.ok(cameraStartResolve, 'the camera start must still be pending')
        await act(async () => cameraStartResolve!())
      },
      routerReplacements,
    })
  } finally {
    await act(async () => root.unmount())
    globalThis.fetch = originalFetch
    dom.window.close()
  }
}

test('late phone A lookup cannot populate the changed B phone or issue a B distribution', async () => {
  await harness('quick', async ({ calls, click, fillPhone, reply }) => {
    await fillPhone('01011111111')
    await click('학생 조회')
    await fillPhone('01022222222')
    await click('학생 조회')
    await reply(0, { needsSelection: true, student_name: '검증학생 A', available_materials: materials })
    assert.equal(document.querySelector<HTMLInputElement>('input')!.value, '01022222222')
    assert.equal(document.body.textContent?.includes('검증학생 A'), false, 'stale A result must be discarded')
    assert.deepEqual(calls[1].body, { courseId: 8, phone: '01022222222' })
    assert.equal(calls.some(call => call.body.materialId != null), false)
    await reply(1, { needsSelection: true, student_name: '검증학생 B', available_materials: [materials[1]] })
    assert.match(document.body.textContent ?? '', /검증학생 B/)
  })
})

test('phone lookup button never distributes even after selecting a material', async () => {
  await harness('quick', async ({ calls, click, fillPhone, reply, act, materialButton }) => {
    await fillPhone('01011111111')
    await click('학생 조회')
    await reply(0, { needsSelection: true, student_name: '검증학생 A', available_materials: materials })
    await act(async () => materialButton(20)!.click())
    await click('학생 조회')
    assert.deepEqual(calls[1].body, { courseId: 8, phone: '01011111111' }, 'the lookup action must remain read-only')
  })
})

test('phone distribution freezes identity and materials and has a same-tick duplicate guard', async () => {
  await harness('quick', async ({ calls, click, button, fillPhone, reply, act, materialButton }) => {
    await fillPhone('01011111111')
    await click('학생 조회')
    await reply(0, { needsSelection: true, student_name: '검증학생 A', available_materials: materials })
    await act(async () => materialButton(20)!.click())
    const distribute = button('배부 처리')
    await act(async () => { distribute.click(); distribute.click() })
    assert.equal(calls.length, 2, 'one click burst must create exactly one distribution request')
    assert.deepEqual(calls[1].body, { courseId: 8, phone: '01011111111', materialId: 20 })
    assert.equal(document.querySelector<HTMLInputElement>('input')!.disabled, true)
    assert.equal(document.querySelector<HTMLSelectElement>('select')!.disabled, true)
    assert.equal(button('수동 배부').disabled, true)
    assert.equal(materialButton(21)!.disabled, true)
    await reply(1, { success: true, student_name: '검증학생 A', distributed_materials: [materials[0]] })
  })
})

test('phone partial error removes committed materials from the retry list', async () => {
  await harness('quick', async ({ click, fillPhone, reply, act, materialButton }) => {
    await fillPhone('01011111111')
    await click('학생 조회')
    await reply(0, { needsSelection: true, student_name: '검증학생 A', available_materials: materials })
    await act(async () => materialButton(20)!.click())
    await click('배부 처리')
    await reply(1, { error: '처리 일부 실패', distributed_materials: [materials[0]] }, 500)
    assert.equal(Boolean(materialButton(20)), false, 'committed material must never be offered as a retry')
    assert.ok(materialButton(21))
  })
})

test('QR selection remains locked against the next student scan after one item succeeds', async () => {
  await harness('qr', async ({ calls, scan, reply, act, materialButton }) => {
    await scan('student-A-token')
    await reply(0, { needsSelection: true, studentName: '검증학생 A', unreceived: materials }, 400)
    await act(async () => materialButton(20)!.click())
    await reply(1, { success: true, studentName: '검증학생 A', distributedMaterials: [materials[0]] })
    await scan('student-B-token')
    assert.equal(calls.length, 2, 'active A selection must reject B scans')
    assert.ok(materialButton(21))
    await act(async () => materialButton(21)!.click())
    assert.deepEqual(calls[2].body, { token: 'student-A-token', courseId: 8, materialId: 21 })
  })
})

test('QR writes synchronously block duplicates and completion, restart, course, and mode changes', async () => {
  await harness('qr', async ({ calls, scan, reply, act, materialButton, button }) => {
    await scan('student-A-token')
    await reply(0, { needsSelection: true, studentName: '검증학생 A', unreceived: materials }, 400)
    const item = materialButton(20)!
    await act(async () => { item.click(); item.click() })
    assert.equal(calls.length, 2, 'same-tick duplicate QR writes must be prevented')
    for (const label of ['완료', '다시 시작', 'QR 스캔', '수동 배부']) assert.equal(button(label).disabled, true, label)
    assert.equal(document.querySelector<HTMLSelectElement>('select')!.disabled, true)
    await act(async () => button('완료').click())
    await scan('student-B-token')
    await reply(1, { success: true, studentName: '검증학생 A', distributedMaterials: [materials[0]] })
    assert.ok(materialButton(21))
    assert.equal(calls.length, 2)
  })
})

test('invalid QR token clears the selection and requires a fresh scan', async () => {
  await harness('qr', async ({ calls, scan, reply, act, materialButton }) => {
    await scan('expired-A-token')
    await reply(0, { needsSelection: true, studentName: '검증학생 A', unreceived: materials }, 400)
    await act(async () => materialButton(20)!.click())
    await reply(1, { success: false, reason: 'INVALID_TOKEN' }, 400)
    assert.equal(Boolean(materialButton(20)), false)
    assert.equal(Boolean(materialButton(21)), false)
    assert.match(document.body.textContent ?? '', /다시 스캔/)
    await scan('fresh-A-token')
    assert.deepEqual(calls[2].body, { token: 'fresh-A-token', courseId: 8 })
  })
})

test('QR single-item error with confirmed success removes it and keeps the remaining session locked', async () => {
  await harness('qr', async ({ calls, scan, reply, act, materialButton }) => {
    await scan('student-A-token')
    await reply(0, { needsSelection: true, studentName: '검증학생 A', unreceived: materials }, 400)
    await act(async () => materialButton(20)!.click())
    await reply(1, { success: false, reason: 'DISTRIBUTION_FAILED', distributedMaterials: [materials[0]] }, 500)
    assert.equal(Boolean(materialButton(20)), false)
    assert.ok(materialButton(21))
    await scan('student-B-token')
    assert.equal(calls.length, 2)
  })
})

test('a stopped camera callback cannot open a QR selection after switching to phone mode', async () => {
  await harness('qr', async ({ calls, scan, reply, click }) => {
    await scan('student-A-token')
    await reply(0, { needsSelection: true, studentName: '검증학생 A', unreceived: materials }, 400)
    await click('완료')
    await click('수동 배부')
    await scan('student-B-token')
    assert.equal(calls.length, 1, 'detached camera callbacks must be invalidated with the camera session')
  })
})

test('QR bulk partial retry sends only the uncommitted material for the same student', async () => {
  await harness('qr', async ({ calls, scan, reply, click }) => {
    await scan('student-A-token')
    await reply(0, { needsSelection: true, studentName: '검증학생 A', unreceived: materials }, 400)
    await click('미수령 2건 전체 배부')
    await reply(1, { success: false, reason: 'DISTRIBUTION_FAILED', distributedMaterials: [materials[0]] }, 500)
    await scan('student-B-token')
    assert.equal(calls.length, 2)
    await click('미수령 1건 전체 배부')
    assert.deepEqual(calls[2].body, { token: 'student-A-token', courseId: 8, materialIds: [21] })
  })
})

for (const mode of ['quick', 'qr'] as const) {
  test(`${mode} confirmed success displays refresh warning without offering a repeat write`, async () => {
    await harness(mode, async ({ click, fillPhone, scan, reply, act, materialButton }) => {
      if (mode === 'quick') {
        await fillPhone('01011111111')
        await click('학생 조회')
        await reply(0, { needsSelection: true, student_name: '검증학생 A', available_materials: [materials[0]] })
        await click('배부 처리')
      } else {
        await scan('student-A-token')
        await reply(0, { needsSelection: true, studentName: '검증학생 A', unreceived: [materials[0]] }, 400)
        await act(async () => materialButton(20)!.click())
      }
      await reply(1, {
        success: true, student_name: '검증학생 A', studentName: '검증학생 A',
        distributed_materials: [materials[0]], distributedMaterials: [materials[0]],
        refreshRequired: true, warning: '저장은 완료됐습니다. 최신 수령 현황을 새로고침해 주세요.',
      })
      assert.match(document.body.textContent ?? '', /저장은 완료됐습니다. 최신 수령 현황을 새로고침해 주세요/)
      assert.equal(Boolean(materialButton(20)), false)
    })
  })
}

test('QR scans wait for the changed course bootstrap instead of losing an active request to its late reset', async () => {
  await harness('qr', async ({ calls, changeCourse, scan, finishCourseBootstrap, reply, materialButton }) => {
    await changeCourse(9)
    // Allow the replacement camera's asynchronous start to attach.
    await new Promise(resolve => setTimeout(resolve, 30))
    await scan('student-B-course-token')
    assert.equal(calls.length, 0, 'no QR lookup may start before course identity is ready')
    await finishCourseBootstrap()
    await scan('student-B-course-token')
    assert.deepEqual(calls[0].body, { courseId: 9, token: 'student-B-course-token' })
    await reply(0, { needsSelection: true, studentName: '검증학생 B', unreceived: materials }, 400)
    assert.ok(materialButton(20))
  }, true)
})

test('returning to QR after a late camera startup in phone mode attaches a usable camera callback', async () => {
  await harness('qr', async ({ click, scan, calls, finishCameraStart, act }) => {
    await click('수동 배부')
    await finishCameraStart()
    await click('QR 스캔')
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })
    await scan('student-A-late-camera-token')
    assert.equal(calls.length, 1, 'a stale scanner must not prevent a fresh QR lookup after switching back')
    assert.deepEqual(calls[0].body, { token: 'student-A-late-camera-token', courseId: 8 })
  }, false, { deferCameraStart: true })
})

test('QR token URL cleanup stays on the tenant scan route', async () => {
  await harness('qr', async ({ calls, routerReplacements }) => {
    assert.deepEqual(calls[0].body, { token: 'student-A-url-token', courseId: 8 })
    assert.deepEqual(routerReplacements, ['/police/scan'], 'removing the QR token must not navigate to the nonexistent /staff/scan route')
  }, false, { initialToken: 'student-A-url-token' })
})
