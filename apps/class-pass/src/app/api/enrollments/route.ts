import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { authenticateAdminRequest } from '@/lib/auth/authenticate'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { resolveBranchSeriesOption } from '@/lib/branch-series'
import { invalidateCache } from '@/lib/cache/revalidate'
import {
  bulkAssignTextbooks,
  getCourseById,
  listCourseEnrollments,
  listMaterialsForCourse,
  verifyCourseOwnership,
} from '@/lib/class-pass-data'
import {
  createPaymentBundle,
  getPaymentServiceMessage,
  getPaymentServiceStatus,
  upsertEnrollmentBilling,
} from '@/lib/payments/service'
import {
  deleteStudentIfOrphaned,
  ensureStudentProfile,
  findMatchingStudentProfile,
  getStudentAuthProfile,
  getStudentProfileById,
  initializeStudentAuth,
  syncStudentEnrollmentSnapshots,
} from '@/lib/student-profiles'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import { parsePositiveInt } from '@/lib/utils'
import type { Enrollment, StaffJwtPayload, Student } from '@/types/database'

const paymentItemSchema = z.object({
  label: z.string().min(1),
  amount: z.number().int().min(0),
})

const paymentMethodSchema = z.enum(['card', 'cash', 'bank_transfer', 'point', 'free', 'other'])

const paymentSchema = z.object({
  amount: z.number().int().min(0),
  method: paymentMethodSchema,
  category: z.enum(['tuition', 'textbook', 'material', 'exam_fee', 'extension', 'etc']).default('tuition'),
  paidAt: z.string().optional().nullable(),
  memo: z.string().optional().nullable(),
  cardLast4: z.string().optional().nullable(),
  installmentMonths: z.number().int().min(0).max(60).optional().nullable(),
  bankName: z.string().optional().nullable(),
  bankAccountLast4: z.string().optional().nullable(),
  cashReceiptApprovalNo: z.string().trim().max(80).optional().nullable(),
  items: z.array(paymentItemSchema).optional(),
})

const billingSchema = z.object({
  expectedAmount: z.number().int().min(0),
  discountAmount: z.number().int().min(0).default(0),
  discountReason: z.string().optional().nullable(),
  payableAmount: z.number().int().min(0),
  tuitionExempt: z.boolean().default(false),
  tuitionExemptReason: z.string().optional().nullable(),
})

const createSchema = z.object({
  courseId: z.number().int().positive(),
  studentId: z.number().int().positive().optional().nullable(),
  updateSelectedStudent: z.boolean().optional(),
  name: z.string().min(1),
  phone: z.string().min(10),
  exam_number: z.string().optional().nullable(),
  gender: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
  series: z.string().optional().nullable(),
  series_option_id: z.number().int().positive().optional().nullable(),
  memo: z.string().optional().nullable(),
  photo_url: z.string().optional().nullable(),
  birth_date: z.union([z.string().regex(/^\d{6}$/), z.literal('')]).optional().nullable(),
  custom_data: z.record(z.string()).optional(),
  textbookIds: z.array(z.number().int().positive()).optional(),
  billing: billingSchema.optional(),
  payments: z.array(paymentSchema).optional(),
})

function getBillingValidationError(
  billing: z.infer<typeof billingSchema> | undefined,
  payments: z.infer<typeof paymentSchema>[],
) {
  if (!billing) {
    return payments.length > 0 ? '수납을 저장하려면 청구 정보를 함께 보내야 합니다.' : null
  }

  if (billing.discountAmount > billing.expectedAmount) {
    return '할인 금액은 강좌 정가보다 클 수 없습니다.'
  }

  if (!billing.tuitionExempt && billing.expectedAmount <= 0) {
    return '유료 수강은 강좌 정가를 1원 이상 입력해야 합니다.'
  }

  if (!billing.tuitionExempt && billing.discountAmount > 0 && !billing.discountReason?.trim()) {
    return '할인 금액을 입력한 경우 할인 사유가 필요합니다.'
  }

  const calculatedPayableAmount = billing.tuitionExempt
    ? 0
    : Math.max(billing.expectedAmount - billing.discountAmount, 0)
  if (billing.payableAmount !== calculatedPayableAmount) {
    return '적용 금액이 청구 정보와 일치하지 않습니다.'
  }

  if (!billing.tuitionExempt && billing.payableAmount <= 0) {
    return '적용 금액이 0원이면 무료 수강 또는 수납 면제로 기록해 주세요.'
  }

  const tuitionPaymentTotal = payments.reduce((sum, payment) => (
    payment.category === 'tuition' ? sum + payment.amount : sum
  ), 0)
  if (billing.tuitionExempt) {
    if (!billing.tuitionExemptReason?.trim()) {
      return '무료 수강 또는 수납 면제 사유를 입력해 주세요.'
    }

    if (payments.some((payment) => payment.method !== 'free' || payment.amount !== 0)) {
      return '무료 수강 결제 기록은 금액 0원과 무료 수단으로만 저장할 수 있습니다.'
    }

    return null
  }

  if (payments.length > 0 && tuitionPaymentTotal <= 0) {
    return '수납 금액을 입력해 주세요.'
  }

  if (payments.length > 0 && tuitionPaymentTotal !== billing.payableAmount) {
    return '수납 합계가 적용 금액과 일치해야 합니다.'
  }

  return null
}

function getActorStaffId(payload: StaffJwtPayload | null) {
  return payload?.accountId ?? payload?.membershipId ?? null
}

async function rollbackCreatedEnrollment(
  db: ReturnType<typeof createServerClient>,
  enrollmentId: number,
  studentId: number,
  shouldDeleteStudent: boolean,
) {
  const { error } = await db.rpc('rollback_enrollment_creation', {
    p_enrollment_id: enrollmentId,
  })

  if (error) {
    throw error
  }

  if (shouldDeleteStudent) {
    await deleteStudentIfOrphaned(db, studentId)
  }
}

export async function GET(req: NextRequest) {
  try {
    const authError = await requireAdminApi(req)
    if (authError) {
      return authError
    }

    const courseId = parsePositiveInt(req.nextUrl.searchParams.get('courseId'))
    if (!courseId) {
      return NextResponse.json({ error: 'courseId가 필요합니다.' }, { status: 400 })
    }

    const limit = parsePositiveInt(req.nextUrl.searchParams.get('limit')) ?? undefined
    const offset = parsePositiveInt(req.nextUrl.searchParams.get('offset'))
    const division = await getServerTenantType()
    if (!(await verifyCourseOwnership(courseId, division))) {
      return NextResponse.json({ error: '과정을 찾을 수 없습니다.' }, { status: 404 })
    }

    const enrollments = await listCourseEnrollments(courseId, {
      limit,
      offset: offset ?? undefined,
    })

    const studentIds = Array.from(new Set(
      enrollments
        .map((enrollment) => enrollment.student_id)
        .filter((studentId): studentId is number => Number.isInteger(studentId)),
    ))

    let studentProfileMap = new Map<number, Pick<Student, 'id' | 'birth_date' | 'auth_method'>>()
    if (studentIds.length > 0) {
      const db = createServerClient()
      const { data: students, error } = await db
        .from('students')
        .select('*')
        .in('id', studentIds)

      if (error) {
        return NextResponse.json({ error: '수강생 목록을 불러오지 못했습니다.' }, { status: 500 })
      }

      studentProfileMap = new Map(
        ((students ?? []) as Student[]).map((student) => [
          student.id,
          {
            id: student.id,
            birth_date: student.birth_date ?? null,
            auth_method: student.auth_method ?? null,
          },
        ]),
      )
    }

    return NextResponse.json({
      enrollments: enrollments.map((enrollment) => ({
        ...enrollment,
        student_profile: enrollment.student_id
          ? studentProfileMap.get(enrollment.student_id) ?? null
          : null,
      })),
    })
  } catch (error) {
    return handleRouteError('enrollments.GET', '수강생 목록을 불러오지 못했습니다.', error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateAdminRequest(req)
    if (auth.error) {
      return auth.error
    }

    const featureError = await requireAppFeature('admin_student_management_enabled')
    if (featureError) {
      return featureError
    }

    const body = await req.json().catch(() => null)
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '수강생 생성 요청 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    const course = await getCourseById(parsed.data.courseId, division)
    if (!course) {
      return NextResponse.json({ error: '과정을 찾을 수 없습니다.' }, { status: 404 })
    }

    const textbookIds = Array.from(new Set(parsed.data.textbookIds ?? []))
    if (textbookIds.length > 0) {
      const textbooks = await listMaterialsForCourse(parsed.data.courseId, { materialType: 'textbook' })
      const textbookIdSet = new Set(textbooks.map((textbook) => textbook.id))
      if (textbookIds.some((textbookId) => !textbookIdSet.has(textbookId))) {
        return NextResponse.json({ error: '유효하지 않은 교재가 포함되어 있습니다.' }, { status: 400 })
      }
    }

    const payments = parsed.data.payments ?? []
    const billingError = getBillingValidationError(parsed.data.billing, payments)
    if (billingError) {
      return NextResponse.json({ error: billingError }, { status: 400 })
    }

    const db = createServerClient()
    const seriesOption = await resolveBranchSeriesOption({
      optionId: parsed.data.series_option_id,
      label: parsed.data.series,
    })
    if (parsed.data.series_option_id && seriesOption?.id !== parsed.data.series_option_id) {
      return NextResponse.json({ error: '선택한 직렬이 현재 지점에서 사용할 수 없습니다.' }, { status: 400 })
    }
    const selectedStudent = parsed.data.studentId
      ? await getStudentProfileById(db, parsed.data.studentId, division)
      : null

    if (parsed.data.studentId && !selectedStudent) {
      return NextResponse.json({ error: '선택한 수강생을 찾을 수 없습니다.' }, { status: 404 })
    }

    const matchedStudent = selectedStudent ?? await findMatchingStudentProfile(db, {
      division,
      name: parsed.data.name,
      phone: parsed.data.phone,
      exam_number: parsed.data.exam_number,
      photo_url: parsed.data.photo_url,
    })

    if (matchedStudent) {
      const { data: existingByStudent, error: existingError } = await db
        .from('enrollments')
        .select('id')
        .eq('course_id', parsed.data.courseId)
        .eq('student_id', matchedStudent.id)
        .maybeSingle()

      if (existingError) {
        return NextResponse.json({ error: '수강생을 생성하지 못했습니다.' }, { status: 500 })
      }

      if (existingByStudent) {
        return NextResponse.json({ error: '같은 과정에 동일한 수강생이 이미 존재합니다.' }, { status: 409 })
      }
    }

    const studentResult = selectedStudent && !parsed.data.updateSelectedStudent
      ? { student: selectedStudent, created: false, changed: false }
      : await ensureStudentProfile(db, {
        division,
        currentStudentId: selectedStudent?.id ?? matchedStudent?.id ?? null,
        name: parsed.data.name,
        phone: parsed.data.phone,
        exam_number: parsed.data.exam_number,
        photo_url: parsed.data.photo_url,
      })

    if ((studentResult.changed || studentResult.created)) {
      await syncStudentEnrollmentSnapshots(db, studentResult.student)
    }

    const authSetup = await initializeStudentAuth(
      db,
      studentResult.student,
      parsed.data.birth_date || null,
    )
    const student = authSetup.student

    const { data, error } = await db
      .from('enrollments')
      .insert({
        course_id: parsed.data.courseId,
        student_id: student.id,
        name: student.name,
        phone: student.phone,
        exam_number: student.exam_number,
        gender: parsed.data.gender || null,
        region: parsed.data.region || null,
        series_option_id: seriesOption?.id ?? null,
        series_group: seriesOption?.group_key ?? 'public',
        series: seriesOption?.label ?? parsed.data.series ?? '공채',
        memo: parsed.data.memo || null,
        photo_url: student.photo_url,
        custom_data: parsed.data.custom_data ?? {},
      })
      .select('*')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '같은 과정에 동일한 이름/연락처 수강생이 이미 존재합니다.' }, { status: 409 })
      }

      return NextResponse.json({ error: '수강생을 생성하지 못했습니다.' }, { status: 500 })
    }

    const enrollment = data as Enrollment

    if (textbookIds.length > 0) {
      try {
        await bulkAssignTextbooks(enrollment.id, textbookIds, 'admin')
      } catch (assignmentError) {
        try {
          await rollbackCreatedEnrollment(db, enrollment.id, student.id, studentResult.created)
        } catch {
          throw new Error('ENROLLMENT_TEXTBOOK_ASSIGNMENT_ROLLBACK_FAILED', { cause: assignmentError })
        }

        throw assignmentError
      }
    }

    try {
      if (payments.length > 0) {
        await createPaymentBundle({
          enrollmentId: enrollment.id,
          courseId: parsed.data.courseId,
          billing: parsed.data.billing,
          payments,
        }, division, getActorStaffId(auth.payload))
      } else if (parsed.data.billing) {
        await upsertEnrollmentBilling({
          enrollmentId: enrollment.id,
          courseId: parsed.data.courseId,
          expectedAmount: parsed.data.billing.expectedAmount,
          discountAmount: parsed.data.billing.discountAmount,
          discountReason: parsed.data.billing.discountReason,
          payableAmount: parsed.data.billing.payableAmount,
          tuitionExempt: parsed.data.billing.tuitionExempt,
          tuitionExemptReason: parsed.data.billing.tuitionExemptReason,
        }, division, getActorStaffId(auth.payload))
      }
    } catch (paymentError) {
      try {
        await rollbackCreatedEnrollment(db, enrollment.id, student.id, studentResult.created)
      } catch (rollbackError) {
        throw new Error('ENROLLMENT_PAYMENT_ROLLBACK_FAILED', { cause: rollbackError })
      }

      return NextResponse.json(
        { error: getPaymentServiceMessage(paymentError, '청구 또는 수납 정보를 저장하지 못했습니다.') },
        { status: getPaymentServiceStatus(paymentError) },
      )
    }

    await invalidateCache('enrollments')
    if (textbookIds.length > 0) {
      await invalidateCache('materials')
    }
    return NextResponse.json({
      enrollment: {
        ...enrollment,
        student_profile: getStudentAuthProfile(student),
      },
      generated_pin: authSetup.generatedPin ?? undefined,
    }, { status: 201 })
  } catch (error) {
    return handleRouteError('enrollments.POST', '수강생을 생성하지 못했습니다.', error)
  }
}
