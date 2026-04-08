import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { verifyJwt, ADMIN_COOKIE, STAFF_COOKIE } from '@/lib/auth/jwt'
import { getDistributionActorLabel } from '@/lib/auth/session-actor'
import { withDivisionFallback, withStudentStatusFallback } from '@/lib/division-compat'
import { getScopedDivisionValues } from '@/lib/division-scope'
import { distributeMaterial } from '@/lib/distribution/materials'
import { ACTIVE_STUDENT_STATUS } from '@/lib/student-status'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import { normalizeName, normalizePhone } from '@/lib/utils'

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
    return NextResponse.json({ error: '?낅젰媛믪씠 ?щ컮瑜댁? ?딆뒿?덈떎.' }, { status: 400 })
  }

  const staffCookie = req.cookies.get(STAFF_COOKIE)?.value
  const adminCookie = req.cookies.get(ADMIN_COOKIE)?.value
  const payload = staffCookie
    ? await verifyJwt(staffCookie)
    : adminCookie
      ? await verifyJwt(adminCookie)
      : null
  const actorLabel = getDistributionActorLabel(payload)

  const { exam_number, name, phone, material_id: materialId } = parsed.data
  const db = createServerClient()
  const division = await getServerTenantType()
  const scope = getScopedDivisionValues(division)

  let student: { id: string; name: string } | null = null

  if (exam_number) {
    const { data } = await withStudentStatusFallback(
      () =>
        withDivisionFallback(
          () =>
            db
              .from('students')
              .select('id,name')
              .in('division', scope)
              .eq('status', ACTIVE_STUDENT_STATUS)
              .eq('exam_number', exam_number.trim())
              .maybeSingle(),
          () =>
            db
              .from('students')
              .select('id,name')
              .eq('status', ACTIVE_STUDENT_STATUS)
              .eq('exam_number', exam_number.trim())
              .maybeSingle(),
        ),
      () =>
        withDivisionFallback(
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
        ),
    )
    student = data
  } else if (phone) {
    const normalizedPhone = normalizePhone(phone)
    const buildQuery = (scoped: boolean) => {
      let query = db
        .from('students')
        .select('id,name')
        .eq('phone', normalizedPhone)
        .eq('status', ACTIVE_STUDENT_STATUS)

      if (scoped) {
        query = query.in('division', scope)
      }

      if (name) {
        query = query.eq('name', normalizeName(name))
      }

      return query.maybeSingle()
    }

    const { data } = await withStudentStatusFallback(
      () =>
        withDivisionFallback(
          () => buildQuery(true),
          () => buildQuery(false),
        ),
      () => {
        const buildLegacyQuery = (scoped: boolean) => {
          let query = db
            .from('students')
            .select('id,name')
            .eq('phone', normalizedPhone)

          if (scoped) {
            query = query.in('division', scope)
          }

          if (name) {
            query = query.eq('name', normalizeName(name))
          }

          return query.maybeSingle()
        }

        return withDivisionFallback(
          () => buildLegacyQuery(true),
          () => buildLegacyQuery(false),
        )
      },
    )
    student = data
  }

  if (!student) {
    return NextResponse.json(
      { error: '?섑뿕?앹쓣 李얠쓣 ???놁뒿?덈떎. ?섎텋 ?섏씠?댁? ?뺤씤??二쇱꽭??' },
      { status: 404 },
    )
  }

  try {
    const result = await distributeMaterial({
      studentId: student.id,
      materialId,
      distributedBy: actorLabel,
    })

    if (!result.success) {
      const messages: Record<string, string> = {
        already_distributed: '?대? 諛곕????먮즺?낅땲??',
        material_inactive: '鍮꾪솢?깊솕???먮즺?낅땲??',
        student_not_found: '?섑뿕?앹쓣 李얠쓣 ???놁뒿?덈떎. ?섎텋 ?섏씠?댁? ?뺤씤??二쇱꽭??',
      }

      return NextResponse.json(
        { error: messages[result.reason ?? ''] ?? '諛곕? 泥섎━???ㅽ뙣?덉뒿?덈떎.' },
        { status: 409 },
      )
    }

    return NextResponse.json({
      success: true,
      student_name: result.student_name,
      material_name: result.material_name,
      distributed_by: actorLabel,
    })
  } catch {
    return NextResponse.json({ error: '?쒕쾭 ?ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.' }, { status: 500 })
  }
}
