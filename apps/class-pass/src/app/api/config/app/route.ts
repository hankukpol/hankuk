import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAppConfig, upsertAppConfig } from '@/lib/app-config'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { requireAdminApi } from '@/lib/auth/require-admin-api'

const patchSchema = z.object({
  branch_name: z.string().min(1).max(50).optional(),
  branch_track_type: z.enum(['police', 'fire']).optional(),
  branch_description: z.string().min(1).max(200).optional(),
  branch_admin_title: z.string().min(1).max(80).optional(),
  branch_series_label: z.string().min(1).max(20).optional(),
  branch_region_label: z.string().min(1).max(20).optional(),
  app_name: z.string().min(1).max(50).optional(),
  theme_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  student_login_enabled: z.boolean().optional(),
  student_courses_enabled: z.boolean().optional(),
  student_pass_enabled: z.boolean().optional(),
  staff_scan_enabled: z.boolean().optional(),
  admin_course_management_enabled: z.boolean().optional(),
  admin_student_management_enabled: z.boolean().optional(),
  admin_seat_management_enabled: z.boolean().optional(),
  admin_material_management_enabled: z.boolean().optional(),
  admin_log_view_enabled: z.boolean().optional(),
  admin_config_enabled: z.boolean().optional(),
})

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(await getAppConfig())
}

export async function PATCH(req: NextRequest) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const featureError = await requireAppFeature('admin_config_enabled')
  if (featureError) {
    return featureError
  }

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '지점 설정 요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  await upsertAppConfig(parsed.data)
  return NextResponse.json({ success: true })
}
