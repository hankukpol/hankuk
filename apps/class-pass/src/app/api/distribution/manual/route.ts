import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { invalidateCache } from '@/lib/cache/revalidate'
import { verifyEnrollmentOwnership } from '@/lib/class-pass-data'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'

const schema = z.object({
  enrollmentId: z.number().int().positive(),
  materialId: z.number().int().positive().optional(),
  materialIds: z.array(z.number().int().positive()).optional(),
}).refine((value) => value.materialId != null || (value.materialIds?.length ?? 0) > 0, {
  message: '배부할 자료가 필요합니다.',
})

type DistributionResult = {
  success: boolean
  reason?: string
  log_id?: number | string | null
  material_name?: string
  student_name?: string
}

export async function POST(req: NextRequest) {
  try {
    const authError = await requireAdminApi(req)
    if (authError) return authError

    const featureError = await requireAppFeature('admin_log_view_enabled')
    if (featureError) return featureError

    const body = await req.json().catch(() => null)
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    const ownership = await verifyEnrollmentOwnership(parsed.data.enrollmentId, division)
    if (!ownership.valid) {
      return NextResponse.json({ error: '수강생을 찾을 수 없습니다.' }, { status: 404 })
    }

    const db = createServerClient()
    const materialIds = Array.from(
      new Set([parsed.data.materialId, ...(parsed.data.materialIds ?? [])].filter((value): value is number => (
        typeof value === 'number' && Number.isInteger(value) && value > 0
      ))),
    )

    let successCount = 0
    let studentName: string | undefined
    const materialNames: string[] = []
    const failures: string[] = []
    const distributedLogs: Array<{ logId: number; materialId: number }> = []

    for (const materialId of materialIds) {
      const rpcResult = await db.rpc('distribute_material', {
        p_enrollment_id: parsed.data.enrollmentId,
        p_material_id: materialId,
      })

      if (rpcResult.error) {
        failures.push('자료 배부 처리에 실패했습니다.')
        continue
      }

      const result = rpcResult.data as DistributionResult | null
      if (!result?.success) {
        failures.push(result?.reason ?? '자료 배부 처리에 실패했습니다.')
        continue
      }

      successCount += 1
      studentName = result.student_name ?? studentName
      const logId = Number(result.log_id)
      if (Number.isInteger(logId) && logId > 0) {
        distributedLogs.push({ logId, materialId })
      }
      if (result.material_name) {
        materialNames.push(result.material_name)
      }
    }

    if (successCount === 0) {
      if (failures.includes('NOT_ASSIGNED')) {
        return NextResponse.json(
          { error: '해당 학생에게 배정되지 않은 교재입니다.' },
          { status: 400 },
        )
      }

      return NextResponse.json(
        { error: failures[0] ?? '자료 배부 처리에 실패했습니다.' },
        { status: failures.includes('자료 배부 처리에 실패했습니다.') ? 500 : 400 },
      )
    }

    await invalidateCache('distribution-logs')

    const logRows = distributedLogs.length > 0
      ? await db
        .from('distribution_logs')
        .select('id,material_id,distributed_at')
        .in('id', distributedLogs.map((log) => log.logId))
      : { data: [], error: null }

    const logRowMap = new Map(
      (logRows.data ?? []).map((row) => [Number(row.id), row]),
    )
    const distributedAtFallback = new Date().toISOString()

    return NextResponse.json({
      success: true,
      student_name: studentName,
      material_name: materialNames.length === 1 ? materialNames[0] : `${successCount}건`,
      material_names: materialNames,
      logs: distributedLogs.map((log) => {
        const row = logRowMap.get(log.logId)
        return {
          log_id: log.logId,
          material_id: Number(row?.material_id ?? log.materialId),
          distributed_at: typeof row?.distributed_at === 'string' ? row.distributed_at : distributedAtFallback,
        }
      }),
      success_count: successCount,
      failed_count: materialIds.length - successCount,
    })
  } catch (error) {
    return handleRouteError('distribution.manual.POST', '자료 배부 처리에 실패했습니다.', error)
  }
}
