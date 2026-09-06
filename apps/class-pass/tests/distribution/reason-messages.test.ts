import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getScanFailureDescription, getScanReasonMessage } from '../../src/app/(staff)/scan/scan-page-utils'
import { getUserErrorMessage } from '../../src/lib/user-error-message'

const cases: Array<[string, RegExp]> = [
  ['NO_SEAT_FOR_SUBJECT', /해당 과목.*좌석.*배정/],
  ['NOT_ASSIGNED', /교재.*(구매|배정)/],
  ['ALREADY_DISTRIBUTED', /이미.*수령/],
  ['STUDENT_INACTIVE', /수강.*정지.*종료/],
  ['STUDENT_NOT_FOUND', /수강생.*찾/],
  ['ENROLLMENT_NOT_FOUND', /수강생.*찾/],
  ['COURSE_INACTIVE', /강좌.*운영|운영.*강좌/],
  ['MATERIAL_NOT_FOUND', /자료.*(없|비활성)/],
  ['TEXTBOOK_NOT_FOUND', /교재.*(없|찾)/],
  ['COURSE_MISMATCH', /강좌/],
  ['INVALID_TOKEN', /QR.*만료/],
  ['ALL_RECEIVED', /수령할 자료가 없습니다/],
  ['SELECT_MATERIAL', /자료를 선택/],
  ['DISTRIBUTION_FAILED', /수령 내역.*확인/],
]

for (const [reason, meaning] of cases) {
  test(`${reason} remains actionable after the administrator error sanitizer`, () => {
    const message = getScanReasonMessage(reason)
    assert.match(message, meaning)
    assert.equal(getUserErrorMessage(message), message, 'the administrator must retain the specific reason')
    assert.doesNotMatch(message, /[A-Z]+_[A-Z]+/)
    if (!['INVALID_TOKEN', 'DISTRIBUTION_FAILED'].includes(reason)) {
      assert.doesNotMatch(message, /새로고침.*다시 시도/, 'persistent eligibility failures cannot be fixed by refreshing')
    }
  })
}

test('unknown reasons never expose internal codes or raw error text', () => {
  for (const reason of [undefined, '', 'NEW_PRIVATE_ERROR', '<html>gateway</html>', '한국어 오류 SELECT secret FROM internal', 'constructor', '__proto__']) {
    const message = getScanReasonMessage(reason)
    assert.match(message, /[가-힣]/)
    assert.doesNotMatch(message, /NEW_PRIVATE_ERROR|<html>|SELECT|secret|constructor|__proto__/)
  }
})

test('staff failure with a student name still explains the rejection', () => {
  const description = getScanFailureDescription({ success: false, reason: 'NO_SEAT_FOR_SUBJECT', studentName: '검증학생' })
  assert.match(description, /검증학생/)
  assert.match(description, /좌석.*배정/)
})

test('course mismatch retains both courses and the student context', () => {
  const description = getScanFailureDescription({ success: false, reason: 'COURSE_MISMATCH', studentName: '검증학생', selectedCourseName: '형사법', courseName: '경찰학' })
  assert.match(description, /검증학생/)
  assert.match(description, /현재 선택 강좌는 "형사법"/)
  assert.match(description, /QR은 "경찰학" 수강증/)
})
