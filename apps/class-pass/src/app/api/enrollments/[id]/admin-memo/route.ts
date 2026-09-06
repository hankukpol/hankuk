import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateAdminRequest } from '@/lib/auth/authenticate'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import { adminMemoDeleteSchema, adminMemoSaveSchema } from '@/lib/enrollment-admin-memo'
import { handleRouteError } from '@/lib/api/error-response'

const idSchema = z.coerce.number().int().positive().safe()
const columns = 'enrollment_id,body,revision,created_at,updated_at'
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
type Context = { params: Promise<{id:string}> }

async function handle(req: NextRequest, context: Context, method: 'GET'|'PUT'|'DELETE') {
  try {
    const auth = await authenticateAdminRequest(req)
    if (auth.error) return auth.error
    const featureError = await requireAppFeature('admin_student_management_enabled')
    if (featureError) return featureError
    const id = idSchema.safeParse((await context.params).id)
    const raw = method !== 'GET' ? await req.json().catch(()=>null) : null
    const deletion = method === 'DELETE' ? adminMemoDeleteSchema.safeParse(raw) : null
    const input = method === 'PUT' ? adminMemoSaveSchema.safeParse(raw) : null
    if (!id.success || (input && !input.success)) return json({error:'메모와 강좌 정보를 확인해 주세요. 메모는 1~2,000자까지 입력할 수 있습니다.'},400)
    const value = input?.success ? input.data : null
    if (deletion && !deletion.success) return json({error:'삭제할 메모를 다시 확인해 주세요.'},400)
    if (value && value.expectedRevision !== null && !value.expectedCreatedAt) return json({error:'최신 메모를 다시 불러와 주세요.'},400)
    const courseId = idSchema.safeParse(value?.courseId ?? (deletion?.success ? deletion.data.courseId : req.nextUrl.searchParams.get('courseId')))
    if (!courseId.success) return json({error:'강좌 정보가 올바르지 않습니다.'},400)

    const division = await getServerTenantType()
    const db = createServerClient()
    const owner = await db.from('enrollments').select('id,courses!inner(division)')
      .eq('id',id.data).eq('course_id',courseId.data).eq('courses.division',division).maybeSingle()
    if (owner.error) throw owner.error
    if (!owner.data) return json({error:'해당 강좌의 수강생을 찾을 수 없습니다.'},404)

    if (deletion?.success) {
      const result = await db.from('enrollment_admin_memos').delete()
        .eq('enrollment_id',id.data).eq('revision',deletion.data.expectedRevision)
        .eq('created_at',deletion.data.expectedCreatedAt).select('enrollment_id').maybeSingle()
      if (result.error) throw result.error
      if (!result.data) return json({error:'메모가 변경되었거나 이미 삭제되었습니다. 최신 메모를 확인해 주세요.',code:'MEMO_CONFLICT'},409)
      return json({memo:null})
    }
    if (!value) {
      const result = await db.from('enrollment_admin_memos').select(columns).eq('enrollment_id',id.data).maybeSingle()
      if (result.error) throw result.error
      return json({memo:result.data})
    }
    const actor = auth.payload?.adminId ?? auth.payload?.sub
    if (!actor) return json({error:'관리자 인증을 다시 확인해 주세요.'},401)
    const result = value.expectedRevision === null
      ? await db.from('enrollment_admin_memos').insert({enrollment_id:id.data,body:value.body,created_by:actor,updated_by:actor}).select(columns).single()
      : await db.from('enrollment_admin_memos').update({body:value.body,updated_by:actor})
        .eq('enrollment_id',id.data).eq('revision',value.expectedRevision).eq('created_at',value.expectedCreatedAt!).select(columns).maybeSingle()
    if (result.error?.code === '23505' || (!result.error && !result.data)) {
      return json({error:'다른 관리자가 메모를 변경했습니다. 최신 메모를 확인한 뒤 다시 저장해 주세요.',code:'MEMO_CONFLICT'},409)
    }
    if (result.error) throw result.error
    return json({memo:result.data})
  } catch (error) {
    const response = handleRouteError('enrollment.adminMemo', '메모를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.', error)
    response.headers.set('Cache-Control','private, no-store')
    return response
  }
}

export const GET = (req:NextRequest, context:Context) => handle(req,context,'GET')
export const PUT = (req:NextRequest, context:Context) => handle(req,context,'PUT')
export const DELETE = (req:NextRequest, context:Context) => handle(req,context,'DELETE')
export const dynamic = 'force-dynamic'
