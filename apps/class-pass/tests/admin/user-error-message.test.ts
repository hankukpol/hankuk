import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { getUserErrorMessage } from '../../src/lib/user-error-message'

const cases: Array<[string, RegExp]> = [
  ['TypeError: Failed to fetch', /인터넷 연결/],
  ['NetworkError when attempting to fetch resource.', /인터넷 연결/],
  ['Load failed', /인터넷 연결/],
  ['Loading chunk 42 failed.', /새로고침/],
  ['Request timed out', /처리 결과를 먼저 확인/],
  ['JWT expired', /다시 로그인/],
  ['Unauthorized', /다시 로그인/],
  ['Invalid login credentials', /로그인 정보가 올바르지/],
  ['permission denied for table students', /권한/],
  ['duplicate key value violates unique constraint "students_phone_key"', /중복/],
  ['update or delete violates foreign key constraint', /연결된 데이터/],
  ['null value in column name violates not-null constraint', /필수 입력/],
  ['invalid input syntax for type date', /형식이나 범위/],
  ['Too many requests', /잠시 기다린/],
  ['Payload too large', /파일 용량/],
  ['Could not find function in the schema cache', /데이터 설정/],
  ['Unexpected token < in JSON at position 0', /정상적인 응답/],
  ['SOURCE_COURSE_NOT_FOUND', /정보를 찾을 수/],
]

for (const [raw, expected] of cases) {
  test(`explains ${raw} in Korean with a next action`, () => {
    const text = getUserErrorMessage(new Error(raw))
    assert.match(text, expected)
    assert.notEqual(text, raw)
    assert.doesNotMatch(text, /students_phone_key|schema cache|JSON|JWT/)
  })
}

test('preserves existing Korean validation and named records', () => {
  const text = '홍길동 학생은 이미 등록되어 있습니다. 기존 수강 정보를 확인해 주세요.'
  assert.equal(getUserErrorMessage(text), text)
  assert.equal(getUserErrorMessage('PIN은 4자리로 입력해 주세요.'), 'PIN은 4자리로 입력해 주세요.')
})

test('never prints unknown English errors, HTML or serialized internal details', () => {
  for (const raw of [null, undefined, {}, '', 'INTERNAL_UNKNOWN_FAILURE', '<html>서버 오류</html>', '저장 실패: {"details":"private database detail"}']) {
    assert.match(getUserErrorMessage(raw), /요청을 처리하지 못했습니다/)
  }
  assert.equal(getUserErrorMessage('Unknown', '결제 내역을 확인해 주세요.'), '결제 내역을 확인해 주세요.')
  assert.match(getUserErrorMessage('Unknown', 'Unknown error'), /요청을 처리하지 못했습니다/)
})

test('handles Korean wrappers around raw database errors without leaking details', () => {
  assert.match(getUserErrorMessage('저장 실패: duplicate key value violates unique constraint students_phone_key'), /중복/)
})

test('does not mutate the original exception used for diagnostics', () => {
  const original = new Error('Failed to fetch')
  getUserErrorMessage(original)
  assert.equal(original.message, 'Failed to fetch')
})
