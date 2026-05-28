import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildStudentLevelRows } from '../../src/lib/payments/xlsx-export'
import type { EnrollmentPayment, EnrollmentRefund, PaymentItem } from '../../src/lib/payments/types'
import type { Enrollment } from '../../src/types/database'

function makeEnrollment(overrides: Partial<Enrollment> = {}): Enrollment {
  return {
    id: 1,
    course_id: 1,
    student_id: 1,
    name: '홍길동',
    phone: '01012345678',
    exam_number: 'A-001',
    gender: '남',
    region: null,
    series_option_id: 1,
    series_group: 'public',
    series: '공채',
    student_type: 'academy',
    status: 'active',
    photo_url: null,
    memo: null,
    refunded_at: null,
    suspended_at: null,
    suspension_reason: null,
    suspended_by: null,
    custom_data: {},
    created_at: '2026-01-15T00:00:00Z',
    ...overrides,
  } as Enrollment
}

function makePayment(overrides: Partial<EnrollmentPayment> = {}): EnrollmentPayment {
  return {
    id: 1,
    enrollment_id: 1,
    course_id: 1,
    amount: 0,
    method: 'card',
    status: 'paid',
    category: 'tuition',
    paid_at: '2026-02-01T00:00:00Z',
    paid_date: '2026-02-01',
    memo: null,
    card_last4: null,
    installment_months: 0,
    bank_name: null,
    bank_account_last4: null,
    depositor_name: null,
    cash_receipt_approval_no: null,
    display_receipt_no: null,
    card_company: null,
    checkout_group_id: null,
    series_option_id_snapshot: null,
    series_group_snapshot: null,
    series_label_snapshot: null,
    created_by_staff_id: null,
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
    ...overrides,
  }
}

function makeRefund(overrides: Partial<EnrollmentRefund> = {}): EnrollmentRefund {
  return {
    id: 1,
    payment_id: 1,
    amount: 0,
    method: 'card_cancel',
    reason_category: 'withdrawal',
    reason: null,
    display_receipt_no: null,
    cancel_receipt_no: null,
    refund_account_last4: null,
    refunded_at: '2026-03-01T00:00:00Z',
    refund_date: '2026-03-01',
    processed_by_staff_id: null,
    memo: null,
    created_at: '2026-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('buildStudentLevelRows', () => {
  it('groups payments by enrollment_id and computes net amount', () => {
    const enrollment = makeEnrollment({ id: 100, name: '김민준', phone: '01011112222' })
    const payments = [
      makePayment({ id: 1, enrollment_id: 100, amount: 500000, card_company: '신한' }),
      makePayment({ id: 2, enrollment_id: 100, amount: 300000, card_company: '신한', paid_date: '2026-03-15' }),
    ]

    const rows = buildStudentLevelRows(payments, [enrollment])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].studentName, '김민준')
    assert.equal(rows[0].paidAmount, 800000)
    assert.equal(rows[0].refundedAmount, 0)
    assert.equal(rows[0].netAmount, 800000)
    assert.equal(rows[0].paymentCount, 2)
    assert.equal(rows[0].refundCount, 0)
    assert.equal(rows[0].lastPaidDate, '2026-03-15')
  })

  it('subtracts refund amounts from net', () => {
    const enrollment = makeEnrollment({ id: 200, name: '이서연' })
    const payments = [
      makePayment({
        id: 10,
        enrollment_id: 200,
        amount: 800000,
        enrollment_refunds: [makeRefund({ id: 50, payment_id: 10, amount: 200000 })],
      }),
    ]

    const rows = buildStudentLevelRows(payments, [enrollment])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].paidAmount, 800000)
    assert.equal(rows[0].refundedAmount, 200000)
    assert.equal(rows[0].netAmount, 600000)
    assert.equal(rows[0].refundCount, 1)
  })

  it('describes mixed payment items in method summary', () => {
    const enrollment = makeEnrollment({ id: 300, name: '박지호' })
    const items: PaymentItem[] = [
      { id: 1, payment_id: 20, label: '카드', amount: 500000, sort_order: 0 },
      { id: 2, payment_id: 20, label: '포인트', amount: 300000, sort_order: 1 },
    ]
    const payments = [
      makePayment({
        id: 20,
        enrollment_id: 300,
        amount: 800000,
        method: 'mixed',
        enrollment_payment_items: items,
      }),
    ]

    const rows = buildStudentLevelRows(payments, [enrollment])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].paidAmount, 800000)
    assert.ok(rows[0].methodSummary.includes('카드'), 'method summary should include 카드')
    assert.ok(rows[0].methodSummary.includes('포인트'), 'method summary should include 포인트')
  })

  it('includes enrollments with zero payments as 0-amount rows', () => {
    const enrollments = [
      makeEnrollment({ id: 1, name: '결제완료학생' }),
      makeEnrollment({ id: 2, name: '미결제학생' }),
    ]
    const payments = [
      makePayment({ id: 1, enrollment_id: 1, amount: 500000 }),
    ]

    const rows = buildStudentLevelRows(payments, enrollments)
    assert.equal(rows.length, 2)

    const unpaid = rows.find((row) => row.studentName === '미결제학생')
    assert.ok(unpaid, '미결제 학생 row should exist')
    assert.equal(unpaid?.paidAmount, 0)
    assert.equal(unpaid?.refundedAmount, 0)
    assert.equal(unpaid?.paymentCount, 0)
    assert.equal(unpaid?.netAmount, 0)
  })

  it('excludes voided payments from totals', () => {
    const enrollment = makeEnrollment({ id: 400, name: '취소된학생' })
    const payments = [
      makePayment({ id: 30, enrollment_id: 400, amount: 500000, status: 'voided' }),
      makePayment({ id: 31, enrollment_id: 400, amount: 600000, status: 'paid' }),
    ]

    const rows = buildStudentLevelRows(payments, [enrollment])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].paidAmount, 600000, 'voided payment excluded')
    assert.equal(rows[0].paymentCount, 1)
  })

  it('handles payments for enrollments not in the roster list', () => {
    // 결제 기록은 있지만 enrollments 목록엔 없는 경우 (예: 환불 후 삭제된 등록)
    const payments = [
      makePayment({
        id: 40,
        enrollment_id: 999,
        amount: 400000,
        enrollments: { id: 999, name: '삭제된학생', phone: '01099998888', exam_number: 'X-1', status: 'active', series_option_id: 1, series_group: 'public', series: '공채', student_type: 'general' },
      }),
    ]

    const rows = buildStudentLevelRows(payments, [])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].studentName, '삭제된학생')
    assert.equal(rows[0].paidAmount, 400000)
  })
})

describe('buildStudentLevelRows — 회계 정확성 회귀 가드', () => {
  // BUG #1 회귀 방지: 환불이 있는 학생의 청구금액(expectedAmount)이
  // billing.expected_amount와 일치해야 함. 잘못 계산하면 `paidAmount + refundedAmount` 등으로 인플레이션됨.
  it('환불이 있어도 expectedAmount는 enrollment_billing.expected_amount로 결정된다', () => {
    const enrollment = makeEnrollment({ id: 500, name: '환불학생' })
    const payments = [
      makePayment({
        id: 100,
        enrollment_id: 500,
        amount: 900000,
        status: 'partial_refunded',
        enrollment_billing: {
          expected_amount: 900000,
          payable_amount: 900000,
          discount_amount: 0,
          created_by_staff_id: null,
        },
        enrollment_refunds: [makeRefund({ id: 200, payment_id: 100, amount: 300000 })],
      }),
    ]

    const rows = buildStudentLevelRows(payments, [enrollment])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].expectedAmount, 900000, '청구금액은 원래 청구한 90만이어야 함 (환불 30만을 청구액에 더하면 안 됨)')
    assert.equal(rows[0].paidAmount, 900000)
    assert.equal(rows[0].refundedAmount, 300000)
    assert.equal(rows[0].netAmount, 600000)
  })

  it('discount_amount가 있는 학생의 expectedAmount/discountAmount가 billing snapshot과 일치', () => {
    const enrollment = makeEnrollment({ id: 600, name: '할인학생' })
    const payments = [
      makePayment({
        id: 101,
        enrollment_id: 600,
        amount: 800000,
        enrollment_billing: {
          expected_amount: 1000000,
          payable_amount: 800000,
          discount_amount: 200000,
          created_by_staff_id: null,
        },
      }),
    ]

    const rows = buildStudentLevelRows(payments, [enrollment])
    assert.equal(rows[0].expectedAmount, 1000000, '청구금액 100만')
    assert.equal(rows[0].discountAmount, 200000, '할인 20만')
    assert.equal(rows[0].paidAmount, 800000, '결제 80만')
    assert.equal(rows[0].netAmount, 800000, '순액 80만')
  })

  it('enrollment_billing이 없으면 expectedAmount는 결제총액으로 fallback (인플레이션 없음)', () => {
    const enrollment = makeEnrollment({ id: 700, name: 'NoBilling학생' })
    const payments = [
      makePayment({
        id: 102,
        enrollment_id: 700,
        amount: 500000,
        enrollment_refunds: [makeRefund({ id: 201, payment_id: 102, amount: 100000 })],
      }),
    ]

    const rows = buildStudentLevelRows(payments, [enrollment])
    // billing이 null이라 expectedAmount = paidAmount. 환불을 더하지 않음.
    assert.equal(rows[0].expectedAmount, 500000)
    assert.equal(rows[0].refundedAmount, 100000)
    assert.equal(rows[0].netAmount, 400000)
  })

  // 강좌 전체 매출 일관성 — 학생별 paidAmount 합 === 강좌 총매출
  it('학생별 paidAmount 합계가 입력 결제총액과 일치한다 (수강생별 시트 SUM 검증)', () => {
    const enrollments = [
      makeEnrollment({ id: 1, name: 'A' }),
      makeEnrollment({ id: 2, name: 'B' }),
      makeEnrollment({ id: 3, name: 'C' }),
    ]
    const payments = [
      makePayment({ id: 1, enrollment_id: 1, amount: 800000 }),
      makePayment({ id: 2, enrollment_id: 2, amount: 600000 }),
      makePayment({ id: 3, enrollment_id: 2, amount: 200000 }),
      makePayment({ id: 4, enrollment_id: 3, amount: 500000, status: 'voided' }), // voided 제외
      makePayment({ id: 5, enrollment_id: 3, amount: 400000 }),
    ]

    const rows = buildStudentLevelRows(payments, enrollments)
    const totalPaid = rows.reduce((sum, row) => sum + row.paidAmount, 0)
    assert.equal(totalPaid, 800000 + 600000 + 200000 + 400000, 'voided 제외 후 결제총액 = 2,000,000')
  })

  // 학생별 refundedAmount 합 === 강좌 총환불
  it('학생별 refundedAmount 합계가 입력 환불총액과 일치한다', () => {
    const enrollments = [
      makeEnrollment({ id: 1, name: 'A' }),
      makeEnrollment({ id: 2, name: 'B' }),
    ]
    const payments = [
      makePayment({
        id: 1,
        enrollment_id: 1,
        amount: 1000000,
        enrollment_refunds: [
          makeRefund({ id: 10, payment_id: 1, amount: 200000 }),
          makeRefund({ id: 11, payment_id: 1, amount: 100000 }),
        ],
      }),
      makePayment({
        id: 2,
        enrollment_id: 2,
        amount: 500000,
        enrollment_refunds: [makeRefund({ id: 12, payment_id: 2, amount: 50000 })],
      }),
    ]

    const rows = buildStudentLevelRows(payments, enrollments)
    const totalRefunded = rows.reduce((sum, row) => sum + row.refundedAmount, 0)
    assert.equal(totalRefunded, 200000 + 100000 + 50000)
  })
})

