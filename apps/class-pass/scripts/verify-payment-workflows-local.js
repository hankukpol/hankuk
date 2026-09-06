const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { createClient } = require('@supabase/supabase-js')

const ROOT = process.cwd()
const ENV_PATH = path.join(ROOT, '.env.local')
const BASE_URL = process.env.PAYMENT_TEST_BASE_URL || 'http://127.0.0.1:3001'

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return

  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const match = trimmed.match(/^([^=]+)=(.*)$/)
    if (!match) continue
    const key = match[1].trim()
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function assertLocalSupabase(url) {
  assert(url, 'NEXT_PUBLIC_SUPABASE_URL is missing.')
  const parsed = new URL(url)
  const isLocalHost = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost'
  assert(isLocalHost, `Refusing to run payment workflow verification against non-local Supabase: ${parsed.origin}`)
}

function setCookieHeader(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers
      .getSetCookie()
      .map((entry) => entry.split(';')[0])
      .filter(Boolean)
      .join('; ')
  }

  const raw = response.headers.get('set-cookie') || ''
  return raw
    .split(/,(?=[^;,]+=)/)
    .map((entry) => entry.split(';')[0])
    .filter(Boolean)
    .join('; ')
}

function paymentPayload(method, amount, overrides = {}) {
  const payload = {
    amount,
    method,
    category: overrides.category || 'tuition',
    memo: overrides.memo || null,
    items: overrides.items || [{ label: overrides.label || '수강료', amount }],
  }

  if (method === 'card') {
    payload.cardLast4 = overrides.cardLast4 || '1234'
    payload.cardCompany = overrides.cardCompany || 'KB'
    payload.installmentMonths = overrides.installmentMonths || 0
  }
  if (method === 'bank_transfer') {
    payload.bankName = overrides.bankName || '국민은행'
    payload.bankAccountLast4 = overrides.bankAccountLast4 || '9876'
    payload.depositorName = overrides.depositorName || overrides.bankAccountLast4 || 'Codex Depositor'
  }
  if (method === 'cash' && overrides.cashReceiptApprovalNo) {
    payload.cashReceiptApprovalNo = overrides.cashReceiptApprovalNo
  }

  return payload
}

function freePaymentPayload() {
  return {
    amount: 0,
    method: 'free',
    category: 'tuition',
    memo: '무료 수강 테스트',
    items: [{ label: '무료 수강', amount: 0 }],
  }
}

async function main() {
  loadEnv(ENV_PATH)
  assertLocalSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL)
  assert(process.env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY is missing.')

  const division = process.env.PAYMENT_TEST_DIVISION || process.env.NEXT_PUBLIC_TENANT_TYPE || 'police'
  const runId = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      db: { schema: 'class_pass' },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  )

  const scenarioResults = []
  const createdEnrollments = []
  const stressCount = Number(process.env.PAYMENT_TEST_STRESS_COUNT || 0)

  function pass(name, details = '') {
    scenarioResults.push({ name, status: 'PASS', details })
    console.log(`PASS ${name}${details ? ` - ${details}` : ''}`)
  }

  async function api(pathname, options = {}) {
    const headers = {
      Origin: BASE_URL,
      Referer: `${BASE_URL}/${division}/dashboard`,
      'x-hankuk-division': division,
      Cookie: options.cookie,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    }

    const response = await fetch(`${BASE_URL}${pathname}`, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      redirect: 'manual',
    })
    const text = await response.text()
    let json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = { raw: text }
    }

    if (!options.expect?.includes(response.status)) {
      throw new Error(`${options.method || 'GET'} ${pathname} returned ${response.status}: ${text}`)
    }

    return { status: response.status, json, headers: response.headers }
  }

  async function setupAuth() {
    const branchResult = await db
      .from('branches')
      .upsert({
        slug: division,
        name: `Codex ${division}`,
        track_type: division.includes('fire') ? 'fire' : 'police',
        is_active: true,
      }, { onConflict: 'slug' })
      .select('*')
      .single()
    if (branchResult.error) throw branchResult.error

    const accountResult = await db
      .from('operator_accounts')
      .upsert({
        login_id: `codex-payments-${division}`,
        display_name: 'Codex Payment Verifier',
        is_active: true,
      }, { onConflict: 'login_id' })
      .select('*')
      .single()
    if (accountResult.error) throw accountResult.error

    const membershipResult = await db
      .from('operator_memberships')
      .upsert({
        operator_account_id: accountResult.data.id,
        role: 'BRANCH_ADMIN',
        branch_id: branchResult.data.id,
        is_active: true,
      }, { onConflict: 'operator_account_id,role,branch_id' })
      .select('*')
      .single()
    if (membershipResult.error) throw membershipResult.error

    const form = new FormData()
    form.set('accountId', String(accountResult.data.id))
    form.set('membershipId', String(membershipResult.data.id))

    const response = await fetch(`${BASE_URL}/api/auth/admin/dev-login`, {
      method: 'POST',
      body: form,
      redirect: 'manual',
    })
    if (response.status !== 303) {
      throw new Error(`dev-login failed with ${response.status}: ${await response.text()}`)
    }

    const cookie = setCookieHeader(response)
    assert(cookie.includes(`cp_admin__${division}=`), 'Branch admin session cookie was not set.')
    return cookie
  }

  async function setupCourse(suffix = '', tuitionAmount = 100000) {
    const slug = suffix
      ? `codex-payment-workflow-${suffix}-${runId}`
      : `codex-payment-workflow-${runId}`
    const courseResult = await db
      .from('courses')
      .insert({
        division,
        name: `Codex 수납 워크플로 ${runId}`,
        slug,
        course_type: 'lecture',
        status: 'active',
        tuition_amount: tuitionAmount,
      })
      .select('*')
      .single()
    if (courseResult.error) throw courseResult.error
    return courseResult.data
  }

  async function createEnrollment(cookie, course, index, payments, billingOverrides = {}, expect = [201], overrides = {}) {
    const payableAmount = billingOverrides.payableAmount ?? payments
      .filter((payment) => payment.category === 'tuition')
      .reduce((sum, payment) => sum + payment.amount, 0)
    const expectedAmount = billingOverrides.expectedAmount ?? Math.max(payableAmount, 100000)
    const body = {
      courseId: course.id,
      name: `CP테스트${runId}-${String(index).padStart(2, '0')}`,
      phone: `010${runId.slice(-4)}${String(index).padStart(4, '0')}`,
      exam_number: `CP${runId}${String(index).padStart(2, '0')}`,
      gender: 'M',
      region: '서울',
      series: '공채',
      birth_date: '990101',
      billing: {
        expectedAmount,
        discountAmount: billingOverrides.discountAmount || 0,
        discountReason: billingOverrides.discountReason || null,
        payableAmount,
        tuitionExempt: billingOverrides.tuitionExempt || false,
        tuitionExemptReason: billingOverrides.tuitionExemptReason || null,
      },
      payments,
    }

    if (overrides.studentId) body.studentId = overrides.studentId
    if (overrides.updateSelectedStudent !== undefined) body.updateSelectedStudent = overrides.updateSelectedStudent
    if (overrides.name) body.name = overrides.name
    if (overrides.phone) body.phone = overrides.phone
    if (overrides.exam_number) body.exam_number = overrides.exam_number

    const result = await api('/api/enrollments', {
      method: 'POST',
      cookie,
      expect,
      body,
    })

    const enrollment = result.json?.enrollment
    if (enrollment?.id) {
      createdEnrollments.push(enrollment.id)
    }
    return { result, enrollment, requestBody: body }
  }

  async function loadEnrollmentState(enrollmentId) {
    const [enrollmentResult, billingResult, paymentsResult] = await Promise.all([
      db.from('enrollments').select('*').eq('id', enrollmentId).single(),
      db.from('enrollment_billing').select('*').eq('enrollment_id', enrollmentId).maybeSingle(),
      db
        .from('enrollment_payments')
        .select('*, enrollment_payment_items(*), enrollment_refunds(*)')
        .eq('enrollment_id', enrollmentId)
        .order('id', { ascending: true }),
    ])

    if (enrollmentResult.error) throw enrollmentResult.error
    if (billingResult.error) throw billingResult.error
    if (paymentsResult.error) throw paymentsResult.error

    return {
      enrollment: enrollmentResult.data,
      billing: billingResult.data,
      payments: paymentsResult.data || [],
    }
  }

  function netTuition(payments) {
    return netByCategory(payments, 'tuition')
  }

  function netByCategory(payments, category) {
    return payments
      .filter((payment) => payment.category === category && payment.status !== 'voided')
      .reduce((sum, payment) => {
        const refunds = payment.enrollment_refunds || []
        return sum + payment.amount - refunds.reduce((refundSum, refund) => refundSum + refund.amount, 0)
      }, 0)
  }

  async function assertEnrollmentState(enrollmentId, expected) {
    const state = await loadEnrollmentState(enrollmentId)
    if (expected.paymentCount !== undefined) {
      assert(state.payments.length === expected.paymentCount, `Expected ${expected.paymentCount} payments, got ${state.payments.length}`)
    }
    if (expected.billingStatus) {
      assert(state.billing?.status === expected.billingStatus, `Expected billing ${expected.billingStatus}, got ${state.billing?.status}`)
    }
    if (expected.enrollmentStatus) {
      assert(state.enrollment.status === expected.enrollmentStatus, `Expected enrollment ${expected.enrollmentStatus}, got ${state.enrollment.status}`)
    }
    if (expected.netTuition !== undefined) {
      assert(netTuition(state.payments) === expected.netTuition, `Expected net tuition ${expected.netTuition}, got ${netTuition(state.payments)}`)
    }
    if (expected.methods) {
      const methods = state.payments.map((payment) => payment.method)
      assert(
        expected.methods.every((method) => methods.includes(method)),
        `Expected methods ${expected.methods.join(',')}, got ${methods.join(',')}`,
      )
    }
    return state
  }

  async function refundPayment(cookie, paymentId, body, expect = [201]) {
    // 환불 API는 재시도 중복을 막기 위해 요청마다 고유 requestId(UUID)를 요구한다.
    return api(`/api/payments/${paymentId}/refunds`, {
      method: 'POST',
      cookie,
      expect,
      body: { requestId: randomUUID(), ...body },
    })
  }

  // 관리자 화면이 실제로 쓰는 경로. 수강 종료 여부를 환불과 함께 명시한다.
  async function refundBundle(cookie, refunds, { endEnrollment = false } = {}, expect = [201]) {
    return api('/api/payments/refunds', {
      method: 'POST',
      cookie,
      expect,
      body: { requestId: randomUUID(), endEnrollment, refunds },
    })
  }

  async function voidPayment(cookie, paymentId, expect = [200]) {
    return api(`/api/payments/${paymentId}/void`, {
      method: 'POST',
      cookie,
      expect,
    })
  }

  async function confirmPaymentEntry(cookie, payment) {
    return api('/api/settlements/entry-confirmation', {
      method: 'POST',
      cookie,
      expect: [200],
      body: {
        date: payment.paid_date,
        kind: 'payment',
        paymentId: payment.id,
        action: 'confirm',
      },
    })
  }

  async function settlementDetails(cookie, from, to) {
    const params = new URLSearchParams({ from, to, limit: '10000' })
    const result = await api(`/api/payments/settlement/details?${params.toString()}`, {
      method: 'GET',
      cookie,
      expect: [200],
    })
    return result.json?.payments || []
  }

  async function run() {
    const cookie = await setupAuth()
    const course = await setupCourse()
    const transferCourse = await setupCourse('transfer', 120000)

    const fullPayMethods = ['cash', 'bank_transfer', 'card', 'point']
    for (let i = 0; i < fullPayMethods.length; i += 1) {
      const method = fullPayMethods[i]
      const { enrollment } = await createEnrollment(cookie, course, i + 1, [
        paymentPayload(method, 100000, { memo: `${method} 단일 수납` }),
      ])
      await assertEnrollmentState(enrollment.id, {
        paymentCount: 1,
        billingStatus: 'paid',
        enrollmentStatus: 'active',
        netTuition: 100000,
        methods: [method],
      })
      pass(`${i + 1}. ${method} 단일 수납`)
    }

    const splitCases = [
      ['cash', 40000, 'card', 60000],
      ['bank_transfer', 70000, 'cash', 30000],
      ['point', 25000, 'card', 75000],
      ['cash', 30000, 'bank_transfer', 30000, 'card', 40000],
      ['point', 10000, 'cash', 20000, 'bank_transfer', 70000],
      ['card', 50000, 'card', 50000],
    ]
    for (let i = 0; i < splitCases.length; i += 1) {
      const raw = splitCases[i]
      const payments = []
      for (let j = 0; j < raw.length; j += 2) {
        payments.push(paymentPayload(raw[j], raw[j + 1], { memo: `이중 결제 ${i + 1}` }))
      }
      const { enrollment } = await createEnrollment(cookie, course, i + 5, payments)
      await assertEnrollmentState(enrollment.id, {
        paymentCount: payments.length,
        billingStatus: 'paid',
        enrollmentStatus: 'active',
        netTuition: 100000,
        methods: payments.map((payment) => payment.method),
      })
      pass(`${i + 5}. 이중/복합 수납 ${payments.map((payment) => payment.method).join('+')}`)
    }

    for (let i = 0; i < 4; i += 1) {
      const method = fullPayMethods[i]
      const { enrollment } = await createEnrollment(cookie, course, i + 11, [
        paymentPayload(method, 85000, { memo: '할인 수납' }),
      ], {
        expectedAmount: 100000,
        discountAmount: 15000,
        discountReason: '로컬 검증 할인',
        payableAmount: 85000,
      })
      await assertEnrollmentState(enrollment.id, {
        paymentCount: 1,
        billingStatus: 'paid',
        enrollmentStatus: 'active',
        netTuition: 85000,
        methods: [method],
      })
      pass(`${i + 11}. 할인 후 ${method} 수납`)
    }

    const delayed = await createEnrollment(cookie, course, 15, [], {
      expectedAmount: 100000,
      payableAmount: 100000,
    })
    await assertEnrollmentState(delayed.enrollment.id, {
      paymentCount: 0,
      billingStatus: 'unpaid',
      enrollmentStatus: 'active',
      netTuition: 0,
    })
    await api('/api/payments', {
      method: 'POST',
      cookie,
      expect: [201],
      body: {
        requestId: randomUUID(),
        enrollmentId: delayed.enrollment.id,
        courseId: course.id,
        ...paymentPayload('card', 100000, { memo: '등록 후 수납', cardLast4: '4444' }),
      },
    })
    await assertEnrollmentState(delayed.enrollment.id, {
      paymentCount: 1,
      billingStatus: 'paid',
      enrollmentStatus: 'active',
      netTuition: 100000,
      methods: ['card'],
    })
    pass('15. 등록 후 후수납')

    for (let i = 0; i < 3; i += 1) {
      const { enrollment } = await createEnrollment(cookie, course, i + 16, [
        paymentPayload('cash', 100000),
      ])
      await api('/api/payments', {
        method: 'POST',
        cookie,
        expect: [201],
        body: {
          enrollmentId: enrollment.id,
          courseId: course.id,
          ...paymentPayload(i === 0 ? 'cash' : i === 1 ? 'bank_transfer' : 'point', 15000, {
            category: i === 0 ? 'textbook' : i === 1 ? 'material' : 'exam_fee',
            label: i === 0 ? '교재비' : i === 1 ? '자료비' : '응시료',
          }),
        },
      })
      const state = await assertEnrollmentState(enrollment.id, {
        paymentCount: 2,
        billingStatus: 'paid',
        enrollmentStatus: 'active',
        netTuition: 100000,
      })
      assert(state.payments.some((payment) => payment.category !== 'tuition'), 'Expected non-tuition payment.')
      pass(`${i + 16}. 수강료 결제 후 부가 항목 수납`)
    }

    const partialRefund = await createEnrollment(cookie, course, 19, [
      paymentPayload('cash', 100000),
    ])
    let state = await assertEnrollmentState(partialRefund.enrollment.id, { paymentCount: 1, billingStatus: 'paid' })
    await refundPayment(cookie, state.payments[0].id, {
      amount: 40000,
      method: 'cash',
      reasonCategory: 'change_of_mind',
      reason: '부분 환불 검증',
    })
    await assertEnrollmentState(partialRefund.enrollment.id, {
      paymentCount: 1,
      billingStatus: 'partial',
      enrollmentStatus: 'active',
      netTuition: 60000,
    })
    pass('19. 부분 환불')

    const correctionCase = await createEnrollment(cookie, course, 191, [
      paymentPayload('card', 100000, { cardLast4: '3333', cardCompany: 'NH' }),
    ])
    state = await assertEnrollmentState(correctionCase.enrollment.id, { paymentCount: 1, billingStatus: 'paid' })
    const correctionTarget = state.payments[0]
    await api('/api/payments/corrections', {
      method: 'POST',
      cookie,
      expect: [201],
      body: {
        requestId: randomUUID(),
        enrollmentId: correctionCase.enrollment.id,
        courseId: course.id,
        refund: {
          paymentId: correctionTarget.id,
          amount: 30000,
          method: 'card_cancel',
          cancelReceiptNo: `CORR-${runId}`,
          reasonCategory: 'payment_correction',
          reason: 'payment correction verification',
        },
        payment: {
          ...paymentPayload('bank_transfer', 30000, {
            bankName: 'Correction Bank',
            bankAccountLast4: '1357',
            memo: 'payment correction repayment',
          }),
          depositorName: 'Correction Depositor',
        },
        tuitionBillingMode: 'keep',
      },
    })
    state = await assertEnrollmentState(correctionCase.enrollment.id, {
      paymentCount: 2,
      billingStatus: 'paid',
      enrollmentStatus: 'active',
      netTuition: 100000,
    })
    const correctedOriginal = state.payments.find((payment) => payment.id === correctionTarget.id)
    const correctionPayment = state.payments.find((payment) => payment.id !== correctionTarget.id)
    assert(correctedOriginal?.status === 'partial_refunded', 'Expected corrected original payment to be partially refunded.')
    assert(correctionPayment?.method === 'bank_transfer', 'Expected correction repayment to be bank transfer.')
    assert(correctionPayment?.depositor_name === 'Correction Depositor', 'Expected correction depositor name to be stored.')
    assert(
      (correctedOriginal?.enrollment_refunds || []).some((refund) => (
        refund.reason_category === 'payment_correction' && refund.amount === 30000
      )),
      'Expected correction refund reason and amount to be stored.',
    )
    pass('19A. 결제 정정')

    const fullRefund = await createEnrollment(cookie, course, 20, [
      paymentPayload('card', 100000, { cardLast4: '2222' }),
    ])
    state = await assertEnrollmentState(fullRefund.enrollment.id, { paymentCount: 1, billingStatus: 'paid' })
    await refundPayment(cookie, state.payments[0].id, {
      amount: 100000,
      method: 'card_cancel',
      cancelReceiptNo: `CANCEL-${runId}`,
      reasonCategory: 'withdrawal',
      reason: '전액 환불 검증',
    })
    // 수납 상태와 수강 상태는 분리한다. 환불만으로 수강이 종료되지 않는다.
    await assertEnrollmentState(fullRefund.enrollment.id, {
      paymentCount: 1,
      billingStatus: 'refunded',
      enrollmentStatus: 'active',
      netTuition: 0,
    })
    pass('20. 카드 전액 환불 (수강 상태 유지)')

    const splitRefund = await createEnrollment(cookie, course, 21, [
      paymentPayload('cash', 40000),
      paymentPayload('bank_transfer', 60000),
    ])
    state = await assertEnrollmentState(splitRefund.enrollment.id, { paymentCount: 2, billingStatus: 'paid' })
    await api('/api/payments/refunds', {
      method: 'POST',
      cookie,
      expect: [201],
      body: {
        requestId: randomUUID(),
        refunds: state.payments.map((payment) => ({
          paymentId: payment.id,
          amount: payment.amount,
          method: payment.method === 'bank_transfer' ? 'bank_transfer' : 'cash',
          refundAccountLast4: payment.method === 'bank_transfer' ? '4321' : null,
          reasonCategory: 'withdrawal',
          reason: '묶음 환불 검증',
        })),
      },
    })
    await assertEnrollmentState(splitRefund.enrollment.id, {
      paymentCount: 2,
      billingStatus: 'refunded',
      enrollmentStatus: 'active',
      netTuition: 0,
    })
    pass('21. 이중 결제 묶음 환불')

    const voidCase = await createEnrollment(cookie, course, 22, [
      paymentPayload('cash', 100000),
    ])
    await api('/api/payments', {
      method: 'POST',
      cookie,
      expect: [201],
      body: {
        requestId: randomUUID(),
        enrollmentId: voidCase.enrollment.id,
        courseId: course.id,
        ...paymentPayload('cash', 20000, { category: 'textbook', label: '교재비' }),
      },
    })
    state = await assertEnrollmentState(voidCase.enrollment.id, { paymentCount: 2, billingStatus: 'paid' })
    const textbookPayment = state.payments.find((payment) => payment.category === 'textbook')
    await voidPayment(cookie, textbookPayment.id)
    state = await assertEnrollmentState(voidCase.enrollment.id, {
      paymentCount: 2,
      billingStatus: 'paid',
      enrollmentStatus: 'active',
      netTuition: 100000,
    })
    assert(state.payments.find((payment) => payment.id === textbookPayment.id)?.status === 'voided', 'Expected textbook payment to be voided.')
    pass('22. 부가 항목 결제 취소')

    const tuitionVoid = await createEnrollment(cookie, course, 23, [
      paymentPayload('bank_transfer', 100000),
    ])
    state = await assertEnrollmentState(tuitionVoid.enrollment.id, { paymentCount: 1, billingStatus: 'paid' })
    await voidPayment(cookie, state.payments[0].id)
    state = await assertEnrollmentState(tuitionVoid.enrollment.id, {
      paymentCount: 1,
      billingStatus: 'unpaid',
      enrollmentStatus: 'active',
      netTuition: 0,
    })
    assert(state.payments[0].status === 'voided', 'Expected tuition payment to be voided.')
    pass('23. 수강료 결제 취소 후 미납 전환')

    const invalidVoid = await createEnrollment(cookie, course, 24, [
      paymentPayload('cash', 100000),
    ])
    state = await assertEnrollmentState(invalidVoid.enrollment.id, { paymentCount: 1, billingStatus: 'paid' })
    await refundPayment(cookie, state.payments[0].id, {
      amount: 10000,
      method: 'cash',
      reasonCategory: 'other',
    })
    await voidPayment(cookie, state.payments[0].id, [400])
    pass('24. 환불 이력 있는 결제 취소 차단')

    const overRefund = await createEnrollment(cookie, course, 25, [
      paymentPayload('point', 100000),
    ])
    state = await assertEnrollmentState(overRefund.enrollment.id, { paymentCount: 1, billingStatus: 'paid' })
    await refundPayment(cookie, state.payments[0].id, {
      amount: 100001,
      method: 'point',
      reasonCategory: 'other',
    }, [400])
    pass('25. 결제금액 초과 환불 차단')

    const missingBankAccount = await createEnrollment(cookie, course, 26, [
      paymentPayload('bank_transfer', 100000),
    ])
    state = await assertEnrollmentState(missingBankAccount.enrollment.id, { paymentCount: 1, billingStatus: 'paid' })
    await refundPayment(cookie, state.payments[0].id, {
      amount: 10000,
      method: 'bank_transfer',
      reasonCategory: 'other',
    }, [400])
    pass('26. 계좌 환불 계좌 뒷자리 누락 차단')

    const missingCardReceipt = await createEnrollment(cookie, course, 27, [
      paymentPayload('card', 100000),
    ])
    state = await assertEnrollmentState(missingCardReceipt.enrollment.id, { paymentCount: 1, billingStatus: 'paid' })
    await refundPayment(cookie, state.payments[0].id, {
      amount: 10000,
      method: 'card_cancel',
      reasonCategory: 'other',
    }, [400])
    pass('27. 카드 취소 승인번호 누락 차단')

    const reRegister = await createEnrollment(cookie, course, 28, [
      paymentPayload('cash', 100000),
    ])
    state = await assertEnrollmentState(reRegister.enrollment.id, { paymentCount: 1, billingStatus: 'paid' })
    await refundPayment(cookie, state.payments[0].id, {
      amount: 100000,
      method: 'cash',
      reasonCategory: 'withdrawal',
      reason: '재등록 전 환불',
    })
    await api(`/api/enrollments/${reRegister.enrollment.id}/refund`, {
      method: 'POST',
      cookie,
      expect: [200],
    })
    // 수강 환불 API를 명시적으로 호출한 경우에만 수강 상태가 refunded로 바뀐다.
    await assertEnrollmentState(reRegister.enrollment.id, {
      paymentCount: 1,
      billingStatus: 'refunded',
      enrollmentStatus: 'refunded',
      netTuition: 0,
    })
    const retry = await api('/api/enrollments', {
      method: 'POST',
      cookie,
      expect: [200],
      body: {
        ...reRegister.requestBody,
        payments: [paymentPayload('card', 100000, { cardLast4: '7777', memo: '재등록 수납' })],
      },
    })
    assert(retry.json?.reactivated === true, 'Expected refunded enrollment to be reactivated.')
    await assertEnrollmentState(reRegister.enrollment.id, {
      paymentCount: 2,
      billingStatus: 'paid',
      enrollmentStatus: 'active',
      netTuition: 100000,
    })
    pass('28. 환불 완료 후 재등록')

    const freeCase = await createEnrollment(cookie, course, 29, [
      freePaymentPayload(),
    ], {
      expectedAmount: 100000,
      discountAmount: 0,
      payableAmount: 0,
      tuitionExempt: true,
      tuitionExemptReason: '장학 처리',
    })
    state = await assertEnrollmentState(freeCase.enrollment.id, {
      paymentCount: 1,
      billingStatus: 'exempt',
      enrollmentStatus: 'active',
      netTuition: 0,
      methods: ['free'],
    })
    assert(state.payments[0].amount === 0, 'Expected free payment amount 0.')
    pass('29. 무료 수강/수납 면제')

    await voidPayment(cookie, state.payments[0].id)
    state = await assertEnrollmentState(freeCase.enrollment.id, {
      paymentCount: 1,
      billingStatus: 'unpaid',
      enrollmentStatus: 'active',
      netTuition: 0,
    })
    assert(state.payments[0].status === 'voided', 'Expected free payment to be voided.')
    assert(state.billing?.tuition_exempt === false, 'Expected voided free payment to clear tuition exemption.')
    assert(state.billing?.payable_amount === 100000, `Expected payable amount 100000 after free payment void, got ${state.billing?.payable_amount}`)

    await api('/api/payments/batch', {
      method: 'POST',
      cookie,
      expect: [201],
      body: {
        requestId: randomUUID(),
        enrollmentId: freeCase.enrollment.id,
        courseId: course.id,
        billing: {
          expectedAmount: 100000,
          discountAmount: 0,
          discountReason: null,
          payableAmount: 100000,
          tuitionExempt: false,
          tuitionExemptReason: null,
        },
        payments: [paymentPayload('cash', 100000, { memo: '무료 취소 후 재수납' })],
      },
    })
    await assertEnrollmentState(freeCase.enrollment.id, {
      paymentCount: 2,
      billingStatus: 'paid',
      enrollmentStatus: 'active',
      netTuition: 100000,
    })
    pass('29A. 무료/면제 수납 취소 후 재수납')

    const cashReceipt = await createEnrollment(cookie, course, 30, [
      paymentPayload('cash', 100000, { cashReceiptApprovalNo: `CR-${runId}` }),
    ])
    state = await assertEnrollmentState(cashReceipt.enrollment.id, {
      paymentCount: 1,
      billingStatus: 'paid',
      enrollmentStatus: 'active',
      netTuition: 100000,
      methods: ['cash'],
    })
    assert(state.payments[0].cash_receipt_approval_no === `CR-${runId}`, 'Expected cash receipt approval number to be stored.')
    pass('30. 현금영수증 승인번호 수기 저장')

    const homepagePayment = await createEnrollment(cookie, course, 31, [
      paymentPayload('homepage', 100000, { memo: 'homepage 단일 수납' }),
    ])
    await assertEnrollmentState(homepagePayment.enrollment.id, {
      paymentCount: 1,
      billingStatus: 'paid',
      enrollmentStatus: 'active',
      netTuition: 100000,
      methods: ['homepage'],
    })
    pass('31. 홈페이지 결제 단일 수납')

    const zeroCourseResult = await db
      .from('courses')
      .insert({
        division,
        name: `Codex 0원 강좌 ${runId}`,
        slug: `codex-zero-payment-workflow-${runId}`,
        course_type: 'lecture',
        status: 'active',
        tuition_amount: 0,
      })
      .select('*')
      .single()
    if (zeroCourseResult.error) throw zeroCourseResult.error

    const zeroCourseEnrollment = await createEnrollment(cookie, zeroCourseResult.data, 32, [], {
      expectedAmount: 0,
      discountAmount: 0,
      payableAmount: 0,
      tuitionExempt: false,
      tuitionExemptReason: null,
    })
    await assertEnrollmentState(zeroCourseEnrollment.enrollment.id, {
      paymentCount: 0,
      billingStatus: 'paid',
      enrollmentStatus: 'active',
      netTuition: 0,
    })
    pass('32. 비면제 0원 강좌 결제내역 없이 등록')

    const reCourseAfterRefund = await createEnrollment(cookie, course, 33, [
      paymentPayload('cash', 100000),
    ])
    state = await assertEnrollmentState(reCourseAfterRefund.enrollment.id, { paymentCount: 1, billingStatus: 'paid' })
    await refundPayment(cookie, state.payments[0].id, {
      amount: 100000,
      method: 'cash',
      reasonCategory: 'withdrawal',
      reason: 'full refund before another course',
    })
    await assertEnrollmentState(reCourseAfterRefund.enrollment.id, {
      paymentCount: 1,
      billingStatus: 'refunded',
      enrollmentStatus: 'active',
      netTuition: 0,
    })
    const sameStudentOtherCourse = await createEnrollment(
      cookie,
      transferCourse,
      331,
      [paymentPayload('card', 120000, { cardLast4: '3310', cardCompany: 'SINHAN' })],
      { expectedAmount: 120000, payableAmount: 120000 },
      [201],
      {
        studentId: reCourseAfterRefund.enrollment.student_id,
        name: reCourseAfterRefund.requestBody.name,
        phone: reCourseAfterRefund.requestBody.phone,
        exam_number: reCourseAfterRefund.requestBody.exam_number,
      },
    )
    assert(sameStudentOtherCourse.enrollment.id !== reCourseAfterRefund.enrollment.id, 'Expected a new enrollment for another course.')
    assert(sameStudentOtherCourse.enrollment.student_id === reCourseAfterRefund.enrollment.student_id, 'Expected same student profile for another course.')
    await assertEnrollmentState(sameStudentOtherCourse.enrollment.id, {
      paymentCount: 1,
      billingStatus: 'paid',
      enrollmentStatus: 'active',
      netTuition: 120000,
    })
    pass('33. refund then same student other course')

    const partialTransfer = await createEnrollment(cookie, course, 34, [
      paymentPayload('cash', 100000),
    ])
    state = await assertEnrollmentState(partialTransfer.enrollment.id, { paymentCount: 1, billingStatus: 'paid' })
    await refundPayment(cookie, state.payments[0].id, {
      amount: 40000,
      method: 'cash',
      reasonCategory: 'transfer',
      reason: 'partial refund before course transfer',
    })
    await assertEnrollmentState(partialTransfer.enrollment.id, {
      paymentCount: 1,
      billingStatus: 'partial',
      enrollmentStatus: 'active',
      netTuition: 60000,
    })
    const partialTransferNewCourse = await createEnrollment(
      cookie,
      transferCourse,
      341,
      [paymentPayload('bank_transfer', 120000, { depositorName: 'Transfer Student' })],
      { expectedAmount: 120000, payableAmount: 120000 },
      [201],
      {
        studentId: partialTransfer.enrollment.student_id,
        name: partialTransfer.requestBody.name,
        phone: partialTransfer.requestBody.phone,
        exam_number: partialTransfer.requestBody.exam_number,
      },
    )
    await assertEnrollmentState(partialTransferNewCourse.enrollment.id, {
      paymentCount: 1,
      billingStatus: 'paid',
      enrollmentStatus: 'active',
      netTuition: 120000,
    })
    pass('34. partial refund then other course registration')

    const addonRemain = await createEnrollment(cookie, course, 35, [
      paymentPayload('cash', 100000),
    ])
    await api('/api/payments', {
      method: 'POST',
      cookie,
      expect: [201],
      body: {
        requestId: randomUUID(),
        enrollmentId: addonRemain.enrollment.id,
        courseId: course.id,
        ...paymentPayload('cash', 30000, { category: 'textbook', label: 'textbook' }),
      },
    })
    state = await assertEnrollmentState(addonRemain.enrollment.id, { paymentCount: 2, billingStatus: 'paid' })
    const addonTuitionPayment = state.payments.find((payment) => payment.category === 'tuition')
    await refundPayment(cookie, addonTuitionPayment.id, {
      amount: 100000,
      method: 'cash',
      reasonCategory: 'withdrawal',
      reason: 'tuition refunded with textbook remaining',
    })
    state = await assertEnrollmentState(addonRemain.enrollment.id, {
      paymentCount: 2,
      billingStatus: 'refunded',
      enrollmentStatus: 'active',
      netTuition: 0,
    })
    assert(netByCategory(state.payments, 'textbook') === 30000, `Expected textbook net 30000, got ${netByCategory(state.payments, 'textbook')}`)
    pass('35. tuition refund with addon remaining')

    const confirmedRefundCase = await createEnrollment(cookie, course, 36, [
      paymentPayload('card', 100000, { cardLast4: '3636', cardCompany: 'HYUNDAI' }),
    ])
    state = await assertEnrollmentState(confirmedRefundCase.enrollment.id, { paymentCount: 1, billingStatus: 'paid' })
    const confirmedPayment = state.payments[0]
    await confirmPaymentEntry(cookie, confirmedPayment)
    await refundPayment(cookie, confirmedPayment.id, {
      amount: 20000,
      method: 'card_cancel',
      cancelReceiptNo: `CONF-R-${runId}`,
      reasonCategory: 'payment_correction',
      reason: 'refund after settlement confirmation',
    })
    state = await assertEnrollmentState(confirmedRefundCase.enrollment.id, {
      paymentCount: 1,
      billingStatus: 'partial',
      enrollmentStatus: 'active',
      netTuition: 80000,
    })
    let settlementPayments = await settlementDetails(cookie, confirmedPayment.paid_date, confirmedPayment.paid_date)
    let settledPayment = settlementPayments.find((payment) => payment.id === confirmedPayment.id)
    assert(settledPayment?.settlement_confirmation?.status === 'confirmed', 'Expected confirmed payment settlement entry to remain confirmed after refund.')
    assert(
      (settledPayment?.enrollment_refunds || []).some((refund) => (
        refund.amount === 20000 && !refund.settlement_confirmation
      )),
      'Expected refund after settlement confirmation to appear as an unconfirmed refund row.',
    )

    const confirmedCorrectionCase = await createEnrollment(cookie, course, 361, [
      paymentPayload('card', 100000, { cardLast4: '3661', cardCompany: 'SAMSUNG' }),
    ])
    state = await assertEnrollmentState(confirmedCorrectionCase.enrollment.id, { paymentCount: 1, billingStatus: 'paid' })
    const confirmedCorrectionPayment = state.payments[0]
    await confirmPaymentEntry(cookie, confirmedCorrectionPayment)
    await api('/api/payments/corrections', {
      method: 'POST',
      cookie,
      expect: [201],
      body: {
        requestId: randomUUID(),
        enrollmentId: confirmedCorrectionCase.enrollment.id,
        courseId: course.id,
        refund: {
          paymentId: confirmedCorrectionPayment.id,
          amount: 30000,
          method: 'card_cancel',
          cancelReceiptNo: `CONF-C-${runId}`,
          reasonCategory: 'payment_correction',
          reason: 'correction after settlement confirmation',
        },
        payment: paymentPayload('bank_transfer', 30000, {
          bankName: 'Confirmed Correction Bank',
          bankAccountLast4: '3631',
          depositorName: 'Confirmed Correction',
          memo: 'correction after settlement confirmation',
        }),
        tuitionBillingMode: 'keep',
      },
    })
    state = await assertEnrollmentState(confirmedCorrectionCase.enrollment.id, {
      paymentCount: 2,
      billingStatus: 'paid',
      enrollmentStatus: 'active',
      netTuition: 100000,
    })
    settlementPayments = await settlementDetails(cookie, confirmedCorrectionPayment.paid_date, confirmedCorrectionPayment.paid_date)
    settledPayment = settlementPayments.find((payment) => payment.id === confirmedCorrectionPayment.id)
    const correctionRepayment = state.payments.find((payment) => payment.id !== confirmedCorrectionPayment.id)
    const settledRepayment = settlementPayments.find((payment) => payment.id === correctionRepayment.id)
    assert(settledPayment?.settlement_confirmation?.status === 'confirmed', 'Expected confirmed correction target to remain confirmed.')
    assert(
      (settledPayment?.enrollment_refunds || []).some((refund) => refund.reason_category === 'payment_correction' && refund.amount === 30000),
      'Expected correction refund after settlement confirmation to be stored.',
    )
    assert(settledRepayment && !settledRepayment.settlement_confirmation, 'Expected correction repayment to be a new unconfirmed settlement row.')
    pass('36. refund/correction after settlement confirmation')

    const mixedPartialRepay = await createEnrollment(cookie, course, 37, [
      paymentPayload('cash', 40000),
      paymentPayload('card', 60000, { cardLast4: '3737', cardCompany: 'KB' }),
    ])
    state = await assertEnrollmentState(mixedPartialRepay.enrollment.id, { paymentCount: 2, billingStatus: 'paid' })
    const mixedCash = state.payments.find((payment) => payment.method === 'cash')
    const mixedCard = state.payments.find((payment) => payment.method === 'card')
    await api('/api/payments/refunds', {
      method: 'POST',
      cookie,
      expect: [201],
      body: {
        requestId: randomUUID(),
        refunds: [
          {
            paymentId: mixedCash.id,
            amount: 10000,
            method: 'cash',
            reasonCategory: 'payment_correction',
            reason: 'mixed partial cash refund',
          },
          {
            paymentId: mixedCard.id,
            amount: 20000,
            method: 'card_cancel',
            cancelReceiptNo: `MIX-${runId}`,
            reasonCategory: 'payment_correction',
            reason: 'mixed partial card refund',
          },
        ],
      },
    })
    await assertEnrollmentState(mixedPartialRepay.enrollment.id, {
      paymentCount: 2,
      billingStatus: 'partial',
      enrollmentStatus: 'active',
      netTuition: 70000,
    })
    await api('/api/payments/batch', {
      method: 'POST',
      cookie,
      expect: [201],
      body: {
        requestId: randomUUID(),
        enrollmentId: mixedPartialRepay.enrollment.id,
        courseId: course.id,
        payments: [paymentPayload('bank_transfer', 30000, {
          bankName: 'Mixed Repay Bank',
          bankAccountLast4: '3730',
          depositorName: 'Mixed Repay',
        })],
      },
    })
    state = await assertEnrollmentState(mixedPartialRepay.enrollment.id, {
      paymentCount: 3,
      billingStatus: 'paid',
      enrollmentStatus: 'active',
      netTuition: 100000,
    })
    assert(state.payments.filter((payment) => payment.status === 'partial_refunded').length === 2, 'Expected both mixed original payments to be partially refunded.')
    assert(state.payments.some((payment) => payment.method === 'bank_transfer' && payment.amount === 30000), 'Expected mixed partial repayment row.')
    pass('37. mixed payment partial refund then repayment')

    const allPaymentIds = []
    for (const enrollmentId of createdEnrollments) {
      const state = await loadEnrollmentState(enrollmentId)
      allPaymentIds.push(...state.payments.map((payment) => payment.id))
    }

    const events = await db
      .from('payment_events')
      .select('id,event_type,payment_id,enrollment_id')
      .in('enrollment_id', createdEnrollments)

    if (events.error) throw events.error
    assert((events.data || []).length >= allPaymentIds.length, 'Expected payment events to be recorded.')
    pass('이벤트 기록 검증', `${events.data.length} events`)

    if (Number.isInteger(stressCount) && stressCount > 0) {
      const stressMethods = ['cash', 'bank_transfer', 'card', 'point']
      for (let i = 0; i < stressCount; i += 1) {
        const paymentCount = 1 + (i % 3)
        const expectedAmount = 60000 + (i % 9) * 10000
        const discountAmount = i % 5 === 0 ? 10000 : 0
        const payableAmount = expectedAmount - discountAmount
        const parts = []
        let remaining = payableAmount

        for (let partIndex = 0; partIndex < paymentCount; partIndex += 1) {
          const method = stressMethods[(i + partIndex) % stressMethods.length]
          const isLast = partIndex === paymentCount - 1
          const amount = isLast
            ? remaining
            : Math.max(1000, Math.floor((remaining / (paymentCount - partIndex)) / 1000) * 1000)
          remaining -= amount
          parts.push(paymentPayload(method, amount, {
            memo: `stress ${i + 1}/${stressCount}`,
            cardLast4: String(1000 + ((i + partIndex) % 9000)).padStart(4, '0'),
            bankAccountLast4: String(9000 - ((i + partIndex) % 9000)).padStart(4, '0'),
          }))
        }

        const { enrollment } = await createEnrollment(cookie, course, 1000 + i, parts, {
          expectedAmount,
          discountAmount,
          discountReason: discountAmount > 0 ? '스트레스 할인' : null,
          payableAmount,
        })
        let stressState = await assertEnrollmentState(enrollment.id, {
          paymentCount,
          billingStatus: 'paid',
          enrollmentStatus: 'active',
          netTuition: payableAmount,
        })

        const targetPayment = stressState.payments[i % stressState.payments.length]
        if (i % 4 === 0) {
          const refundAmount = Math.max(1000, Math.floor((targetPayment.amount / 2) / 1000) * 1000)
          await refundPayment(cookie, targetPayment.id, {
            amount: refundAmount,
            method: targetPayment.method === 'card' ? 'card_cancel' : targetPayment.method === 'bank_transfer' ? 'bank_transfer' : targetPayment.method,
            cancelReceiptNo: targetPayment.method === 'card' ? `STRESS-CANCEL-${runId}-${i}` : null,
            refundAccountLast4: targetPayment.method === 'bank_transfer' ? '2468' : null,
            reasonCategory: 'payment_correction',
            reason: '스트레스 부분 환불',
          })
          stressState = await assertEnrollmentState(enrollment.id, {
            paymentCount,
            billingStatus: payableAmount - refundAmount >= payableAmount ? 'paid' : 'partial',
            enrollmentStatus: 'active',
            netTuition: payableAmount - refundAmount,
          })
        } else if (i % 7 === 0 && targetPayment.status === 'paid') {
          await voidPayment(cookie, targetPayment.id)
          const nextNet = payableAmount - targetPayment.amount
          await assertEnrollmentState(enrollment.id, {
            paymentCount,
            billingStatus: nextNet <= 0 ? 'unpaid' : 'partial',
            enrollmentStatus: 'active',
            netTuition: nextNet,
          })
        }
      }
      pass(`스트레스 랜덤 조합 ${stressCount}명`)
    }

    return { course, count: scenarioResults.length }
  }

  const result = await run()
  console.log(JSON.stringify({
    ok: true,
    runId,
    division,
    courseId: result.course.id,
    enrollmentCount: createdEnrollments.length,
    stressCount: Number.isInteger(stressCount) && stressCount > 0 ? stressCount : 0,
    scenarioCount: scenarioResults.length,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
