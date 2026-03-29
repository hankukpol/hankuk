import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { normalizePhone, normalizeName } from '@/lib/utils'
import { distributeMaterial } from '@/lib/distribution/materials'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { withDivisionFallback } from '@/lib/division-compat'
import { getScopedDivisionValues } from '@/lib/division-scope'
import { getServerTenantType } from '@/lib/tenant.server'

const schema = z.object({
  exam_number: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  material_id: z.number().int().positive(),
})

export async function POST(req: NextRequest) {
  const featureError = await requireAppFeature('staff_quick_distribution_enabled')
  if (featureError) {
    return featureError
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
  }

  const { exam_number, name, phone, material_id: materialId } = parsed.data
  const db = createServerClient()
  const division = await getServerTenantType()
  const scope = getScopedDivisionValues(division)

  let student: { id: string; name: string } | null = null

  if (exam_number) {
    const { data } = await withDivisionFallback(
      () =>
        db
          .from('students')
          .select('id,name')
          .in('division', scope)
          .eq('exam_number', exam_number.trim())
          .maybeSingle(),
      () =>
        db
          .from('students')
          .select('id,name')
          .eq('exam_number', exam_number.trim())
          .maybeSingle(),
    )
    student = data
  } else if (phone) {
    const normalizedPhone = normalizePhone(phone)
    const buildQuery = (scoped: boolean) => {
      let query = db.from('students').select('id,name').eq('phone', normalizedPhone)
      if (scoped) {
        query = query.in('division', scope)
      }
      if (name) query = query.eq('name', normalizeName(name))
      return query.maybeSingle()
    }
    const { data } = await withDivisionFallback(
      () => buildQuery(true),
      () => buildQuery(false),
    )
    student = data
  }

  if (!student) {
    return NextResponse.json({ error: '학생을 찾을 수 없습니다.' }, { status: 404 })
  }

  try {
    const result = await distributeMaterial({
      studentId: student.id,
      materialId,
      distributedBy: '빠른 배부',
    })

    if (!result.success) {
      const messages: Record<string, string> = {
        already_distributed: '이미 배부한 자료입니다.',
        material_inactive: '비활성화된 자료입니다.',
      }

      return NextResponse.json(
        { error: messages[result.reason ?? ''] ?? '배부 처리에 실패했습니다.' },
        { status: 409 },
      )
    }

    return NextResponse.json({
      success: true,
      student_name: result.student_name,
      material_name: result.material_name,
    })
  } catch {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
