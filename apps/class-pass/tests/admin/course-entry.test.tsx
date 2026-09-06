import { strict as assert } from 'node:assert'
import { createRequire } from 'node:module'
import { after, test } from 'node:test'

const require = createRequire(import.meta.url)
const Module = require('node:module')
const originalLoad = Module._load
let tenant = 'police'

// Isolate request context and data access; exercise the actual server route.
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request.endsWith('/tenant.server')) return { getServerTenantType: async () => tenant }
  if (request.endsWith('/class-pass-data')) return { getCourseById: async () => null, listCourseSubjects: async () => [] }
  if (request === './course-detail-page-client') return { default: () => null }
  return originalLoad.call(this, request, parent, isMain)
}
after(() => { Module._load = originalLoad })
const CourseEntry = require('../../src/app/(admin)/dashboard/courses/[id]/page').default

test('course entry opens Students and retains the current tenant', async () => {
  for (const division of ['police', 'fire']) {
    tenant = division
    await assert.rejects(
      CourseEntry({ params: Promise.resolve({ id: '8' }) }),
      (error: unknown) => (error as { digest?: string }).digest === `NEXT_REDIRECT;replace;/${division}/dashboard/courses/8/students;307;`,
    )
  }
})

test('invalid course IDs cannot be interpolated into a redirect', async () => {
  for (const id of ['0', '-1', 'abc', '../settings']) {
    await assert.rejects(
      CourseEntry({ params: Promise.resolve({ id }) }),
      (error: unknown) => (error as { digest?: string }).digest === 'NEXT_HTTP_ERROR_FALLBACK;404',
    )
  }
})
