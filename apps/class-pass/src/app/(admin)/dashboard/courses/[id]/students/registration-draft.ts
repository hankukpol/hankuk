import type { PaymentSectionValue } from '@/components/payments/PaymentSection'
import type { Course } from '@/types/database'
import type { RegistrationBillingDraft } from './registration-courses-section'
import type { EnrollmentForm } from './students-page-types'

/** Compare editable data, not generated entry IDs or derived payment totals. */
export function registrationDraftSnapshot(options: {
  form: EnrollmentForm
  courses: Course[]
  billing: Record<number, RegistrationBillingDraft>
  allExempt: boolean
  commonReason: string
  payment: PaymentSectionValue
  studentId: number | null
  editable: boolean
}) {
  return JSON.stringify({
    form: options.form,
    courses: options.courses.map((course) => {
      const draft = options.billing[course.id]
      return {
        id: course.id,
        expectedAmount: Number(draft?.expectedAmount ?? course.tuition_amount ?? 0),
        discountAmount: Number(draft?.discountAmount ?? 0),
        discountReason: draft?.discountReason ?? '',
        tuitionExempt: Boolean(draft?.tuitionExempt),
        tuitionExemptReason: draft?.tuitionExemptReason ?? '',
      }
    }),
    allExempt: options.allExempt,
    commonReason: options.commonReason,
    payment: {
      category: options.payment.category,
      paidAt: options.payment.paidAt,
      memo: options.payment.memo,
      entries: options.payment.entries.map((entry) => ({
        method: entry.method,
        amount: Number(entry.amount || 0),
        memo: entry.memo,
        cardCompany: entry.cardCompany,
        depositorName: entry.depositorName,
        cashReceiptApprovalNo: entry.cashReceiptApprovalNo,
      })),
    },
    studentId: options.studentId,
    editable: options.editable,
  })
}
