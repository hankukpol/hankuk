import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { JSDOM } = require('../_setup/dom.cjs')

test('student pages safely initialize device identity on HTTP browsers', async (t) => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/police/courses/test/attendance?enrollmentId=1', pretendToBeVisual: true })
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, sessionStorage: dom.window.sessionStorage, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, HTMLInputElement: dom.window.HTMLInputElement, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
  Object.defineProperty(dom.window, 'matchMedia', { value: () => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }) })
  const Module = require('node:module'), originalLoad = Module._load, originalFetch = globalThis.fetch
  const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto')!
  const secureCrypto = globalThis.crypto
  const storageDescriptor = Object.getOwnPropertyDescriptor(dom.window, 'localStorage')!
  const router = { push() {}, replace() {}, refresh() {} }, params = { courseSlug: 'test' }, search = new URLSearchParams('enrollmentId=1')
  Module._load = function (request: string, parent: unknown, isMain: boolean) {
    if (request === 'next/navigation') return { useParams: () => params, useRouter: () => router, useSearchParams: () => search }
    return originalLoad.call(this, request, parent, isMain)
  }
  const { act, createElement } = require('react') as typeof import('react')
  const { createRoot } = require('react-dom/client') as typeof import('react-dom/client')
  const { TenantProvider } = require('../../src/components/TenantProvider')
  const { buildFallbackTenantConfig } = require('../../src/lib/tenant')
  const Attendance = require('../../src/app/(student)/courses/[courseSlug]/attendance/page').default
  const DesignatedSeat = require('../../src/app/(student)/courses/[courseSlug]/designated-seat/page').default
  const designatedSeat = { enabled: true, open: true, verified: false, writable: false, requires_reauth: false, restriction_reason: null, active_room_id: 4, rooms: [{ id: 4, name: '1강의실', is_open: true }], layout: { id: 5, rows: 1, columns: 1, aisle_columns: [] }, seats: [], occupied_seat_ids: [], reservation: null }
  const payload = { course: { id: 8, slug: 'test', name: '기기 검증', enrolled_from: '2026-01-01', feature_attendance: true, theme_color: '#0071e3' }, enrollment: { id: 1, name: '검증학생', phone: '01000000001' }, attendance: { enabled: true, open: true, attended_today: false, attended_at: null }, attendanceHistory: [], designatedSeat }
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url === '/police/api/enrollments/pass') return Response.json(payload)
    if (url === '/police/api/designated-seats/state') return Response.json({ state: designatedSeat })
    throw new Error(`Unexpected external request: ${url}`)
  }
  sessionStorage.setItem('class_pass_student_name', '검증학생')
  sessionStorage.setItem('class_pass_student_phone', '01000000001')
  let root: ReturnType<typeof createRoot> | undefined
  const mount = async (Page: typeof Attendance) => {
    root = createRoot(document.getElementById('root')!)
    await act(async () => root!.render(createElement(TenantProvider, { tenantConfig: buildFallbackTenantConfig('police'), children: createElement(Page) })))
  }
  const unmount = async () => { await act(async () => root?.unmount()); root = undefined }
  try {
    for (const [label, Page] of [['attendance', Attendance], ['designated-seat', DesignatedSeat]] as const) {
      await t.test(`${label}: missing randomUUID uses secure randomness and keeps the stored device on reload`, async () => {
        localStorage.clear()
        Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues: secureCrypto.getRandomValues.bind(secureCrypto) } })
        try {
          await mount(Page)
          assert.match(document.querySelector('h1')?.textContent ?? '', /출석 체크|지정좌석/)
          const key = localStorage.getItem('class_pass_designated_seat_device')
          assert.match(key ?? '', /^[a-f0-9]{12}4[a-f0-9]{3}[89ab][a-f0-9]{15}_[a-z0-9]+$/)
          await unmount()
          Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {} })
          await mount(Page)
          assert.equal(localStorage.getItem('class_pass_designated_seat_device'), key)
          assert.ok(document.querySelector('h1'), 'existing device identity does not require new randomness')
        } finally { await unmount(); Object.defineProperty(globalThis, 'crypto', cryptoDescriptor) }
      })
      for (const failure of ['no-secure-rng', 'storage-get', 'storage-set']) {
        await t.test(`${label}: ${failure} gives actionable guidance instead of crashing or using an unsafe identity`, async () => {
          localStorage.clear()
          if (failure === 'no-secure-rng') Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {} })
          if (failure.startsWith('storage')) Object.defineProperty(dom.window, 'localStorage', { configurable: true, value: {
            getItem() { if (failure === 'storage-get') throw new Error('SecurityError'); return null },
            setItem() { throw new Error('QuotaExceededError') },
          } })
          try {
            await mount(Page)
            assert.match(document.querySelector('[role="alert"]')?.textContent ?? '', /기기.*브라우저|기기.*HTTPS/)
            assert.ok(!Array.from(document.querySelectorAll('button')).some(el => /출석하기|QR 스캔으로 현장 인증/.test(el.textContent ?? '') && !el.disabled))
            assert.equal(localStorage.getItem('class_pass_designated_seat_device'), null)
          } finally {
            await unmount()
            Object.defineProperty(globalThis, 'crypto', cryptoDescriptor)
            Object.defineProperty(dom.window, 'localStorage', storageDescriptor)
          }
        })
      }
    }
  } finally {
    if (root) await unmount()
    Module._load = originalLoad; globalThis.fetch = originalFetch
    Object.defineProperty(globalThis, 'crypto', cryptoDescriptor)
    Object.defineProperty(dom.window, 'localStorage', storageDescriptor)
    dom.window.close()
  }
})
