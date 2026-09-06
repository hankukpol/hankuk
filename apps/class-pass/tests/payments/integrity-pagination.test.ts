import assert from 'node:assert/strict'
import { describe, it, type TestContext } from 'node:test'
import { checkPaymentIntegrity } from '../../src/lib/payments/integrity'

type Row = Record<string, string | number | boolean | null>
type Fixture = {
  courses: Row[]
  enrollments: Row[]
  enrollment_billing: Row[]
  enrollment_payments: Row[]
  enrollment_refunds: Row[]
}

const timestamp = '2026-09-05T00:00:00.000Z'

function course(id = 1): Row {
  return { id, name: `강좌 ${id}`, status: 'active', tuition_amount: 10000, division: 'police' }
}

function enrollment(id: number, courseId = 1): Row {
  return {
    id, course_id: courseId, student_id: id, name: `테스트 ${id}`, phone: '01000000000',
    exam_number: null, status: 'active', created_at: timestamp,
  }
}

function fixture(count: number): Fixture {
  return {
    courses: [course()],
    enrollments: Array.from({ length: count }, (_, index) => enrollment(index + 1)),
    enrollment_billing: [], enrollment_payments: [], enrollment_refunds: [],
  }
}

function densePaymentFixture(): Fixture {
  const rows = fixture(1)
  rows.enrollment_billing = Array.from({ length: 1001 }, (_, index) => ({
    id: index + 1, enrollment_id: 1, course_id: 1, expected_amount: 10000,
    discount_amount: 0, payable_amount: 10000, tuition_exempt: false,
    status: 'unpaid', created_at: timestamp, updated_at: timestamp,
  }))
  rows.enrollment_payments = Array.from({ length: 1001 }, (_, index) => ({
    id: index + 1, enrollment_id: 1, course_id: 1, amount: 10000,
    status: 'paid', category: 'tuition', method: 'card',
    paid_date: '2026-09-05', created_at: timestamp,
  }))
  rows.enrollment_refunds = Array.from({ length: 1001 }, (_, index) => ({
    id: index + 1, payment_id: 1, amount: 1, refunded_at: timestamp,
  }))
  return rows
}

// Only the external HTTP transport is replaced. The real Supabase query builder,
// server-client factory, pagination consumer, and integrity calculations all run.
function installTransport(t: TestContext, rows: Fixture, options: { maxRows?: number; failTable?: string; failOffset?: number } = {}) {
  const savedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://integrity-pagination.invalid'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-key'
  t.after(() => {
    if (savedUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = savedUrl
    if (savedKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
    else process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey
  })

  const requests: URL[] = []
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    assert.equal(url.origin, 'https://integrity-pagination.invalid')
    assert.equal(init?.method ?? 'GET', 'GET', 'integrity checks must only read')
    requests.push(url)
    const table = url.pathname.split('/').at(-1) as keyof Fixture
    assert.ok(table in rows, `Unexpected table: ${table}`)
    const offset = Number(url.searchParams.get('offset') ?? 0)
    if (table === options.failTable && offset === (options.failOffset ?? 0)) {
      return Response.json({ code: 'TEST_PAGE_FAILURE', message: 'page read failed', details: null, hint: null }, { status: 400 })
    }

    let filtered = rows[table].filter((row) => {
      for (const [column, filter] of url.searchParams) {
        if (filter.startsWith('eq.') && String(row[column]) !== filter.slice(3)) return false
        if (filter.startsWith('in.(') && !filter.slice(4, -1).split(',').includes(String(row[column]))) return false
      }
      return true
    })
    const order = (url.searchParams.get('order') ?? '').split(',').filter(Boolean)
    filtered = filtered.toSorted((left, right) => {
      for (const part of order) {
        const [column, direction] = part.split('.')
        const a = left[column]
        const b = right[column]
        const comparison = typeof a === 'number' && typeof b === 'number'
          ? a - b : String(a).localeCompare(String(b))
        if (comparison !== 0) return direction === 'desc' ? -comparison : comparison
      }
      return 0
    })
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 1000), options.maxRows ?? 1000)
    return Response.json(filtered.slice(offset, offset + limit))
  })
  return requests
}

describe('checkPaymentIntegrity pagination through the real Supabase client', () => {
  for (const scenario of [
    { count: 1001, max: undefined, checked: 1001, truncated: false },
    { count: 2000, max: undefined, checked: 2000, truncated: false },
    { count: 2001, max: undefined, checked: 2000, truncated: true },
    { count: 1001, max: 1000, checked: 1000, truncated: true },
    { count: 2001, max: 2001, checked: 2001, truncated: false },
    { count: 5, max: 3, checked: 3, truncated: true },
    { count: 2, max: 0, checked: 1, truncated: true },
    { count: 5001, max: 9000, checked: 5000, truncated: true },
    { count: 0, max: undefined, checked: 0, truncated: false },
  ]) {
    it(`checks ${scenario.checked}/${scenario.count} enrollments with cap ${scenario.max ?? 'default'} and truncated=${scenario.truncated}`, async (t) => {
      const requests = installTransport(t, fixture(scenario.count))
      const report = await checkPaymentIntegrity('police', { maxEnrollments: scenario.max })
      assert.equal(report.totals.enrollmentsChecked, scenario.checked)
      assert.equal(report.truncated, scenario.truncated)
      assert.equal(report.totals.issueCount, scenario.checked)
      const ids = report.issues.map((issue) => issue.enrollmentId)
      assert.equal(new Set(ids).size, scenario.checked, 'each enrollment must be checked once')
      if (scenario.checked > 0) {
        assert.equal(Math.max(...ids), scenario.count, 'latest timestamp ties resolve by newest id')
        assert.equal(Math.min(...ids), scenario.count - scenario.checked + 1)
      }
      for (const request of requests) {
        const limit = Number(request.searchParams.get('limit'))
        assert.ok(limit >= 1 && limit <= 1000, 'page requests stay within the API row cap')
        assert.ok(request.searchParams.get('order')?.split(',').some((part) => part.startsWith('id.')), 'every page has a unique ordering key')
        if (request.pathname.endsWith('/enrollments')) {
          const normalizedCap = Math.max(1, Math.min(scenario.max ?? 2000, 5000))
          assert.ok(Number(request.searchParams.get('offset')) + limit <= normalizedCap + 1, 'reads only up to the configured cap plus one overflow probe')
        }
      }
    })
  }

  it('continues at the returned offset when the server uses a lower 400-row cap', async (t) => {
    installTransport(t, fixture(1001), { maxRows: 400 })
    const report = await checkPaymentIntegrity('police')
    assert.equal(report.totals.enrollmentsChecked, 1001)
    assert.equal(report.truncated, false)
    assert.equal(new Set(report.issues.map((issue) => issue.enrollmentId)).size, 1001)
  })

  it('checks all courses and keeps global newest ordering across 200-course chunks', async (t) => {
    const rows = fixture(0)
    rows.courses = Array.from({ length: 1001 }, (_, index) => course(index + 1))
    rows.courses.push({ ...course(2000), division: 'fire' })
    rows.enrollments = [
      { ...enrollment(10, 1), created_at: '2026-09-06T00:00:00.000Z' },
      enrollment(20, 201), enrollment(30, 1001), enrollment(40, 2000),
    ]
    const requests = installTransport(t, rows)
    const report = await checkPaymentIntegrity('police', { maxEnrollments: 2 })
    assert.equal(report.totals.coursesChecked, 1001)
    assert.equal(report.totals.enrollmentsChecked, 2)
    assert.equal(report.truncated, true)
    assert.deepEqual(report.issues.map((issue) => issue.enrollmentId), [10, 30])
    for (const request of requests) {
      const filter = request.searchParams.get('course_id')
      if (filter?.startsWith('in.(')) assert.ok(filter.slice(4, -1).split(',').length <= 200)
    }
  })

  it('preserves courseId filtering while reading multiple enrollment pages', async (t) => {
    const rows = fixture(1001)
    rows.courses.push(course(2))
    rows.enrollments.push(enrollment(2000, 2))
    installTransport(t, rows)
    const report = await checkPaymentIntegrity('police', { courseId: 1 })
    assert.equal(report.totals.coursesChecked, 1)
    assert.equal(report.totals.enrollmentsChecked, 1001)
    assert.ok(report.issues.every((issue) => issue.courseId === 1))
  })

  it('reads over 1000 billings, payments, and refunds even within one ID chunk', async (t) => {
    installTransport(t, densePaymentFixture())
    const report = await checkPaymentIntegrity('police')
    assert.equal(report.totals.billingsChecked, 1001)
    assert.equal(report.totals.paymentsChecked, 1001)
    assert.equal(report.totals.refundsChecked, 1001)
    const issue = report.issues.find((item) => item.code === 'duplicate_billing')
    assert.ok(issue)
    assert.equal(issue.paymentGrossAmount, 10010000)
    assert.equal(issue.refundAmount, 1001)
    assert.equal(issue.netAmount, 10008999)
  })

  it('returns an empty report when the division has no courses', async (t) => {
    const rows = fixture(0)
    rows.courses = []
    installTransport(t, rows)
    const report = await checkPaymentIntegrity('police')
    assert.equal(report.totals.coursesChecked, 0)
    assert.equal(report.totals.enrollmentsChecked, 0)
    assert.equal(report.truncated, false)
    assert.deepEqual(report.issues, [])
  })

  for (const scenario of [
    { name: 'retained paid amount after a partial refund', exempt: false, payable: 10000, retained: true },
    { name: 'original unpaid obligation without a fake discount', exempt: false, payable: 10000, retained: false },
    { name: 'terminated free enrollment without an active free payment', exempt: true, payable: 0, retained: false },
  ]) {
    it(`accepts a cancelled enrollment with a closed billing: ${scenario.name}`, async (t) => {
      const rows = fixture(1)
      rows.enrollments[0].status = 'cancelled'
      rows.enrollment_billing = [{
        id: 1, enrollment_id: 1, course_id: 1, expected_amount: 10000,
        discount_amount: 0, payable_amount: scenario.payable, tuition_exempt: scenario.exempt,
        status: 'closed', created_at: timestamp, updated_at: timestamp,
      }]
      if (scenario.retained) {
        rows.enrollment_payments = [{
          id: 1, enrollment_id: 1, course_id: 1, amount: 10000,
          status: 'partial_refunded', category: 'tuition', method: 'card',
          paid_date: '2026-09-05', created_at: timestamp,
        }]
        rows.enrollment_refunds = [{ id: 1, payment_id: 1, amount: 5000, refunded_at: timestamp }]
      }
      installTransport(t, rows)
      const report = await checkPaymentIntegrity('police')
      assert.deepEqual(report.issues, [])
      assert.equal(report.totals.paymentsChecked, scenario.retained ? 1 : 0)
      assert.equal(report.totals.refundsChecked, scenario.retained ? 1 : 0)
    })
  }

  it('still detects real billing and payment discrepancies on a cancelled enrollment', async (t) => {
    const rows = fixture(1)
    rows.enrollments[0].status = 'cancelled'
    rows.enrollment_billing = [{
      id: 1, enrollment_id: 1, course_id: 2, expected_amount: 10000,
      discount_amount: 0, payable_amount: 9000, tuition_exempt: false,
      status: 'closed', created_at: timestamp, updated_at: timestamp,
    }]
    rows.enrollment_payments = [{
      id: 1, enrollment_id: 1, course_id: 2, amount: 10000,
      status: 'paid', category: 'tuition', method: 'card',
      paid_date: '2026-09-05', created_at: timestamp,
    }]
    installTransport(t, rows)
    const report = await checkPaymentIntegrity('police')
    assert.deepEqual(report.issues.map((issue) => issue.code).sort(), [
      'billing_amount_mismatch', 'billing_course_mismatch', 'payment_course_mismatch',
    ])
    assert.equal(report.issues[0].paymentGrossAmount, 10000)
    assert.equal(report.issues[0].netAmount, 10000)
  })

  for (const scenario of [
    { table: 'courses', offset: 0 },
    { table: 'courses', offset: 1000 },
    { table: 'enrollments', offset: 0 },
    { table: 'enrollments', offset: 1000 },
    { table: 'enrollment_billing', offset: 0 },
    { table: 'enrollment_billing', offset: 1000 },
    { table: 'enrollment_payments', offset: 0 },
    { table: 'enrollment_payments', offset: 1000 },
    { table: 'enrollment_refunds', offset: 0 },
    { table: 'enrollment_refunds', offset: 1000 },
  ]) {
    it(`rejects the report when ${scenario.table} page at ${scenario.offset} fails`, async (t) => {
      const rows = scenario.table.startsWith('enrollment_') ? densePaymentFixture() : fixture(1001)
      if (scenario.table === 'courses') rows.courses = Array.from({ length: 1001 }, (_, index) => course(index + 1))
      installTransport(t, rows, { failTable: scenario.table, failOffset: scenario.offset })
      await assert.rejects(checkPaymentIntegrity('police'), (error: unknown) => {
        assert.equal((error as { code: string }).code, 'TEST_PAGE_FAILURE')
        return true
      })
    })
  }
})
