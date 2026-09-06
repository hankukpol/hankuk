import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { ensureStudentProfile, ensureStudentProfilesBatch } from '../../src/lib/student-profiles'
import { normalizeTenantType } from '../../src/lib/tenant'
import type { Student } from '../../src/types/database'

const division = normalizeTenantType('police')!
const oldPhoto = 'https://fixture.invalid/student/old.webp'
const concurrentPhoto = 'https://fixture.invalid/student/concurrent.webp'
const explicitPhoto = 'https://fixture.invalid/student/explicit.webp'
const originalFetch = global.fetch
global.fetch = async () => { throw new Error('Network is forbidden in profile photo tests') }
after(() => { global.fetch = originalFetch })

function student(id: number): Student {
  return {
    id, division, name: `검증학생${id}`, phone: `0101234${String(id).padStart(4, '0')}`,
    exam_number: null, cohort_option_id: 1, birth_date: null,
    auth_method: null, pin_hash: null, photo_url: oldPhoto,
    created_at: '2026-09-06T00:00:00Z', updated_at: '2026-09-06T00:00:00Z',
  }
}

// Only the external persistence boundary is replaced. Real ensure helpers must
// retain an independently committed photo while editing another profile field.
function memoryDb(seeds: Student[], beforeFirstWrite: (rows: Student[]) => void = () => {}) {
  const rows = seeds.map(row => ({ ...row }))
  const writes: Array<{ kind: string; payloads: Array<Record<string, unknown>> }> = []
  let didInterleave = false
  let nextId = 100
  const client = {
    from(table: string) {
      assert.equal(table, 'students')
      const filters: Array<(row: Student) => boolean> = []
      let kind = 'select'
      let payloads: Array<Record<string, unknown>> = []
      let limit = Infinity
      const execute = () => {
        if (kind !== 'select') {
          if (!didInterleave) { didInterleave = true; beforeFirstWrite(rows) }
          writes.push({ kind, payloads: structuredClone(payloads) })
        }
        let result: Student[]
        if (kind === 'select') {
          result = rows.filter(row => filters.every(filter => filter(row))).slice(0, limit)
        } else if (kind === 'update') {
          result = rows.filter(row => filters.every(filter => filter(row)))
          for (const row of result) Object.assign(row, payloads[0])
        } else {
          // A PostgREST bulk request has a common column set. A missing field in
          // one row must not silently be treated as an untouched update column.
          const columns = [...new Set(payloads.flatMap(payload => Object.keys(payload)))]
          result = payloads.map(payload => {
            const supplied = Object.fromEntries(columns.map(column => [column, payload[column] ?? null]))
            const existing = kind === 'upsert' ? rows.find(row => row.id === payload.id) : null
            if (existing) { Object.assign(existing, supplied); return existing }
            const inserted = { ...student(nextId++), photo_url: null, ...supplied } as Student
            rows.push(inserted)
            return inserted
          })
        }
        return { data: result.map(row => ({ ...row })), error: null }
      }
      const query: any = {
        select() { return query },
        eq(field: keyof Student, value: unknown) { filters.push(row => row[field] === value); return query },
        is(field: keyof Student, value: unknown) { return query.eq(field, value) },
        in(field: keyof Student, values: unknown[]) { filters.push(row => values.includes(row[field])); return query },
        order() { return query }, limit(value: number) { limit = value; return query },
        update(payload: Record<string, unknown>) { kind = 'update'; payloads = [payload]; return query },
        insert(payload: Record<string, unknown> | Array<Record<string, unknown>>) { kind = 'insert'; payloads = Array.isArray(payload) ? payload : [payload]; return query },
        upsert(payload: Array<Record<string, unknown>>) { kind = 'upsert'; payloads = payload; return query },
        async single() { const result = execute(); return { data: result.data[0] ?? null, error: null } },
        async maybeSingle() { return query.single() },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) { return Promise.resolve(execute()).then(resolve, reject) },
      }
      return query
    },
  }
  return { rows, writes, client: client as unknown as Parameters<typeof ensureStudentProfile>[0] }
}

for (const mode of ['single', 'batch'] as const) {
  const ensure = async (db: ReturnType<typeof memoryDb>, snapshot: Parameters<typeof ensureStudentProfile>[1]) => {
    if (mode === 'single') return ensureStudentProfile(db.client, snapshot)
    return (await ensureStudentProfilesBatch(db.client, [{ ...snapshot, key: 'fixture' }])).get('fixture')!
  }

  test(`${mode}: ordinary profile edit preserves a photo committed after its student snapshot was read`, async () => {
    const original = student(1)
    const db = memoryDb([original], rows => { rows[0]!.photo_url = concurrentPhoto })
    const result = await ensure(db, { division, currentStudentId: 1, name: original.name, phone: original.phone, cohort_option_id: 2 })
    assert.equal(db.rows[0]!.photo_url, concurrentPhoto)
    assert.equal(result.student.photo_url, concurrentPhoto)
    assert.equal(result.student.cohort_option_id, 2)
    assert.equal(result.changed, true)
    assert.ok(db.writes.every(write => write.payloads.every(payload => !Object.hasOwn(payload, 'photo_url'))))
  })

  test(`${mode}: explicit photo URL still updates the profile photo`, async () => {
    const original = student(1)
    const db = memoryDb([original], rows => { rows[0]!.photo_url = concurrentPhoto })
    const result = await ensure(db, { division, currentStudentId: 1, name: original.name, phone: original.phone, photo_url: explicitPhoto })
    assert.equal(db.rows[0]!.photo_url, explicitPhoto)
    assert.equal(result.student.photo_url, explicitPhoto)
    assert.equal(result.changed, true)
  })

  for (const photo of [undefined, explicitPhoto]) {
    test(`${mode}: new profile insert retains ${photo ? 'explicit photo' : 'null default'} behavior`, async () => {
      const db = memoryDb([])
      const result = await ensure(db, { division, name: '신규학생', phone: '01000000001', ...(photo ? { photo_url: photo } : {}) })
      assert.equal(result.created, true)
      assert.equal(result.student.photo_url, photo ?? null)
    })
  }
}

test('mixed batch does not turn omitted photos into null when another row explicitly changes its photo', async () => {
  const one = student(1)
  const two = student(2)
  const db = memoryDb([one, two], rows => { for (const row of rows) row.photo_url = concurrentPhoto })
  const results = await ensureStudentProfilesBatch(db.client, [
    { key: 'ordinary', division, currentStudentId: 1, name: one.name, phone: one.phone, cohort_option_id: 2 },
    { key: 'photo', division, currentStudentId: 2, name: two.name, phone: two.phone, photo_url: explicitPhoto },
  ])
  assert.equal(db.rows.find(row => row.id === 1)!.photo_url, concurrentPhoto)
  assert.equal(results.get('ordinary')!.student.photo_url, concurrentPhoto)
  assert.equal(db.rows.find(row => row.id === 2)!.photo_url, explicitPhoto)
  assert.equal(results.get('photo')!.student.photo_url, explicitPhoto)
})
