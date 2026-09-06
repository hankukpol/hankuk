import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateAdminRequest } from '@/lib/auth/authenticate'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import { handleRouteError } from '@/lib/api/error-response'

const idSchema = z.coerce.number().int().positive().safe()
const json = (body:unknown,status=200) => NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}})

/** Only the visible roster page; never attach administrator notes to public student payloads. */
export async function GET(req:NextRequest,context:{params:Promise<{id:string}>}) {
  try {
    const auth=await authenticateAdminRequest(req)
    if(auth.error)return auth.error
    const featureError=await requireAppFeature('admin_student_management_enabled')
    if(featureError)return featureError
    const courseId=idSchema.safeParse((await context.params).id)
    const ids=z.array(idSchema).min(1).max(100).safeParse(req.nextUrl.searchParams.get('ids')?.split(','))
    if(!courseId.success || !ids.success)return json({error:'강좌와 수강생 목록을 확인해 주세요.'},400)
    const division=await getServerTenantType()
    const db=createServerClient()
    const course=await db.from('courses').select('id').eq('id',courseId.data).eq('division',division).maybeSingle()
    if(course.error)throw course.error
    if(!course.data)return json({error:'강좌를 찾을 수 없습니다.'},404)
    const result=await db.from('enrollment_admin_memos')
      .select('enrollment_id,body,revision,created_at,updated_at,enrollments!inner(course_id)')
      .eq('enrollments.course_id',courseId.data).in('enrollment_id',[...new Set(ids.data)])
    if(result.error)throw result.error
    return json({memos:(result.data??[]).map(({enrollment_id,body,revision,created_at,updated_at})=>({enrollment_id,body,revision,created_at,updated_at}))})
  } catch(error) {
    const response=handleRouteError('enrollment.adminMemos','메모 목록을 불러오지 못했습니다.',error)
    response.headers.set('Cache-Control','private, no-store')
    return response
  }
}
export const dynamic='force-dynamic'
