import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { beforeEach, describe, it } from 'node:test'
import type { Enrollment } from '../../src/types/database'
import type { PaymentImportRowInput } from '../../src/lib/payments/bulk-import'

const require = createRequire(import.meta.url)
const Module = require('node:module')
const originalLoad = Module._load
type DbRow = Record<string, any>
const state = {
  tables: {} as Record<string, DbRow[]>,
  rpcCalls: [] as Array<{ name: string; args: DbRow }>,
  failRpc: false,
}

// Only the database and Next cache runtime are replaced. Import and payment service stay real.
Module._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === '@/lib/supabase/server') return { createServerClient: () => makeDb() }
  if (request === 'next/cache') return { revalidateTag: () => undefined, unstable_cache: (fn: unknown) => fn }
  return originalLoad.call(this, request, parent, isMain)
}
const importModule = import('../../src/lib/payments/bulk-import')

beforeEach(() => {
  state.tables = {
    enrollments: [makeEnrollment()],
    enrollment_billing: [{ id: 31, enrollment_id: 11, course_id: 101, expected_amount: 100000, discount_amount: 0, discount_reason: null, payable_amount: 100000, tuition_exempt: false, tuition_exempt_reason: null, status: 'unpaid', created_by_staff_id: null, created_at: '2026-09-05T00:00:00Z', updated_at: '2026-09-05T00:00:00Z' }],
    enrollment_payments: [],
    courses: [{ id: 101, name: '기본반', division: 'police', tuition_amount: 100000 }],
    students: [{ id: 21, division: 'police', name: '홍길동', phone: '01012345678', birth_date: '990101', exam_number: 'A001', auth_method: 'birth_date', pin_hash: null, cohort_option_id: null, photo_url: null, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' }],
    branch_series_options: [{ id: 1, branch_id: 1, group_key: 'public', label: '공채', is_default: true, is_active: true, display_order: 0, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z', branches: { slug: 'police' } }],
  }
  state.rpcCalls = []
  state.failRpc = false
})

describe('payment import student grouping', () => {
  it('accepts card and cash rows for the same existing enrollment', async () => {
    const { previewPaymentImportRows } = await importModule
    const result = previewPaymentImportRows({ rows: splitRows(), enrollments: [makeEnrollment()], createMissingEnrollment: false })
    assert.deepEqual(result.map((row) => [row.status, row.enrollmentId, row.amount]), [
      ['matched', 11, 60000], ['matched', 11, 40000],
    ])
  })

  it('accepts separate instruments with equal amounts for a new student', async () => {
    const { previewPaymentImportRows } = await importModule
    const result = previewPaymentImportRows({ rows: splitRows().map((row) => ({ ...row, amount: 50000 })), enrollments: [], createMissingEnrollment: true })
    assert.deepEqual(result.map((row) => row.status), ['create', 'create'])
  })

  it('blocks an exact normalized transaction duplicate without saving any part of its student group', async () => {
    const { runPaymentImport } = await importModule
    const result = await runPaymentImport(importParams([
      row({ amount: 100000, method: '카드', cardCompany: '신한카드', paidAt: '2026/09/05' }),
      row({ amount: '100,000', method: 'card', cardCompany: '신한', paidAt: '2026-09-05' }),
    ]))
    assert.equal(result.createdPaymentCount, 0)
    assert.equal(result.duplicateCount, 1)
    assert.equal(result.errorCount, 1)
    assert.match(result.rows[1].message, /동일.*거래|거래.*중복/)
    assert.deepEqual(state.tables.enrollment_payments, [])
  })

  it('submits the full card and cash tuition collection in one atomic payment bundle', async () => {
    const { runPaymentImport } = await importModule
    const result = await runPaymentImport(importParams(splitRows()))
    assert.equal(result.errorCount, 0)
    assert.equal(result.createdPaymentCount, 2)
    assert.equal(state.rpcCalls.length, 1)
    assert.equal(state.rpcCalls[0].name, 'create_payment_bundle_atomic')
    assert.equal(state.rpcCalls[0].args.p_enrollment_id, 11)
    assert.equal(state.rpcCalls[0].args.p_billing, null)
    assert.match(String(state.rpcCalls[0].args.p_checkout_group_id), /^[0-9a-f]{8}-[0-9a-f-]{27}$/)
    assert.deepEqual(state.rpcCalls[0].args.p_payments.map((payment: DbRow) => [payment.method, payment.amount]), [['card', 60000], ['cash', 40000]])
    assert.equal(state.tables.enrollment_payments.length, 2)
    assert.equal(state.tables.enrollment_billing[0].status, 'paid')
  })

  it('leaves every row in the group unsaved when the atomic bundle fails', async () => {
    state.failRpc = true
    const { runPaymentImport } = await importModule
    const result = await runPaymentImport(importParams(splitRows()))
    assert.equal(result.createdPaymentCount, 0)
    assert.equal(result.errorCount, 2)
    assert.deepEqual(result.rows.map((entry) => entry.status), ['error', 'error'])
    assert.deepEqual(state.tables.enrollment_payments, [])
  })

  it('creates one enrollment with full tuition billing and both instruments in the enrollment transaction', async () => {
    state.tables.enrollments = []
    state.tables.enrollment_billing = []
    const { runPaymentImport } = await importModule
    const result = await runPaymentImport(importParams(splitRows(), { enrollments: [], createMissingEnrollment: true }))
    assert.equal(result.errorCount, 0, JSON.stringify(result.rows))
    assert.equal(result.createdEnrollmentCount, 1)
    assert.equal(result.createdPaymentCount, 2)
    assert.deepEqual(result.rows.map((entry) => entry.enrollmentId), [801, 801])
    assert.equal(state.rpcCalls.length, 1)
    const call = state.rpcCalls[0]
    assert.equal(call.name, 'create_enrollment_batch_atomic')
    assert.equal(call.args.p_student_id, 21)
    assert.equal(call.args.p_division, 'police')
    assert.equal(call.args.p_registrations.length, 1)
    assert.deepEqual(call.args.p_registrations[0].billing, {
      expectedAmount: 100000, discountAmount: 0, discountReason: null, payableAmount: 100000,
      tuitionExempt: false, tuitionExemptReason: null,
    })
    assert.deepEqual(call.args.p_registrations[0].payments.map((entry: DbRow) => [entry.amount, entry.method]), [[60000, 'card'], [40000, 'cash']])
    assert.equal(call.args.p_registrations[0].payments[0].paidAt, '2026-09-04T15:00:00.000Z')
    assert.equal(state.tables.enrollments.length, 1)
    assert.equal(state.tables.enrollment_payments.length, 2)
  })

  it('leaves no missing-student enrollment or billing behind when the enrollment transaction rejects', async () => {
    state.tables.enrollments = []
    state.tables.enrollment_billing = []
    state.failRpc = true
    const { runPaymentImport } = await importModule
    const result = await runPaymentImport(importParams(splitRows(), { enrollments: [], createMissingEnrollment: true }))
    assert.equal(state.rpcCalls[0]?.name, 'create_enrollment_batch_atomic')
    assert.equal(result.errorCount, 2)
    assert.equal(result.createdEnrollmentCount, 0)
    assert.equal(result.createdPaymentCount, 0)
    assert.deepEqual(state.tables.enrollments, [])
    assert.deepEqual(state.tables.enrollment_billing, [])
    assert.deepEqual(state.tables.enrollment_payments, [])
    assert.equal(state.tables.students.length, 1, 'pre-existing student master must be preserved')
  })

  it('rejects partial tuition even when the student has distinct valid instruments', async () => {
    const { runPaymentImport } = await importModule
    const result = await runPaymentImport(importParams([row({ amount: 30000 }), row({ amount: 20000, method: 'point' })]))
    assert.equal(result.errorCount, 2)
    assert.equal(result.createdPaymentCount, 0)
    assert.equal(state.rpcCalls.length, 0)
    assert.match(result.rows[0].message, /남은 적용 금액/)
  })

  it('blocks the full group when an instrument has an invalid date during preview', async () => {
    const { runPaymentImport } = await importModule
    const result = await runPaymentImport(importParams([row({ amount: 60000 }), row({ amount: 40000, paidAt: 'not-a-date' })], { dryRun: true }))
    assert.equal(result.errorCount, 2)
    assert.equal(result.createdPaymentCount, 0)
    assert.equal(state.rpcCalls.length, 0)
  })

  it('keeps existing equal-amount cash from blocking a distinct card transaction', async () => {
    state.tables.enrollment_payments.push({ enrollment_id: 11, course_id: 101, paid_at: '2026-09-04T15:00:00.000Z', paid_date: '2026-09-05', amount: 100000, method: 'cash', category: 'textbook', card_company: null, depositor_name: null, memo: null, status: 'paid', courses: { division: 'police' } })
    const { runPaymentImport } = await importModule
    const result = await runPaymentImport(importParams([row({ amount: 100000, category: 'textbook', method: 'card', cardCompany: '신한' })], { dryRun: true }))
    assert.equal(result.duplicateCount, 0)
    assert.equal(result.matchedCount, 1)
  })

  it('reports an exact existing transaction as a possible duplicate requiring source review', async () => {
    state.tables.enrollment_payments.push({ enrollment_id: 11, course_id: 101, paid_at: '2026-09-04T15:00:00.000Z', paid_date: '2026-09-05', amount: 100000, method: 'cash', category: 'textbook', card_company: null, depositor_name: null, memo: null, status: 'paid', courses: { division: 'police' } })
    const { runPaymentImport } = await importModule
    const result = await runPaymentImport(importParams([row({ category: 'textbook' })]))
    assert.equal(result.duplicateCount, 1)
    assert.equal(result.createdPaymentCount, 0)
    assert.match(result.rows[0].message, /중복 가능성.*원본 거래/)
  })

  it('excludes textbook receipts from the new full-tuition billing amount', async () => {
    state.tables.enrollments = []
    state.tables.enrollment_billing = []
    const { runPaymentImport } = await importModule
    const result = await runPaymentImport(importParams([...splitRows(), row({ amount: 15000, category: 'textbook' })], { enrollments: [], createMissingEnrollment: true }))
    assert.equal(result.createdPaymentCount, 3)
    assert.equal(state.rpcCalls[0].args.p_registrations[0].billing.payableAmount, 100000)
  })

  it('does not silently invent zero tuition for a missing student with textbook-only receipts', async () => {
    const { runPaymentImport } = await importModule
    const result = await runPaymentImport(importParams([row({ amount: 15000, category: 'textbook' })], { enrollments: [], createMissingEnrollment: true, dryRun: true }))
    assert.equal(result.errorCount, 1)
    assert.match(result.rows[0].message, /수강료/)
    assert.equal(state.rpcCalls.length, 0)
  })

  it('requires an explicit non-point exemption reason for a new free registration', async () => {
    const { runPaymentImport } = await importModule
    for (const memo of [null, '포인트 사용']) {
      const result = await runPaymentImport(importParams([row({ amount: 0, method: 'free', memo })], { enrollments: [], createMissingEnrollment: true, dryRun: true }))
      assert.equal(result.errorCount, 1)
      assert.equal(state.rpcCalls.length, 0)
    }
  })

  it('preserves an existing student profile and auth settings even when registration fails', async () => {
    state.tables.enrollments = []
    state.tables.students[0].auth_method = null
    state.tables.students[0].birth_date = null
    const before = structuredClone(state.tables.students)
    state.failRpc = true
    const { runPaymentImport } = await importModule
    const result = await runPaymentImport(importParams(splitRows(), { enrollments: [], createMissingEnrollment: true }))
    assert.equal(result.errorCount, 2)
    assert.deepEqual(state.tables.students, before)
  })

  it('keeps and reports the newly prepared student profile if the enrollment transaction rejects', async () => {
    state.tables.enrollments = []
    state.tables.enrollment_billing = []
    state.tables.students = []
    state.failRpc = true
    const { runPaymentImport } = await importModule
    const result = await runPaymentImport(importParams(splitRows(), { enrollments: [], createMissingEnrollment: true }))
    assert.equal(result.createdEnrollmentCount, 0)
    assert.equal(result.createdPaymentCount, 0)
    assert.deepEqual(state.tables.enrollments, [])
    assert.equal(state.tables.students.length, 1)
    assert.match(result.rows[0].message, /학생 기본정보.*기존 학생.*확인/)
  })

  it('rejects cancelled registrations before issuing a payment transaction', async () => {
    const cancelled = { ...makeEnrollment(), status: 'cancelled' } as Enrollment
    const { runPaymentImport } = await importModule
    const result = await runPaymentImport(importParams(splitRows(), { enrollments: [cancelled], dryRun: true }))
    assert.equal(result.errorCount, 2)
    assert.match(result.rows[0].message, /취소/)
    assert.equal(state.rpcCalls.length, 0)
  })

  it('finds review conflicts beyond the first page of existing transactions', async () => {
    state.tables.enrollment_payments = Array.from({ length: 1001 }, (_, index) => ({
      id: index + 1, enrollment_id: 11, course_id: 101, paid_at: '2026-09-04T15:00:00.000Z', amount: 100000,
      method: 'cash', category: 'textbook', card_company: null, depositor_name: null,
      memo: index === 1000 ? null : `earlier-${index}`, status: 'paid', courses: { division: 'police' },
    }))
    const { runPaymentImport } = await importModule
    const result = await runPaymentImport(importParams([row({ category: 'textbook' })], { dryRun: true }))
    assert.equal(result.duplicateCount, 1)
  })

  it('holds all conflicting identity rows instead of picking the first student under an exam number', async () => {
    const { previewPaymentImportRows } = await importModule
    const result = previewPaymentImportRows({ rows: [row(), row({ name: '다른학생', phone: '01099998888', method: 'point' })], enrollments: [], createMissingEnrollment: true })
    assert.deepEqual(result.map((entry) => entry.status), ['error', 'error'])
  })

  it('does not write another valid row from a student with an invalid card instrument', async () => {
    const { runPaymentImport } = await importModule
    const result = await runPaymentImport(importParams([row(), row({ amount: 15000, category: 'textbook', method: 'card', cardCompany: null })]))
    assert.equal(result.errorCount, 2)
    assert.equal(result.createdPaymentCount, 0)
    assert.deepEqual(state.tables.enrollment_payments, [])
  })
})

function makeEnrollment(): Enrollment & { courses: { id: number; name: string; division: string } } {
  return {
    id: 11, course_id: 101, student_id: 21, name: '홍길동', phone: '01012345678', exam_number: 'A001',
    gender: '남', region: null, series_option_id: 1, series_group: 'public', series: '공채', student_type: 'academy',
    status: 'active', photo_url: null, memo: null, refunded_at: null, suspended_at: null, suspension_reason: null,
    suspended_by: null, custom_data: {}, created_at: '2026-09-01T00:00:00Z',
    courses: { id: 101, name: '기본반', division: 'police' },
  }
}

function row(overrides: PaymentImportRowInput = {}): PaymentImportRowInput {
  return { name: '홍길동', phone: '010-1234-5678', birthDate: '990101', examNumber: 'A001', amount: 100000, paidAt: '2026-09-05', method: 'cash', category: 'tuition', ...overrides }
}

function splitRows() {
  return [row({ amount: 60000, method: 'card', cardCompany: '신한' }), row({ amount: 40000, method: 'cash' })]
}

function importParams(rows: PaymentImportRowInput[], overrides: DbRow = {}) {
  return { courseId: 101, rows, enrollments: [makeEnrollment()], createMissingEnrollment: false, dryRun: false, division: 'police', actorStaffId: 77, ...overrides }
}

function makeDb() {
  return {
    from(table: string) {
      const filters: Array<(entry: DbRow) => boolean> = []
      let update: DbRow | null = null
      let remove = false
      let inserts: DbRow[] | null = null
      let rangeStart = 0
      let rangeEnd = 999
      const value = (entry: DbRow, key: string) => key.split('.').reduce((result, part) => result?.[part], entry)
      const query = {
        select() { return this },
        eq(key: string, expected: unknown) { filters.push((entry) => value(entry, key) === expected); return this },
        neq(key: string, expected: unknown) { filters.push((entry) => value(entry, key) !== expected); return this },
        in(key: string, expected: unknown[]) { filters.push((entry) => expected.includes(value(entry, key))); return this },
        update(patch: DbRow) { update = patch; return this },
        insert(payload: DbRow | DbRow[]) { inserts = Array.isArray(payload) ? payload : [payload]; return this },
        delete() { remove = true; return this },
        order() { return this },
        limit() { return this },
        range(start: number, end: number) { rangeStart = start; rangeEnd = end; return this },
        maybeSingle: async () => ({ data: execute()[0] ?? null, error: null }),
        single: async () => ({ data: execute()[0] ?? null, error: null }),
        is(key: string, expected: unknown) { filters.push((entry) => value(entry, key) === expected); return this },
        then(resolve: (value: unknown) => unknown) { const data = execute(); return Promise.resolve({ data, count: data.length, error: null }).then(resolve) },
      }
      function execute() {
        const entries = state.tables[table] ?? (state.tables[table] = [])
        if (inserts) { entries.push(...inserts.map((entry, index) => ({ id: 700 + entries.length + index, ...entry }))); inserts = null }
        const selected = entries.filter((entry) => filters.every((filter) => filter(entry)))
        if (update) selected.forEach((entry) => Object.assign(entry, update))
        if (remove) state.tables[table] = entries.filter((entry) => !selected.includes(entry))
        return selected.slice(rangeStart, rangeEnd + 1)
      }
      return query
    },
    async rpc(name: string, args: DbRow) {
      state.rpcCalls.push({ name, args })
      if (name === 'create_enrollment_batch_atomic') {
        if (state.failRpc) return { data: null, error: { code: 'XX000', message: 'transaction failed' } }
        const registration = args.p_registrations[0]
        const enrollment = { ...makeEnrollment(), id: 801, student_id: args.p_student_id }
        state.tables.enrollments.push(enrollment)
        state.tables.enrollment_billing.push({ enrollment_id: 801, payable_amount: registration.billing.payableAmount })
        const paymentIds = registration.payments.map((payment: DbRow, index: number) => {
          const id = 901 + index
          state.tables.enrollment_payments.push({ id, enrollment_id: 801, ...payment })
          return id
        })
        return { data: [{ result_index: 1, enrollment_id: 801, course_id: 101, reactivated: false, payment_ids: paymentIds, enrollment_row: enrollment }], error: null }
      }
      assert.equal(name, 'create_payment_bundle_atomic', 'unexpected write RPC')
      if (state.failRpc) return { data: null, error: { code: 'XX000', message: 'transaction failed' } }
      const payments = args.p_payments.map((payment: DbRow, index: number) => ({
        id: 501 + index, enrollment_id: args.p_enrollment_id, course_id: args.p_course_id,
        amount: payment.amount, method: payment.method, status: 'paid', category: payment.category,
        paid_at: payment.paidAt, paid_date: '2026-09-05', memo: payment.memo, card_last4: payment.cardLast4,
        installment_months: payment.installmentMonths, bank_name: payment.bankName, bank_account_last4: null,
        depositor_name: payment.depositorName, cash_receipt_approval_no: payment.cashReceiptApprovalNo,
        display_receipt_no: null, card_company: payment.cardCompany, checkout_group_id: args.p_checkout_group_id,
        series_option_id_snapshot: 1, series_group_snapshot: 'public', series_label_snapshot: '공채',
        created_by_staff_id: args.p_actor_staff_id, created_at: '2026-09-05T00:00:00Z', updated_at: '2026-09-05T00:00:00Z',
        enrollment_payment_items: payment.items, enrollment_refunds: [], courses: { id: 101, name: '기본반', division: 'police' },
      }))
      state.tables.enrollment_payments.push(...payments)
      return { data: payments.map((payment: DbRow) => ({ payment_id: payment.id })), error: null }
    },
  }
}
