import type { Enrollment } from '../../src/types/database'
import type { EnrollmentPayment, EnrollmentRefund } from '../../src/lib/payments/types'

export function enrollmentFixture(): Enrollment {
  return {
    id: 1, course_id: 2, student_id: 3, name: '환불 테스트', phone: '01012345678', exam_number: null,
    gender: null, region: null, series_option_id: null, series_group: 'public', series: '공채', student_type: 'academy',
    status: 'active', photo_url: null, memo: null, refunded_at: null, suspended_at: null, suspension_reason: null,
    suspended_by: null, custom_data: {}, created_at: '2026-09-01T00:00:00Z',
    billing: { id: 4, enrollment_id: 1, course_id: 2, expected_amount: 30000, discount_amount: 0,
      discount_reason: null, payable_amount: 30000, tuition_exempt: false, tuition_exempt_reason: null,
      status: 'paid', created_by_staff_id: null, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' },
  }
}

export function paymentFixture(id = 100, group = 'same'): EnrollmentPayment {
  const enrollment = enrollmentFixture()
  return {
    id, enrollment_id: 1, course_id: 2, amount: 30000, method: 'cash', category: 'tuition', status: 'paid',
    paid_at: '2026-09-05T01:00:00Z', paid_date: '2026-09-05', checkout_group_id: group,
    memo: null, card_last4: null, installment_months: 0, bank_name: null, bank_account_last4: null,
    depositor_name: null, cash_receipt_approval_no: null, display_receipt_no: null, card_company: null,
    series_option_id_snapshot: null, series_group_snapshot: 'public', series_label_snapshot: '공채',
    created_by_staff_id: null, created_at: '2026-09-05T01:00:00Z', updated_at: '2026-09-05T01:00:00Z',
    enrollment_refunds: [], enrollment_payment_items: [],
    enrollments: { id: 1, name: enrollment.name, phone: enrollment.phone, exam_number: null, status: 'active',
      series_option_id: null, series_group: 'public', series: '공채', student_type: 'academy' },
  }
}

export function refundFixture(amount = 10000): EnrollmentRefund {
  return { id: 201, payment_id: 100, amount, method: 'cash', reason_category: 'withdrawal', reason: null,
    display_receipt_no: null, cancel_receipt_no: null, refund_account_last4: null,
    refunded_at: '2026-09-05T02:00:00Z', refund_date: '2026-09-05', processed_by_staff_id: null,
    memo: null, created_at: '2026-09-05T02:00:00Z' }
}
