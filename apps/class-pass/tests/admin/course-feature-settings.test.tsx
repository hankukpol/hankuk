import { strict as assert } from 'node:assert'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { JSDOM } = require('../_setup/dom.cjs')

test('feature labels update only their own setting and preserve the designated-seat prerequisite', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/police/dashboard/courses/75/settings' })
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })
  const { act, createElement: h, useState } = require('react')
  const { createRoot } = require('react-dom/client')
  const { CourseFeatureSettings } = require('../../src/app/(admin)/dashboard/courses/[id]/settings/course-feature-settings')
  const cases = [
    ['QR 수강증', 'feature_qr_pass'], ['시간 제한', 'feature_time_window'],
    ['사진 표시', 'feature_photo'], ['D-day', 'feature_dday'],
    ['요일별 색상', 'feature_weekday_color'], ['위조 방지 효과', 'feature_anti_forgery_motion'],
    ['자료 배부', 'feature_qr_distribution'], ['좌석 배정', 'feature_seat_assignment'],
    ['지정좌석', 'feature_designated_seat'], ['출결 체크 기능 사용', 'feature_attendance'],
    ['시험 배부 모드', 'feature_exam_delivery_mode'], ['공지 사용', 'feature_notices'],
    ['공지 공개', 'notice_visible'], ['환불 규정', 'feature_refund_policy'],
    ['지정좌석 학생 신청 열기', 'designated_seat_open'],
  ]
  const changes: Array<[string, boolean]> = []
  function Harness() {
    const [value, setValue] = useState(Object.fromEntries(cases.map(([, key]) => [key, false])))
    return h(CourseFeatureSettings, { value, onChange: (key: string, checked: boolean) => {
      changes.push([key, checked]); setValue((current: Record<string, boolean>) => ({ ...current, [key]: checked }))
    } })
  }
  const root = createRoot(document.getElementById('root')!)
  const label = (name: string) => Array.from(document.querySelectorAll('label')).find(el => el.textContent?.trim() === name)!
  try {
    await act(async () => root.render(h(Harness)))
    assert.equal(document.querySelectorAll('input[type="checkbox"]').length, 15)
    const opening = label('지정좌석 학생 신청 열기').querySelector('input')!
    assert.equal(opening.disabled, true)
    assert.match(document.getElementById(opening.getAttribute('aria-describedby')!)!.textContent!, /먼저/)
    await act(async () => label('지정좌석 학생 신청 열기').click())
    assert.deepEqual(changes, [], 'disabled labels cannot enable applications')
    for (const [name, key] of cases) {
      const count: number = changes.length
      await act(async () => label(name).click())
      assert.deepEqual(changes.slice(count), [[key, true]], `${name} must keep its own API field mapping`)
      assert.equal(label(name).querySelector('input')!.checked, true)
    }
    await act(async () => label('지정좌석').click())
    assert.equal(opening.disabled, true)
    assert.equal(opening.checked, true, 'disabling the prerequisite must not silently discard the saved application flag')
    await act(async () => label('지정좌석').click())
    assert.equal(opening.disabled, false)
    assert.equal(opening.checked, true)
  } finally { await act(async () => root.unmount()); dom.window.close() }
})
