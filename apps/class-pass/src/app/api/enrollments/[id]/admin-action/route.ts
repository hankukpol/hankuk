import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdminRequest } from '@/lib/auth/authenticate'
import { getActorStaffId } from '@/lib/auth/actor'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { getServerTenantType } from '@/lib/tenant.server'
import { createServerClient } from '@/lib/supabase/server'
import { invalidateCache } from '@/lib/cache/revalidate'
import { handleRouteError } from '@/lib/api/error-response'
import { enrollmentAdminActionSchema, type EnrollmentAdminPreview } from '@/lib/enrollments/admin-action'

type Context = { params: Promise<{ id: string }> }
const businessMessages = new Set([
  '종료 또는 환불된 수강생만 재개할 수 있습니다. 숨긴 명단은 먼저 복원해 주세요.',
  '운영 중인 강좌에서만 재개할 수 있습니다.',
  '같은 학생 또는 연락처의 수강중인 등록이 있습니다.',
  '이미 숨긴 수강생입니다.',
  '숨긴 명단이 아닙니다.',
  '실제 이용·환불·정산 또는 연결 이력이 있어 완전 삭제할 수 없습니다. 명단 숨김을 이용해 주세요.',
])
function failure(error: { code?: string; message?: string }) {
  const status = error.code === 'P0002' ? 404
    : error.code === '22023' ? 400
      : ['P0001', '40001', 'CP003', '23503', '23505'].includes(error.code ?? '') ? 409 : 500
  const message = error.code === '40001' ? '기록이나 요청이 변경되었습니다. 창을 닫고 다시 확인해 주세요.'
    : error.code === 'P0002' ? '수강생을 찾을 수 없습니다.'
      : error.code === 'P0001' && businessMessages.has(error.message ?? '') ? error.message
        : status === 409 ? '연결된 기록이나 중복 등록이 있어 처리하지 못했습니다. 명단 숨김을 이용하거나 기존 이력을 확인해 주세요.'
          : '수강 관리 작업을 처리하지 못했습니다. 잠시 후 다시 확인해 주세요.'
  return NextResponse.json({ error: message }, { status })
}

async function authorize(req: NextRequest, context: Context) {
  const auth = await authenticateAdminRequest(req)
  if (auth.error) return { error: auth.error } as const
  const feature = await requireAppFeature('admin_student_management_enabled')
  if (feature) return { error: feature } as const
  const id = Number((await context.params).id)
  if (!Number.isSafeInteger(id) || id <= 0) return { error: NextResponse.json({ error: '수강생을 확인해 주세요.' }, { status: 400 }) } as const
  return { id, division: await getServerTenantType(), actor: getActorStaffId(auth.payload), db: createServerClient() }
}

export async function GET(req: NextRequest, context: Context) {
  try {
    const ctx = await authorize(req, context)
    if (ctx.error) return ctx.error
    const { data, error } = await ctx.db.rpc('enrollment_admin_action_preview', { p_division: ctx.division, p_enrollment_id: ctx.id })
    if (error) return failure(error)
    // Internal table names are not useful to the administrator.
    const preview = { ...data }
    delete preview.blockers
    return NextResponse.json({ preview }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return handleRouteError('enrollment.admin-action.get', '수강 관리 정보를 불러오지 못했습니다.', error) }
}

export async function POST(req: NextRequest, context: Context) {
  try {
    const ctx = await authorize(req, context)
    if (ctx.error) return ctx.error
    const parsed = enrollmentAdminActionSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: '작업 사유와 삭제 확인 항목을 확인해 주세요.' }, { status: 400 })
    const input = parsed.data
    if (input.action === 'purge') {
      const prior = await ctx.db.from('enrollment_admin_actions').select('request_id').eq('request_id', input.requestId).eq('division', ctx.division).eq('enrollment_id', ctx.id).maybeSingle()
      if (prior.error) return failure(prior.error)
      if (!prior.data) {
        const { data, error } = await ctx.db.rpc('enrollment_admin_action_preview', { p_division: ctx.division, p_enrollment_id: ctx.id })
        if (error) return failure(error)
        const preview = data as EnrollmentAdminPreview
        if (input.confirmText.trim() !== `${preview.examNumber} ${preview.name}`.trim()) {
          return NextResponse.json({ error: '삭제할 응시번호와 이름을 정확하게 입력해 주세요.' }, { status: 400 })
        }
      }
    }
    const { data, error } = await ctx.db.rpc('manage_enrollment_atomic', {
      p_division: ctx.division, p_enrollment_id: ctx.id, p_action: input.action, p_reason: input.reason,
      p_request_id: input.requestId, p_revision: input.revision, p_actor_staff_id: ctx.actor,
    })
    if (error) return failure(error)
    let refreshRequired = false
    try { await invalidateCache('enrollments') } catch { refreshRequired = true }
    return NextResponse.json({ result: data, refreshRequired })
  } catch (error) { return handleRouteError('enrollment.admin-action.post', '작업 결과를 확인하지 못했습니다. 내용을 바꾸지 말고 다시 확인해 주세요.', error) }
}
