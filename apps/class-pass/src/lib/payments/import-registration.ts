import { randomUUID } from 'node:crypto'
import { resolveBranchSeriesOptionFromOptions } from '@/lib/branch-series'
import { invalidateCache } from '@/lib/cache/revalidate'
import { verifyCourseOwnership } from '@/lib/class-pass-data'
import { ensureStudentProfile, findMatchingStudentProfile, initializeStudentAuth } from '@/lib/student-profiles'
import { createServerClient } from '@/lib/supabase/server'
import { normalizeTenantType } from '@/lib/tenant'
import type { BranchSeriesOption } from '@/types/database'
import { getTuitionExemptBillingRuleError } from './billing-rules'
import { getPaymentServiceMessage, type CreateEnrollmentForPaymentInput, type CreatePaymentBundleInput } from './service'

type ImportPayments = CreatePaymentBundleInput['payments']

function importRegistrationError(message: string) {
  return Object.assign(new Error(message), { status: 400 })
}

export function getImportRegistrationBilling(payments: ImportPayments): NonNullable<CreatePaymentBundleInput['billing']> {
  const tuitionPayments = payments.filter((payment) => (payment.category ?? 'tuition') === 'tuition')
  if (tuitionPayments.length === 0) {
    throw importRegistrationError('신규 수강생 생성에는 전액 수강료 수납 행이 필요합니다. 교재비만 수납하려면 수강생을 먼저 등록해 주세요.')
  }
  const freePayments = payments.filter((payment) => payment.method === 'free')
  if (freePayments.length > 0) {
    if (payments.length !== 1 || tuitionPayments.length !== 1 || Number(freePayments[0].amount) !== 0) {
      throw importRegistrationError('무료 수강은 다른 수납과 섞지 말고 수강료 0원 한 행으로 입력해 주세요.')
    }
    const reason = freePayments[0].memo?.trim() || null
    if (!reason) throw importRegistrationError('무료 수강은 메모에 면제 사유를 입력해 주세요.')
    const ruleError = getTuitionExemptBillingRuleError({ tuitionExempt: true, tuitionExemptReason: reason })
    if (ruleError) throw importRegistrationError(ruleError)
    return { expectedAmount: 0, discountAmount: 0, discountReason: null, payableAmount: 0, tuitionExempt: true, tuitionExemptReason: reason }
  }
  const tuitionTotal = tuitionPayments.reduce((sum, payment) => sum + Number(payment.amount), 0)
  if (!Number.isSafeInteger(tuitionTotal) || tuitionTotal <= 0 || tuitionTotal > 2147483647) {
    throw importRegistrationError('수강료 수납 합계가 올바르지 않습니다.')
  }
  return { expectedAmount: tuitionTotal, discountAmount: 0, discountReason: null, payableAmount: tuitionTotal, tuitionExempt: false, tuitionExemptReason: null }
}

/** Student identity/auth preparation is separate; enrollment, billing and receipts commit in one RPC. */
export async function createPaymentImportRegistration(
  input: CreateEnrollmentForPaymentInput & { payments: ImportPayments },
  division: string,
  actorStaffId?: number | null,
) {
  const tenantDivision = normalizeTenantType(division)
  if (!tenantDivision || !(await verifyCourseOwnership(input.courseId, tenantDivision))) {
    throw importRegistrationError('강좌를 찾을 수 없습니다.')
  }
  if (!input.birthDate) throw importRegistrationError('신규 수강생의 생년월일이 필요합니다.')
  const billing = getImportRegistrationBilling(input.payments)
  const db = createServerClient()
  // Read the explicit division; do not create branch defaults while importing receipts.
  const { data: options, error: optionError } = await db.from('branch_series_options')
    .select('*,branches!inner(slug)')
    .eq('branches.slug', tenantDivision)
    .eq('is_active', true)
    .order('display_order')
    .order('id')
  if (optionError) throw optionError
  const seriesOption = resolveBranchSeriesOptionFromOptions((options ?? []) as BranchSeriesOption[])
  const snapshot = {
    division: tenantDivision,
    name: input.name,
    phone: input.phone,
    ...(input.examNumber ? { exam_number: input.examNumber } : {}),
    birth_date: input.birthDate,
  }
  const matchedStudent = await findMatchingStudentProfile(db, snapshot)
  const studentResult = matchedStudent
    ? { student: matchedStudent, created: false, changed: false }
    : await ensureStudentProfile(db, snapshot)

  let committed = false
  try {
    const student = studentResult.created
      ? (await initializeStudentAuth(db, studentResult.student, input.birthDate)).student
      : studentResult.student
    const { data, error } = await db.rpc('create_enrollment_batch_atomic', {
      p_student_id: student.id,
      p_student_snapshot: {
        name: student.name, phone: student.phone, examNumber: student.exam_number,
        gender: null, region: null, seriesOptionId: seriesOption?.id ?? null,
        seriesGroup: seriesOption?.group_key ?? 'public', series: seriesOption?.label ?? '공채',
        studentType: 'academy', memo: null, photoUrl: student.photo_url, customData: input.customData ?? {},
      },
      p_registrations: [{ courseId: input.courseId, textbookIds: [], billing, payments: input.payments }],
      p_division: tenantDivision,
      p_actor_staff_id: actorStaffId ?? null,
      p_checkout_group_id: randomUUID(),
    })
    if (error) throw error
    committed = true
    const rows = data as Array<{ enrollment_id: number; reactivated: boolean; payment_ids: number[] }> | null
    const registration = rows?.[0]
    if (rows?.length !== 1 || !registration?.enrollment_id || registration.payment_ids?.length !== input.payments.length) {
      throw importRegistrationError('저장 응답을 확인하지 못했습니다. 재업로드 전에 수강생과 수납 내역을 확인해 주세요.')
    }
    // Cache invalidation is after commit and must not misreport a saved transaction as failed.
    await invalidateCache('enrollments').catch((error) => {
      console.error('paymentImport cache invalidation failed after commit', { enrollmentId: registration.enrollment_id, error })
    })
    return { enrollmentId: Number(registration.enrollment_id), createdPaymentCount: registration.payment_ids.length, reactivated: registration.reactivated }
  } catch (error) {
    if (!committed && studentResult.created) {
      // A separate count-then-delete can race another registration and cascade-delete its data.
      // Keep the shared student master; financial/enrollment writes remain in the transaction.
      throw importRegistrationError(`${getPaymentServiceMessage(error, '수강등록·수납 저장 결과를 확인하지 못했습니다.')} 학생 기본정보는 남아 있을 수 있습니다. 재업로드 전에 기존 학생 조회와 수납 내역을 확인해 주세요.`)
    }
    throw error
  }
}
