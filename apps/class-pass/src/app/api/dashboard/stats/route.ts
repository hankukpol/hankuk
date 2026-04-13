import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { handleRouteError } from '@/lib/api/error-response'
import { createServerClient } from '@/lib/supabase/server'
import { unwrapSupabaseResult } from '@/lib/supabase/result'
import { getServerTenantType } from '@/lib/tenant.server'
import type { Enrollment, Material } from '@/types/database'
import { getTodayKey } from '@/lib/utils'

type DistributionStatsRow = {
  distributed_at: string
}

export async function GET(req: NextRequest) {
  try {
    const authError = await requireAdminApi(req)
    if (authError) {
      return authError
    }

    const division = await getServerTenantType()
    const db = createServerClient()

    const courses = unwrapSupabaseResult(
      'dashboardStats.courses',
      await db
        .from('courses')
        .select('id,name')
        .eq('division', division)
        .eq('status', 'active'),
    ) as Array<{ id: number; name: string }> | null

    const courseIds = (courses ?? []).map((course) => course.id)

    if (courseIds.length === 0) {
      return NextResponse.json({
        totalStudents: 0,
        todayDistributions: 0,
        totalDistributions: 0,
        completionRate: 0,
        hourlyDistributions: [],
        materialStats: [],
      })
    }

    const [enrollmentsResult, materialsResult] = await Promise.all([
      db
        .from('enrollments')
        .select('id,course_id,name')
        .in('course_id', courseIds)
        .eq('status', 'active'),
      db
        .from('materials')
        .select('id,name,course_id,is_active')
        .in('course_id', courseIds),
    ])

    const enrollmentRows = (unwrapSupabaseResult(
      'dashboardStats.enrollments',
      enrollmentsResult,
    ) ?? []) as Pick<Enrollment, 'id' | 'course_id' | 'name'>[]
    const materialRows = (unwrapSupabaseResult(
      'dashboardStats.materials',
      materialsResult,
    ) ?? []) as Pick<Material, 'id' | 'name' | 'course_id' | 'is_active'>[]

    const enrollmentIds = enrollmentRows.map((enrollment) => enrollment.id)
    const activeMaterials = materialRows.filter((material) => material.is_active)
    const activeMaterialIds = activeMaterials.map((material) => material.id)
    const enrollmentCountsByCourse = new Map<number, number>()

    for (const enrollment of enrollmentRows) {
      enrollmentCountsByCourse.set(
        enrollment.course_id,
        (enrollmentCountsByCourse.get(enrollment.course_id) ?? 0) + 1,
      )
    }

    const todayKey = getTodayKey('Asia/Seoul')
    const todayStart = new Date(`${todayKey}T00:00:00+09:00`)
    const tomorrowStart = new Date(todayStart)
    tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1)

    if (enrollmentIds.length === 0) {
      return NextResponse.json({
        totalStudents: 0,
        todayDistributions: 0,
        totalDistributions: 0,
        completionRate: 0,
        hourlyDistributions: Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 })),
        materialStats: activeMaterials.map((material) => ({
          id: material.id,
          name: material.name,
          total: 0,
          received: 0,
          rate: 0,
        })),
      })
    }

    const [todayLogsResult, totalDistributionsResult, activePairsResult] = await Promise.all([
      enrollmentIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : db
          .from('distribution_logs')
          .select('distributed_at')
          .in('enrollment_id', enrollmentIds)
          .gte('distributed_at', todayStart.toISOString())
          .lt('distributed_at', tomorrowStart.toISOString()),
      enrollmentIds.length === 0
        ? Promise.resolve({ data: null, error: null, count: 0 })
        : db
          .from('distribution_logs')
          .select('id', { head: true, count: 'exact' })
          .in('enrollment_id', enrollmentIds),
      activeMaterialIds.length === 0 || enrollmentIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : db
          .from('distribution_logs')
          .select('enrollment_id,material_id')
          .in('enrollment_id', enrollmentIds)
          .in('material_id', activeMaterialIds),
    ])

    const todayLogs = (unwrapSupabaseResult(
      'dashboardStats.todayLogs',
      todayLogsResult,
    ) ?? []) as DistributionStatsRow[]
    unwrapSupabaseResult('dashboardStats.totalDistributions', totalDistributionsResult)
    const activePairs = (unwrapSupabaseResult(
      'dashboardStats.activePairs',
      activePairsResult,
    ) ?? []) as Array<{ enrollment_id: number; material_id: number }>

    const hourlyMap = new Map<number, number>()
    for (const log of todayLogs) {
      const hour = Number(
        new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Seoul',
          hour: '2-digit',
          hour12: false,
        }).format(new Date(log.distributed_at)),
      )
      hourlyMap.set(hour, (hourlyMap.get(hour) ?? 0) + 1)
    }

    const hourlyDistributions = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      count: hourlyMap.get(hour) ?? 0,
    }))

    const receivedSet = new Set(activePairs.map((row) => `${row.enrollment_id}:${row.material_id}`))
    const receivedEnrollmentsByMaterial = new Map<number, Set<number>>()
    for (const row of activePairs) {
      if (!receivedEnrollmentsByMaterial.has(row.material_id)) {
        receivedEnrollmentsByMaterial.set(row.material_id, new Set<number>())
      }

      receivedEnrollmentsByMaterial.get(row.material_id)?.add(row.enrollment_id)
    }

    const materialStats = activeMaterials.map((material) => {
      const total = enrollmentCountsByCourse.get(material.course_id) ?? 0
      const received = receivedEnrollmentsByMaterial.get(material.id)?.size ?? 0

      return {
        id: material.id,
        name: material.name,
        total,
        received,
        rate: total > 0 ? Math.round((received / total) * 100) : 0,
      }
    })

    const totalPossible = enrollmentRows.length * activeMaterials.length
    const completionRate = totalPossible > 0
      ? Math.round((receivedSet.size / totalPossible) * 100)
      : 0

    return NextResponse.json({
      totalStudents: enrollmentRows.length,
      todayDistributions: todayLogs.length,
      totalDistributions: totalDistributionsResult.count ?? 0,
      completionRate,
      hourlyDistributions,
      materialStats,
    })
  } catch (error) {
    return handleRouteError('dashboard.stats.GET', '대시보드 통계를 불러오지 못했습니다.', error)
  }
}
