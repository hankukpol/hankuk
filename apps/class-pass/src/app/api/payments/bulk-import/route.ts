import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getActorStaffId } from '@/lib/auth/actor'
import { authenticateAdminRequest } from '@/lib/auth/authenticate'
import { verifyCourseOwnership } from '@/lib/class-pass-data'
import { runPaymentImport } from '@/lib/payments/bulk-import'
import {
  getPaymentServiceMessage,
  getPaymentServiceStatus,
  listCourseEnrollmentsForPaymentImport,
} from '@/lib/payments/service'
import { getServerTenantType } from '@/lib/tenant.server'

const importRowSchema = z.object({
  name: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  examNumber: z.string().optional().nullable(),
  birthDate: z.string().optional().nullable(),
  amount: z.union([z.number(), z.string()]).optional().nullable(),
  paidAt: z.string().optional().nullable(),
  method: z.string().optional().nullable(),
  cardCompany: z.string().optional().nullable(),
  bankAccountLast4: z.string().optional().nullable(),
  depositorName: z.string().optional().nullable(),
  memo: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
})

const bulkImportSchema = z.object({
  courseId: z.number().int().positive(),
  rows: z.array(importRowSchema).min(1).max(2000),
  dryRun: z.boolean().default(true),
  createMissingEnrollment: z.boolean().default(true),
})

export async function POST(req: NextRequest) {
  const auth = await authenticateAdminRequest(req)
  if (auth.error) {
    return auth.error
  }

  try {
    const body = await req.json().catch(() => null)
    const parsed = bulkImportSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '결제 일괄 등록 요청 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    if (!(await verifyCourseOwnership(parsed.data.courseId, division))) {
      return NextResponse.json({ error: '강좌를 찾을 수 없습니다.' }, { status: 404 })
    }

    const enrollments = await listCourseEnrollmentsForPaymentImport(parsed.data.courseId, division)
    const result = await runPaymentImport({
      courseId: parsed.data.courseId,
      rows: parsed.data.rows,
      enrollments,
      createMissingEnrollment: parsed.data.createMissingEnrollment,
      dryRun: parsed.data.dryRun,
      division,
      actorStaffId: getActorStaffId(auth.payload),
    })

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: getPaymentServiceMessage(error, '결제 일괄 등록을 처리하지 못했습니다.') },
      { status: getPaymentServiceStatus(error) },
    )
  }
}
