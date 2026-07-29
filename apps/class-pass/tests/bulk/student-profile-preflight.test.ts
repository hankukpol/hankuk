import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { inspectStudentProfilesBatch } from '../../src/lib/student-profiles'
import { normalizeTenantType } from '../../src/lib/tenant'
import type { Student } from '../../src/types/database'

const policeTenant = normalizeTenantType('police')!

function makeStudent(overrides: Partial<Student> & Pick<Student, 'id' | 'name' | 'phone'>): Student {
  return {
    id: overrides.id,
    division: overrides.division ?? policeTenant,
    name: overrides.name,
    phone: overrides.phone,
    exam_number: overrides.exam_number ?? null,
    cohort_option_id: overrides.cohort_option_id ?? null,
    birth_date: overrides.birth_date ?? null,
    pin_hash: overrides.pin_hash ?? null,
    auth_method: overrides.auth_method ?? null,
    photo_url: overrides.photo_url ?? null,
    created_at: overrides.created_at ?? '2026-01-01T00:00:00.000Z',
    updated_at: overrides.updated_at ?? '2026-01-01T00:00:00.000Z',
  }
}

function createReadOnlyStudentsDb(students: Student[]) {
  const operations: string[] = []

  return {
    operations,
    client: {
      from(table: string) {
        assert.equal(table, 'students')
        let rows = [...students] as unknown as Array<Record<string, unknown>>
        const query = {
          select() {
            operations.push('select')
            return query
          },
          eq(field: string, value: unknown) {
            rows = rows.filter((row) => row[field] === value)
            return query
          },
          in(field: string, values: unknown[]) {
            rows = rows.filter((row) => values.includes(row[field]))
            return query
          },
          order() {
            return query
          },
          insert() {
            throw new Error('preflight must not insert')
          },
          update() {
            throw new Error('preflight must not update')
          },
          delete() {
            throw new Error('preflight must not delete')
          },
          then(
            resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown,
            reject?: (reason: unknown) => unknown,
          ) {
            return Promise.resolve({ data: rows, error: null }).then(resolve, reject)
          },
        }
        return query
      },
    },
  }
}

describe('student master bulk preflight', () => {
  it('returns every matching master and conflict without performing writes', async () => {
    const master = makeStudent({
      id: 17,
      name: '마스터학생',
      phone: '01012345678',
      exam_number: 'A-001',
      birth_date: '990315',
    })
    const fakeDb = createReadOnlyStudentsDb([master])

    const results = await inspectStudentProfilesBatch(
      fakeDb.client as unknown as Parameters<typeof inspectStudentProfilesBatch>[0],
      [
        {
          key: 'conflict',
          division: policeTenant,
          name: '잘못된이름',
          phone: '01012345678',
          exam_number: 'A-001',
          birth_date: '990315',
        },
        {
          key: 'clean',
          division: policeTenant,
          name: '마스터학생',
          phone: '01012345678',
          exam_number: 'A-001',
          birth_date: '990315',
        },
        {
          key: 'new',
          division: policeTenant,
          name: '신규학생',
          phone: '01099998888',
          exam_number: 'NEW-001',
          birth_date: '000101',
        },
      ],
    )

    assert.equal(results.size, 3)
    assert.equal(results.get('conflict')?.student?.id, master.id)
    assert.deepEqual(results.get('conflict')?.conflict?.fields, ['name'])
    assert.equal(results.get('clean')?.student?.id, master.id)
    assert.equal(results.get('clean')?.conflict, null)
    assert.equal(results.get('new')?.student, null)
    assert.equal(results.get('new')?.conflict, null)
    assert.ok(fakeDb.operations.length > 0)
    assert.ok(fakeDb.operations.every((operation) => operation === 'select'))
  })
})
