import 'server-only'

import { createServerClient } from '@/lib/supabase/server'
import { unwrapSupabaseResult } from '@/lib/supabase/result'
import type { TenantType } from '@/lib/tenant'
import { getTodayKey } from '@/lib/utils'

export type DashboardStats = {
  totalStudents: number
  todayDistributions: number
  totalDistributions: number
  completionRate: number
  hourlyDistributions: { hour: number; count: number }[]
  materialStats: { id: number; name: string; total: number; received: number; rate: number }[]
}

type DistributionHourlyRow = {
  hour: number | null
  count: number | null
}

type MaterialProgressRow = {
  material_id: number
  material_name: string
  total_students: number | null
  received_students: number | null
}

export async function getDashboardStats(division: TenantType): Promise<DashboardStats> {
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
    return {
      totalStudents: 0,
      todayDistributions: 0,
      totalDistributions: 0,
      completionRate: 0,
      hourlyDistributions: [],
      materialStats: [],
    }
  }

  const enrollmentsResult = await db
    .from('enrollments')
    .select('id')
    .in('course_id', courseIds)
    .eq('status', 'active')

  const enrollmentRows = (unwrapSupabaseResult(
    'dashboardStats.enrollments',
    enrollmentsResult,
  ) ?? []) as Array<{ id: number }>
  const enrollmentIds = enrollmentRows.map((enrollment) => enrollment.id)

  const todayKey = getTodayKey('Asia/Seoul')
  const [hourlyRowsResult, materialProgressResult, totalDistributionsResult] = await Promise.all([
    db.rpc('get_distribution_hourly_counts', {
      p_division: division,
      p_day: todayKey,
    }),
    db.rpc('get_material_distribution_progress', {
      p_division: division,
    }),
    enrollmentIds.length === 0
      ? Promise.resolve({ count: 0, data: null, error: null })
      : db
        .from('distribution_logs')
        .select('id', { head: true, count: 'exact' })
        .in('enrollment_id', enrollmentIds),
  ])

  const hourlyRows = (unwrapSupabaseResult(
    'dashboardStats.hourlyCounts',
    hourlyRowsResult,
  ) ?? []) as DistributionHourlyRow[]
  const materialProgressRows = (unwrapSupabaseResult(
    'dashboardStats.materialProgress',
    materialProgressResult,
  ) ?? []) as MaterialProgressRow[]
  unwrapSupabaseResult('dashboardStats.totalDistributions', totalDistributionsResult)

  if (enrollmentIds.length === 0) {
    return {
      totalStudents: 0,
      todayDistributions: 0,
      totalDistributions: 0,
      completionRate: 0,
      hourlyDistributions: Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 })),
      materialStats: materialProgressRows.map((row) => ({
        id: row.material_id,
        name: row.material_name,
        total: Number(row.total_students ?? 0),
        received: 0,
        rate: 0,
      })),
    }
  }

  const hourlyMap = new Map<number, number>()
  for (const row of hourlyRows) {
    const hour = Number(row.hour ?? 0)
    hourlyMap.set(hour, Number(row.count ?? 0))
  }

  const hourlyDistributions = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: hourlyMap.get(hour) ?? 0,
  }))

  const materialStats = materialProgressRows.map((row) => {
    const total = Number(row.total_students ?? 0)
    const received = Number(row.received_students ?? 0)

    return {
      id: row.material_id,
      name: row.material_name,
      total,
      received,
      rate: total > 0 ? Math.round((received / total) * 100) : 0,
    }
  })

  const totalPossible = materialStats.reduce((sum, material) => sum + material.total, 0)
  const receivedTotal = materialStats.reduce((sum, material) => sum + material.received, 0)

  return {
    totalStudents: enrollmentRows.length,
    todayDistributions: hourlyDistributions.reduce((sum, row) => sum + row.count, 0),
    totalDistributions: totalDistributionsResult.count ?? 0,
    completionRate: totalPossible > 0
      ? Math.round((receivedTotal / totalPossible) * 100)
      : 0,
    hourlyDistributions,
    materialStats,
  }
}
