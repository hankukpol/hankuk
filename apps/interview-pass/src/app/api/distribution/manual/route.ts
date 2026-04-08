import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { distributeMaterial } from '@/lib/distribution/materials'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { requireAppFeature } from '@/lib/app-feature-guard'

const schema = z.object({
  student_id: z.string().uuid(),
  material_id: z.number().int().positive(),
  note: z.string().max(200).default(''),
})

export async function POST(req: NextRequest) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const featureError = await requireAppFeature('admin_student_management_enabled')
  if (featureError) {
    return featureError
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
  }

  try {
    const result = await distributeMaterial({
      studentId: parsed.data.student_id,
      materialId: parsed.data.material_id,
      distributedBy: '관리자',
      note: parsed.data.note,
    })

    if (!result.success) {
      const messages: Record<string, string> = {
        already_distributed: '이미 배부된 자료입니다.',
        student_not_found: '학생을 찾을 수 없거나 환불 처리되었습니다.',
        material_inactive: '비활성 자료입니다.',
      }

      return NextResponse.json(
        { error: messages[result.reason ?? ''] ?? '배부 처리에 실패했습니다.' },
        { status: 409 },
      )
    }

    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
