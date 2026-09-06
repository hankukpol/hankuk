import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)

test('material read models keep all 1200 rows when the Data API caps each page at 300', async () => {
  const Module = require('node:module')
  const original = Module._load
  const offsets: Record<string, number[]> = {}
  const db = { from(table: string) {
    let offset = 0
    let fields = ''
    const query = {
      select(value: string) { fields = value; return query },
      eq() { return query }, in() { return query }, order() { return query },
      range(start: number) { offset = start; return query },
      then(resolve: (value: unknown) => void) {
        const key = `${table}:${fields}`
        ;(offsets[key] ??= []).push(offset)
        const data = Array.from({ length: 1200 }, (_, i) => ({
          id: i + 1, course_id: 8, material_id: i + 1, subject_id: i + 1,
          material_type: 'textbook', is_active: true, sort_order: i,
          distributed_at: '2026-09-05T00:00:00Z',
          materials: { id: i + 1, material_type: 'textbook', is_active: true, sort_order: i },
          course_subjects: { id: i + 1, course_id: 8, sort_order: i },
        })).slice(offset, offset + 300)
        return Promise.resolve({ data, error: null }).then(resolve)
      },
    }
    return query
  } }
  Module._load = function (id: string, parent: unknown, isMain: boolean) {
    if (id === 'next/cache') return { unstable_cache: (fn: unknown) => fn }
    if (id === '@/lib/supabase/server') return { createServerClient: () => db }
    return original.call(this, id, parent, isMain)
  }
  try {
    const data = require('../../src/lib/class-pass-data')
    assert.equal((await data.listMaterialsForCourse(8)).length, 1200)
    assert.equal((await data.getTextbookAssignments(1)).length, 1200)
    assert.equal((await data.getTextbookAssignmentsByCourse(8)).length, 1200)
    assert.equal((await data.getAssignedTextbooksForEnrollment(1)).length, 1200)
    assert.equal((await data.listSeatAssignedSubjectIdsForEnrollment(1)).size, 1200)
    assert.equal((await data.getReceiptRows(1)).length, 1200)
    assert.equal((await data.listSeatAssignmentsForEnrollment(1, 8)).length, 1200)
    assert.equal((await data.getUnreceivedMaterialsForEnrollment(1, 8)).length, 0)
    for (const values of Object.values(offsets)) assert.ok(values.includes(1200), 'must read the empty terminal page')
  } finally { Module._load = original }
})
