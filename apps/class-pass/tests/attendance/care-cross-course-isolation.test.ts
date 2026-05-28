import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

function readProjectFile(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

function section(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker)
  assert.notEqual(start, -1, `missing section start: ${startMarker}`)

  const end = endMarker === '<EOF>'
    ? source.length
    : source.indexOf(endMarker, start + startMarker.length)
  assert.notEqual(end, -1, `missing section end: ${endMarker}`)

  return source.slice(start, end)
}

function countOccurrences(source: string, needle: string) {
  return source.split(needle).length - 1
}

describe('attendance care cross-course isolation', () => {
  const serviceSource = readProjectFile('src/lib/attendance/service.ts')
  const routeHelpersSource = readProjectFile('src/lib/attendance/route-helpers.ts')
  const careNotesRouteSource = readProjectFile('src/app/api/attendance/admin/care-notes/route.ts')
  const careStateRouteSource = readProjectFile('src/app/api/attendance/admin/care-state/route.ts')

  it('keeps the enrollment and subject course-boundary guard in the service layer', () => {
    const guard = section(
      serviceSource,
      'export async function assertEnrollmentBelongsToCourse',
      'async function listActiveEnrollments',
    )

    assert.match(guard, /getAttendanceExcuseEnrollment\(input\.enrollmentId\)/)
    assert.match(guard, /getAttendanceExcuseSubject\(input\.subjectId\)/)
    assert.match(guard, /enrollment\.course_id !== input\.courseId/)
    assert.match(guard, /subject\.course_id !== input\.courseId/)
    assert.match(guard, /throw new AttendanceServiceError\([^,]+,\s*403\)/)
  })

  it('runs the course-boundary guard before every care mutation or history query', () => {
    const cases = [
      {
        name: 'upsertEnrollmentCareState',
        end: 'export async function appendEnrollmentCareNote',
      },
      {
        name: 'appendEnrollmentCareNote',
        end: 'export async function listEnrollmentCareNoteHistory',
      },
      {
        name: 'listEnrollmentCareNoteHistory',
        end: '<EOF>',
      },
    ]

    for (const item of cases) {
      const body = section(
        serviceSource,
        `export async function ${item.name}`,
        item.end,
      )
      const guardIndex = body.indexOf('await assertEnrollmentBelongsToCourse')
      const dbIndex = body.indexOf('const db = createServerClient()')

      assert.match(body, /courseId:\s*number/, `${item.name} must require courseId`)
      assert.notEqual(guardIndex, -1, `${item.name} must call assertEnrollmentBelongsToCourse`)
      assert.notEqual(dbIndex, -1, `${item.name} must create the DB client after validation`)
      assert.ok(guardIndex < dbIndex, `${item.name} must validate course ownership before DB access`)
      assert.match(body, /courseId:\s*input\.courseId/, `${item.name} must pass courseId into the guard`)
      assert.match(body, /enrollmentId:\s*input\.enrollmentId/, `${item.name} must pass enrollmentId into the guard`)
      assert.match(body, /subjectId:\s*input\.subjectId/, `${item.name} must pass subjectId into the guard`)
    }
  })

  it('passes courseId from both admin routes into the guarded service functions', () => {
    assert.match(careNotesRouteSource, /listEnrollmentCareNoteHistory\(\{[\s\S]*courseId:\s*parsed\.data\.courseId/)
    assert.match(careNotesRouteSource, /appendEnrollmentCareNote\(\{[\s\S]*courseId:\s*parsed\.data\.courseId/)
    assert.match(careStateRouteSource, /upsertEnrollmentCareState\(\{[\s\S]*courseId:\s*parsed\.data\.courseId/)
  })

  it('keeps rate limits and private response headers on the care admin routes', () => {
    assert.match(routeHelpersSource, /maxAttempts:\s*60/)
    assert.match(routeHelpersSource, /windowSeconds:\s*60/)
    assert.match(routeHelpersSource, /checkRateLimit\(`attendance-care:\$\{actor\}:course:\$\{courseId\}`/)
    assert.match(routeHelpersSource, /'Cache-Control':\s*'no-store, private'/)
    assert.match(routeHelpersSource, /'X-Robots-Tag':\s*'noindex'/)

    assert.equal(countOccurrences(careNotesRouteSource, 'requireAttendanceCareRateLimit'), 3)
    assert.equal(countOccurrences(careStateRouteSource, 'requireAttendanceCareRateLimit'), 2)
    assert.match(careNotesRouteSource, /withAttendanceCareHeaders\(guard\.response\)/)
    assert.match(careStateRouteSource, /withAttendanceCareHeaders\(guard\.response\)/)
    assert.match(careNotesRouteSource, /return attendanceCareJson\(\{ notes \}\)/)
    assert.match(careNotesRouteSource, /return attendanceCareJson\(\{ note \}, \{ status: 201 \}\)/)
    assert.match(careStateRouteSource, /return attendanceCareJson\(\{ state \}\)/)
  })
})
