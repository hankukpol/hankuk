import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'

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

describe('distribution receipt matrix pagination', () => {
  const routeSource = readProjectFile('src/app/api/distribution/receipt-matrix/route.ts')

  it('reads every distribution log page for high-volume courses', () => {
    const helper = section(
      routeSource,
      'async function listAllDistributionLogsByMaterialIds',
      'async function listAllSeatAssignmentsForCourseSubjects',
    )

    assert.match(routeSource, /RECEIPT_MATRIX_FETCH_CHUNK_SIZE\s*=\s*1000/)
    assert.match(helper, /for \(let offset = 0; ; offset \+= RECEIPT_MATRIX_FETCH_CHUNK_SIZE\)/)
    assert.match(helper, /\.from\('distribution_logs'\)/)
    assert.match(helper, /\.in\('material_id', materialIds\)/)
    assert.match(helper, /\.order\('material_id'\)[\s\S]*\.order\('enrollment_id'\)[\s\S]*\.order\('id'\)/)
    assert.match(helper, /\.range\(offset, offset \+ RECEIPT_MATRIX_FETCH_CHUNK_SIZE - 1\)/)
    assert.match(helper, /if \(page\.length < RECEIPT_MATRIX_FETCH_CHUNK_SIZE\)/)
  })

  it('reads every subject-gated seat assignment page for high-volume courses', () => {
    const helper = section(
      routeSource,
      'async function listAllSeatAssignmentsForCourseSubjects',
      'export async function GET',
    )

    assert.match(helper, /\.from\('seat_assignments'\)/)
    assert.match(helper, /\.in\('subject_id', subjectIds\)/)
    assert.match(helper, /\.eq\('enrollments\.course_id', courseId\)/)
    assert.match(helper, /\.order\('subject_id'\)[\s\S]*\.order\('enrollment_id'\)[\s\S]*\.order\('id'\)/)
    assert.match(helper, /\.range\(offset, offset \+ RECEIPT_MATRIX_FETCH_CHUNK_SIZE - 1\)/)
    assert.match(helper, /if \(page\.length < RECEIPT_MATRIX_FETCH_CHUNK_SIZE\)/)
  })

  it('uses the paginated readers from the route handler', () => {
    const handler = section(routeSource, 'export async function GET', '<EOF>')

    assert.match(handler, /listAllDistributionLogsByMaterialIds\(db, materialIds\)/)
    assert.match(handler, /listAllSeatAssignmentsForCourseSubjects\(db, courseId, seatGatedSubjectIds\)/)
  })
})
