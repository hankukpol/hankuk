import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { describe, it } from 'node:test'

type BatchRegistration = {
  courseId: number
  textbookIds?: number[]
  billing: {
    expectedAmount: number
    discountAmount: number
    discountReason: string | null
    payableAmount: number
    tuitionExempt: boolean
    tuitionExemptReason: string | null
  }
}

type BatchPayment = {
  amount: number
  method: 'card' | 'homepage' | 'cash' | 'bank_transfer' | 'point' | 'free' | 'other'
  category?: 'tuition'
  paidAt?: string | null
  memo?: string | null
  cardCompany?: string | null
  items?: Array<{ label: string; amount: number }>
}

type RouteBody = {
  name: string
  phone: string
  birth_date: string
  student_type: 'academy'
  registrations: BatchRegistration[]
  payments?: BatchPayment[]
  exemptionPaidAt?: string
}

type CourseStub = {
  id: number
  name: string
  tuition_amount: number
  division: 'police'
  status: 'active'
  sort_order: number
  created_at: string
}

type RpcCall = {
  name: string
  args: {
    p_student_id: number
    p_registrations: Array<BatchRegistration & { payments: BatchPayment[] }>
    p_checkout_group_id: string | null
  }
}

const require = createRequire(import.meta.url)
const Module = require('node:module')
const originalLoad = Module._load

const courses = new Map<number, CourseStub>([
  [101, makeCourse(101, '헌법 기본반', 60000, 1)],
  [102, makeCourse(102, '형사법 기본반', 120000, 2)],
  [103, makeCourse(103, '경찰학 기본반', 0, 3)],
])
const state: { rpcCalls: RpcCall[]; paymentIds: number[] } = { rpcCalls: [], paymentIds: [] }

Module._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === '@/lib/api/error-response') {
    return {
      handleRouteError: async (_scope: string, message: string) => Response.json({ error: message }, { status: 500 }),
    }
  }
  if (request === '@/lib/app-feature-guard') return { requireAppFeature: async () => null }
  if (request === '@/lib/auth/actor') return { getActorStaffId: () => 77 }
  if (request === '@/lib/auth/authenticate') {
    return { authenticateAdminRequest: async () => ({ payload: { staffId: 77 }, error: null }) }
  }
  if (request === '@/lib/branch-series') {
    const option = { id: 1, group_key: 'public', label: '공채', is_active: true, is_default: true }
    return {
      listBranchSeriesOptions: async () => [option],
      resolveBranchSeriesOptionRequestFromOptions: () => ({ option, error: null }),
    }
  }
  if (request === '@/lib/cache/revalidate') return { invalidateCache: async () => undefined }
  if (request === '@/lib/class-pass-data') {
    return {
      getCourseById: async (id: number) => courses.get(id) ?? null,
      listMaterialsForCourse: async () => [],
    }
  }
  if (request === '@/lib/payments/service') {
    return {
      getPaymentServiceMessage: (_error: unknown, fallback: string) => fallback,
      getPaymentServiceStatus: () => 500,
      listPaymentsByIds: async (ids: number[]) => ids.map((id) => ({ id })),
    }
  }
  if (request === '@/lib/student-cohorts') {
    return {
      assertCohortOptionBelongsToCurrentBranch: async () => null,
      attachCohortLabelsToEnrollments: async (rows: unknown[]) => rows,
      attachCohortLabelsToStudents: async (rows: unknown[]) => rows,
      normalizeCohortNumber: (value: unknown) => (value === undefined || value === null || value === '' ? undefined : Number(value)),
      resolveStudentCohortOptionByNumber: async () => null,
    }
  }
  if (request === '@/lib/student-profiles') {
    const student = makeStudent()
    return {
      deleteStudentIfOrphaned: async () => undefined,
      ensureStudentProfile: async () => ({ student, created: true, changed: false }),
      findMatchingStudentProfile: async () => null,
      getLatestStudentEnrollmentGender: async () => '남',
      getStudentAuthProfile: () => ({ pin_ready: true }),
      getStudentProfileById: async () => null,
      initializeStudentAuth: async () => ({ student, generatedPin: null }),
      isStudentIdentityConflictError: () => false,
      syncStudentEnrollmentSnapshots: async () => undefined,
    }
  }
  if (request === '@/lib/supabase/server') return { createServerClient: () => makeDb() }
  if (request === '@/lib/tenant.server') return { getServerTenantType: async () => 'police' }
  return originalLoad.call(this, request, parent, isMain)
}

const routeModule = import('../../src/app/api/enrollments/batch/route')

describe('batch free registration route', () => {
  it('uses the explicit exemption date when no paid payment exists', async () => {
    resetState()
    const paidAt = '2026-09-01T04:20:00.000Z'
    const response = await postBatch({
      ...baseBody({ registrations: [paidRegistration(103, 0), exemptRegistration(101, 60000, '무료 체험')], payments: [] }),
      exemptionPaidAt: paidAt,
    })
    assert.equal(response.status, 201)
    assert.deepEqual(onlyRpcRegistrations()[1].payments, [canonicalFreePayment('헌법 기본반', '무료 체험', paidAt)])
  })
  it('records a free payment for an exempt course alongside a paid course', async () => {
    resetState()
    const paidAt = '2026-09-05T09:30:00.000Z'
    const response = await postBatch(baseBody({
      registrations: [exemptRegistration(101, 60000, '장학생'), paidRegistration(102, 120000)],
      payments: [{ amount: 120000, method: 'card', category: 'tuition', cardCompany: '신한', paidAt }],
    }))
    assert.equal(response.status, 201)
    const rows = onlyRpcRegistrations()
    assert.deepEqual(rows[0].payments, [canonicalFreePayment('헌법 기본반', '장학생', paidAt)])
    assert.equal(rows[1].payments[0].amount, 120000)
    assert.equal(rows[1].payments[0].method, 'card')
  })

  it('records only the exemption when a mixed bundle is registered without collection', async () => {
    resetState()
    const response = await postBatch(baseBody({
      registrations: [paidRegistration(102, 120000), exemptRegistration(101, 60000, '무료 체험')],
      payments: [],
    }))
    assert.equal(response.status, 201)
    const rows = onlyRpcRegistrations()
    assert.deepEqual(rows[0].payments, [])
    assert.deepEqual(rows[1].payments, [canonicalFreePayment('헌법 기본반', '무료 체험')])
  })

  it('passes one canonical free tuition payment to the RPC for every all-exempt registration when payments is empty', async () => {
    resetState()
    const response = await postBatch(baseBody({
      registrations: [
        exemptRegistration(101, 60000, '  장학생  '),
        exemptRegistration(102, 120000, '운영 지원'),
        exemptRegistration(103, 0, '무료 체험'),
      ],
      payments: [],
    }))

    assert.equal(response.status, 201)
    const rpcRegistrations = onlyRpcRegistrations()
    assert.deepEqual(rpcRegistrations.map((registration) => registration.payments), [
      [canonicalFreePayment('헌법 기본반', '장학생')],
      [canonicalFreePayment('형사법 기본반', '운영 지원')],
      [canonicalFreePayment('경찰학 기본반', '무료 체험')],
    ])
    assert.match(String(state.rpcCalls[0].args.p_checkout_group_id), /^[0-9a-f-]{36}$/)
  })

  it('passes canonical free tuition payments even when the request omits payments entirely', async () => {
    resetState()
    const response = await postBatch(baseBody({
      registrations: [
        exemptRegistration(101, 60000, '운영 지원'),
        exemptRegistration(102, 120000, '운영 지원'),
      ],
    }))

    assert.equal(response.status, 201)
    assert.deepEqual(
      onlyRpcRegistrations().map((registration) => registration.payments[0]),
      [canonicalFreePayment('헌법 기본반', '운영 지원'), canonicalFreePayment('형사법 기본반', '운영 지원')],
    )
  })

  it('generates one canonical free payment per exempt course when free input exists and preserves paidAt', async () => {
    resetState()
    const paidAt = '2026-09-05T09:30:00.000Z'
    const response = await postBatch(baseBody({
      registrations: [
        exemptRegistration(101, 60000, '장학생'),
        exemptRegistration(102, 120000, '장학생'),
      ],
      payments: [{ amount: 0, method: 'free', category: 'tuition', paidAt }],
    }))

    assert.equal(response.status, 201)
    assert.deepEqual(
      onlyRpcRegistrations().map((registration) => registration.payments),
      [
        [canonicalFreePayment('헌법 기본반', '장학생', paidAt)],
        [canonicalFreePayment('형사법 기본반', '장학생', paidAt)],
      ],
    )
  })

  it('deduplicates repeated free payment input into one canonical payment per exempt course', async () => {
    resetState()
    const response = await postBatch(baseBody({
      registrations: [
        exemptRegistration(101, 60000, '장학생'),
        exemptRegistration(102, 120000, '장학생'),
      ],
      payments: [
        { amount: 0, method: 'free', category: 'tuition' },
        { amount: 0, method: 'free', category: 'tuition', memo: '중복 입력' },
      ],
    }))

    assert.equal(response.status, 201)
    assert.deepEqual(
      onlyRpcRegistrations().map((registration) => registration.payments),
      [
        [canonicalFreePayment('헌법 기본반', '장학생')],
        [canonicalFreePayment('형사법 기본반', '장학생')],
      ],
    )
  })

  it('rejects all-exempt registrations with missing, point-like, discounted, or positive-card payment input', async () => {
    const cases: Array<{ name: string; body: RouteBody; expected: RegExp }> = [
      {
        name: 'missing reason',
        body: baseBody({ registrations: [exemptRegistration(101, 60000, ''), exemptRegistration(102, 120000, '장학생')] }),
        expected: /면제 사유를 입력/,
      },
      {
        name: 'point-like reason',
        body: baseBody({ registrations: [exemptRegistration(101, 60000, '포인트 사용'), exemptRegistration(102, 120000, '포인트 사용')] }),
        expected: /포인트 사용은 무료\/면제 사유가 아니라/,
      },
      {
        name: 'discount and exemption together',
        body: baseBody({
          registrations: [
            { ...exemptRegistration(101, 60000, '장학생'), billing: { ...exemptRegistration(101, 60000, '장학생').billing, discountAmount: 1000 } },
            exemptRegistration(102, 120000, '장학생'),
          ],
        }),
        expected: /할인 금액과 함께 저장할 수 없습니다/,
      },
      {
        name: 'positive card payment',
        body: baseBody({
          registrations: [exemptRegistration(101, 60000, '장학생'), exemptRegistration(102, 120000, '장학생')],
          payments: [{ amount: 1000, method: 'card', category: 'tuition', cardCompany: '신한' }],
        }),
        expected: /무료 수단과 0원 금액/,
      },
    ]

    for (const entry of cases) {
      resetState()
      const response = await postBatch(entry.body)
      const payload = await response.json()
      assert.equal(response.status, 400, entry.name)
      assert.match(String(payload.error), entry.expected, entry.name)
      assert.equal(state.rpcCalls.length, 0, entry.name)
    }
  })

  it('keeps proportional paid allocation for billable bundle registrations', async () => {
    resetState()
    const response = await postBatch(baseBody({
      registrations: [
        paidRegistration(101, 60000),
        paidRegistration(102, 120000),
      ],
      payments: [{ amount: 180000, method: 'card', category: 'tuition', cardCompany: '신한' }],
    }))

    assert.equal(response.status, 201)
    const rpcRegistrations = onlyRpcRegistrations()
    assert.deepEqual(rpcRegistrations.map((registration) => registration.payments), [
      [{ amount: 60000, method: 'card', category: 'tuition', cardCompany: '신한', depositorName: null, items: [{ label: '헌법 기본반', amount: 60000 }] }],
      [{ amount: 120000, method: 'card', category: 'tuition', cardCompany: '신한', depositorName: null, items: [{ label: '형사법 기본반', amount: 120000 }] }],
    ])
    assert.match(String(state.rpcCalls[0].args.p_checkout_group_id), /^[0-9a-f-]{36}$/)
  })
})

function makeCourse(id: number, name: string, tuitionAmount: number, sortOrder: number): CourseStub {
  return {
    id,
    name,
    tuition_amount: tuitionAmount,
    division: 'police',
    status: 'active',
    sort_order: sortOrder,
    created_at: '2026-09-05T00:00:00Z',
  }
}

function makeStudent() {
  return {
    id: 9001,
    name: '홍길동',
    phone: '01012345678',
    exam_number: null,
    gender: '남',
    photo_url: null,
    cohort_option_id: null,
  }
}

function makeDb() {
  return {
    from: () => ({
      select() { return this },
      eq() { return this },
      is() { return this },
      order: async () => ({ data: [], error: null }),
    }),
    rpc: async (name: string, args: RpcCall['args']) => {
      state.rpcCalls.push({ name, args })
      const rows = args.p_registrations.map((registration, index) => {
        const ids = registration.payments.map((_payment, paymentIndex) => 7000 + index * 10 + paymentIndex)
        state.paymentIds.push(...ids)
        return {
          result_index: index,
          enrollment_id: 8000 + index,
          course_id: registration.courseId,
          reactivated: false,
          payment_ids: ids,
          enrollment_row: {
            id: 8000 + index,
            course_id: registration.courseId,
            student_id: args.p_student_id,
            name: '홍길동',
            phone: '01012345678',
            status: 'active',
            created_at: '2026-09-05T00:00:00Z',
          },
        }
      })
      return { data: rows, error: null }
    },
  }
}

async function postBatch(body: RouteBody) {
  const { POST } = await routeModule
  return POST(new Request('http://localhost/api/enrollments/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as never)
}

function resetState() {
  state.rpcCalls = []
  state.paymentIds = []
}

function onlyRpcRegistrations() {
  assert.equal(state.rpcCalls.length, 1)
  assert.equal(state.rpcCalls[0].name, 'create_enrollment_batch_atomic')
  return state.rpcCalls[0].args.p_registrations
}

function baseBody(overrides: { registrations: BatchRegistration[]; payments?: BatchPayment[] }): RouteBody {
  return {
    name: '홍길동',
    phone: '01012345678',
    birth_date: '990101',
    student_type: 'academy',
    ...overrides,
  }
}

function exemptRegistration(courseId: number, expectedAmount: number, reason: string): BatchRegistration {
  return {
    courseId,
    billing: {
      expectedAmount,
      discountAmount: 0,
      discountReason: null,
      payableAmount: 0,
      tuitionExempt: true,
      tuitionExemptReason: reason,
    },
  }
}

function paidRegistration(courseId: number, payableAmount: number): BatchRegistration {
  return {
    courseId,
    billing: {
      expectedAmount: payableAmount,
      discountAmount: 0,
      discountReason: null,
      payableAmount,
      tuitionExempt: false,
      tuitionExemptReason: null,
    },
  }
}

function canonicalFreePayment(label: string, memo: string, paidAt: string | null = null): BatchPayment {
  return {
    amount: 0,
    method: 'free',
    category: 'tuition',
    paidAt,
    memo,
    items: [{ label, amount: 0 }],
  }
}
