import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import * as studentSession from '../../src/lib/student-session'
import { normalizeTenantType } from '../../src/lib/tenant'

const originalFetch = global.fetch
const originalWindow = global.window
after(() => { global.fetch = originalFetch; global.window = originalWindow })

test('expired server authentication clears identity and requires explicit login without retrying credentials', async () => {
  const removed: string[] = []
  const destinations: string[] = []
  let calls = 0
  global.window = { sessionStorage: { removeItem: (key: string) => removed.push(key) }, location: { replace: (url: string) => destinations.push(url) } } as any
  global.fetch = async () => { calls++; return new Response('{}', { status: 401 }) }
  const fetchApi = (studentSession as any).fetchStudentApi
  assert.equal(typeof fetchApi, 'function', 'student requests need expired-session recovery')
  const response = await fetchApi(normalizeTenantType('police'), '/police/api/enrollments/pass')
  assert.equal(response.status, 401)
  assert.equal(calls, 1)
  assert.deepEqual(removed, ['class_pass_student_name', 'class_pass_student_phone', 'class_pass_student_verification', 'class_pass_student_courses'])
  assert.deepEqual(destinations, ['/police?loggedOut=1&sessionExpired=1'])
})

test('normal student API errors do not remove authentication', async () => {
  global.window = { sessionStorage: { removeItem: () => assert.fail('must not clear') }, location: { replace: () => assert.fail('must not redirect') } } as any
  global.fetch = async () => new Response('{}', { status: 403 })
  assert.equal(typeof (studentSession as any).fetchStudentApi, 'function')
  assert.equal((await (studentSession as any).fetchStudentApi(normalizeTenantType('police'), '/police/api/attendance/submit')).status, 403)
})
