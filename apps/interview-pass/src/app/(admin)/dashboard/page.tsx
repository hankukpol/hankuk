export const dynamic = 'force-dynamic'

import ConfigFeatureDisabled from '@/app/(admin)/dashboard/config/_components/ConfigFeatureDisabled'
import { getAppConfig } from '@/lib/app-config'
import { withDivisionFallback, withStudentStatusFallback } from '@/lib/division-compat'
import { getScopedDivisionValues } from '@/lib/division-scope'
import { ACTIVE_STUDENT_STATUS } from '@/lib/student-status'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import { getTodayKey } from '@/lib/utils'

const CHART_HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]

async function getStats() {
  const db = createServerClient()
  const division = await getServerTenantType()
  const scope = getScopedDivisionValues(division)
  const today = getTodayKey()

  const results = (await Promise.all([
    withStudentStatusFallback(
      () =>
        withDivisionFallback(
          () =>
            db
              .from('students')
              .select('id')
              .in('division', scope)
              .eq('status', ACTIVE_STUDENT_STATUS),
          () =>
            db
              .from('students')
              .select('id')
              .eq('status', ACTIVE_STUDENT_STATUS),
        ),
      () =>
        withDivisionFallback(
          () =>
            db
              .from('students')
              .select('id')
              .in('division', scope),
          () =>
            db
              .from('students')
              .select('id'),
        ),
    ),
    withDivisionFallback(
      () => db.from('materials').select('id,name,is_active').in('division', scope).order('sort_order'),
      () => db.from('materials').select('id,name,is_active').order('sort_order'),
    ),
    withDivisionFallback(
      () => db.from('distribution_logs').select('material_id, student_id, distributed_at').in('division', scope),
      () => db.from('distribution_logs').select('material_id, student_id, distributed_at'),
    ),
    withDivisionFallback(
      () =>
        db
          .from('distribution_logs')
          .select('student_id, distributed_at')
          .in('division', scope)
          .gte('distributed_at', `${today}T00:00:00+09:00`),
      () =>
        db
          .from('distribution_logs')
          .select('student_id, distributed_at')
          .gte('distributed_at', `${today}T00:00:00+09:00`),
    ),
  ])) as Array<{
    count?: number | null
    data?: Array<Record<string, unknown>> | null
    error?: { message?: string } | null
  }>

  const [
    { data: activeStudents, error: activeStudentsError },
    { data: materials, error: materialsError },
    { data: allDistLogs, error: allDistLogsError },
    { data: todayLogsDetailed, error: todayLogsDetailedError },
  ] = results

  if (
    activeStudentsError ||
    materialsError ||
    allDistLogsError ||
    todayLogsDetailedError
  ) {
    throw new Error('Failed to load dashboard stats')
  }

  const materialRows = (materials ?? []) as Array<{ id: number; name: string; is_active: boolean }>
  const distributionRows = (allDistLogs ?? []) as Array<{ material_id: number; student_id: string; distributed_at: string }>
  const todayDistributionRows = (todayLogsDetailed ?? []) as Array<{ student_id: string; distributed_at: string }>
  const activeStudentIds = new Set(
    ((activeStudents ?? []) as Array<{ id: string }>).map((student) => student.id),
  )
  const totalStudents = activeStudentIds.size

  const materialStudentMap: Record<number, Set<string>> = {}
  for (const row of distributionRows) {
    if (!activeStudentIds.has(row.student_id)) {
      continue
    }
    if (!materialStudentMap[row.material_id]) materialStudentMap[row.material_id] = new Set()
    materialStudentMap[row.material_id].add(row.student_id)
  }

  const matCountMap: Record<number, number> = {}
  for (const [materialId, students] of Object.entries(materialStudentMap)) {
    matCountMap[Number(materialId)] = students.size
  }

  const activeMaterialIds = materialRows
    .filter((material) => material.is_active)
    .map((material) => material.id)
  const studentReceivedMap: Record<string, Set<number>> = {}
  for (const row of distributionRows) {
    if (!activeStudentIds.has(row.student_id)) {
      continue
    }
    if (activeMaterialIds.includes(row.material_id)) {
      if (!studentReceivedMap[row.student_id]) studentReceivedMap[row.student_id] = new Set()
      studentReceivedMap[row.student_id].add(row.material_id)
    }
  }

  const completedCount =
    activeMaterialIds.length > 0
      ? Object.values(studentReceivedMap).filter((received) => activeMaterialIds.every((id) => received.has(id))).length
      : 0

  const hourMap: Record<number, number> = {}
  const filteredDistributionRows = distributionRows.filter((row) => activeStudentIds.has(row.student_id))
  const filteredTodayDistributionRows = todayDistributionRows.filter((row) => activeStudentIds.has(row.student_id))
  const todayLogs = filteredTodayDistributionRows.length

  for (const log of filteredTodayDistributionRows) {
    const hour = Number(
      new Date(log.distributed_at).toLocaleString('en-US', {
        timeZone: 'Asia/Seoul',
        hour: 'numeric',
        hour12: false,
      }),
    )
    hourMap[hour] = (hourMap[hour] ?? 0) + 1
  }

  const totalLogs = filteredDistributionRows.length

  return { totalStudents, totalLogs, todayLogs, materials: materialRows, matCountMap, completedCount, hourMap }
}

export default async function DashboardPage() {
  const config = await getAppConfig()
  if (!config.admin_dashboard_overview_enabled) {
    return (
      <ConfigFeatureDisabled
        title="관리자 대시보드 기능이 꺼져 있습니다."
        description="이 지점에서는 통계 요약 대시보드와 운영 현황 카드가 비활성화되어 있습니다. 기능 설정에서 다시 켜면 즉시 복구됩니다."
      />
    )
  }

  let stats: Awaited<ReturnType<typeof getStats>>
  try {
    stats = await getStats()
  } catch {
    return (
      <div className="border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        대시보드 통계를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
      </div>
    )
  }

  const { totalStudents, totalLogs, todayLogs, materials, matCountMap, completedCount, hourMap } = stats
  const total = totalStudents ?? 0
  const maxHourCount = Math.max(...CHART_HOURS.map((hour) => hourMap[hour] ?? 0), 1)
  const completedPct = total > 0 ? Math.round((completedCount / total) * 100) : 0

  return (
    <div className="pb-10">
      <div className="mb-10">
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">관리자 대시보드</h1>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="relative flex h-full min-h-[140px] flex-col justify-center overflow-hidden border border-gray-200 bg-gray-50 p-5">
          <div className="absolute left-0 top-0 h-1 w-full bg-orange-400" />
          <p className="mb-2 text-[11px] font-bold tracking-wide text-gray-500">전체 학생</p>
          <div className="mt-auto flex items-baseline gap-1">
            <p className="text-4xl font-extrabold tracking-tight text-orange-600">{total}</p>
            <span className="text-sm font-bold text-gray-800">명</span>
          </div>
          <p className="mt-2 text-[10px] text-gray-400">등록된 전체 학생 수</p>
        </div>

        <div className="relative flex h-full min-h-[140px] flex-col justify-center overflow-hidden border border-cyan-200 bg-cyan-50/30 p-5">
          <div className="absolute left-0 top-0 h-1 w-full bg-cyan-500" />
          <p className="mb-2 text-[11px] font-bold tracking-wide text-gray-600">전체 배부</p>
          <div className="mt-auto flex items-baseline gap-1">
            <p className="text-4xl font-extrabold tracking-tight text-cyan-700">{totalLogs ?? 0}</p>
            <span className="text-sm font-bold text-gray-800">건</span>
          </div>
          <p className="mt-2 text-[10px] text-gray-500">누적 자료 배부 건수</p>
        </div>

        <div className="relative flex h-full min-h-[140px] flex-col justify-center overflow-hidden border border-blue-200 bg-blue-50 p-5">
          <div className="absolute left-0 top-0 h-1 w-full bg-blue-500" />
          <p className="mb-2 text-[11px] font-bold tracking-wide text-blue-800">오늘 배부</p>
          <div className="mt-auto flex items-baseline gap-1">
            <p className="text-4xl font-extrabold tracking-tighter text-blue-700">{todayLogs ?? 0}</p>
            <span className="text-sm font-bold text-blue-800">건</span>
          </div>
          <p className="mt-2 text-[10px] text-blue-600/80">오늘 자료를 배부한 건수</p>
        </div>

        <div className="relative flex h-full min-h-[140px] flex-col justify-center overflow-hidden border border-green-200 bg-green-50 p-5">
          <div className="absolute left-0 top-0 h-1 w-full bg-green-500" />
          <p className="mb-2 text-[11px] font-bold tracking-wide text-green-800">전체 수령 완료</p>
          <div className="mt-auto flex items-baseline gap-1">
            <p className="text-4xl font-extrabold tracking-tighter text-green-700">{completedCount}</p>
            <span className="text-sm font-bold text-green-800">명</span>
          </div>
          <p className="mt-2 text-[10px] text-green-600/80">
            전체 {total}명 중 {completedPct}%
          </p>
        </div>
      </div>

      <div className="mb-6 border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-200 p-4 sm:p-5">
          <div>
            <h2 className="text-sm font-bold text-gray-900">시간대별 배부 현황</h2>
            <p className="mt-0.5 hidden text-[11px] text-gray-500 sm:block">오늘 시간대별 자료 배부 건수</p>
          </div>
          <div className="border border-gray-200 bg-gray-50 px-2.5 py-1 text-[10px] font-medium text-gray-600">
            오늘 총 {todayLogs ?? 0}건
          </div>
        </div>
        <div className="px-5 pb-4 pt-5">
          {(todayLogs ?? 0) === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">오늘 배부 기록이 없습니다.</p>
          ) : (
            <div className="flex items-end gap-1" style={{ height: '120px' }}>
              {CHART_HOURS.map((hour) => {
                const count = hourMap[hour] ?? 0
                const pct = Math.round((count / maxHourCount) * 100)
                return (
                  <div key={hour} className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
                    <span
                      className={`text-[9px] font-bold leading-none ${
                        count > 0 ? 'text-blue-700' : 'text-transparent'
                      }`}
                    >
                      {count > 0 ? count : '0'}
                    </span>
                    <div className="relative flex-1 w-full">
                      <div
                        className={`absolute bottom-0 left-0 right-0 ${count > 0 ? 'bg-blue-500' : 'bg-gray-100'}`}
                        style={{ height: count > 0 ? `${Math.max(pct, 6)}%` : '3px' }}
                      />
                    </div>
                    <span className="mt-0.5 text-[8px] leading-none text-gray-400">{hour}시</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="mb-6 border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-200 p-4 sm:p-5">
          <div>
            <h2 className="text-sm font-bold text-gray-900">자료별 수령 현황</h2>
            <p className="mt-0.5 hidden text-[11px] text-gray-500 sm:block">각 자료의 누적 수령 인원을 확인합니다.</p>
          </div>
          <div className="border border-gray-200 bg-gray-50 px-2.5 py-1 text-[10px] font-medium text-gray-600">
            총 {materials.filter((material) => material.is_active).length}개 활성 자료
          </div>
        </div>
        <div className="p-5 sm:p-6">
          <div className="grid grid-cols-1 gap-x-10 gap-y-7 md:grid-cols-2">
            {materials
              .filter((material) => material.is_active)
              .map((material) => {
                const count = matCountMap[material.id] ?? 0
                const pct = total > 0 ? Math.round((count / total) * 100) : 0
                return (
                  <div key={material.id} className="group">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm font-bold text-gray-800">
                        <span className="inline-block h-1 w-1 bg-blue-500" />
                        {material.name}
                      </span>
                      <span className="flex items-center gap-2 text-[11px]">
                        <span className="font-bold text-gray-900">{count}</span>
                        <span className="text-gray-400">/ {total}명</span>
                        <span className="ml-1 bg-blue-50 px-1.5 py-0.5 font-bold text-blue-700">{pct}%</span>
                      </span>
                    </div>
                    <div className="relative h-1.5 w-full overflow-hidden bg-gray-100">
                      <div
                        className="absolute left-0 top-0 h-full bg-blue-500 transition-all duration-700 ease-out"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
          </div>

          {materials.filter((material) => !material.is_active).length > 0 ? (
            <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-5">
              <p className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-gray-400">비활성 자료</p>
              <div className="flex flex-wrap gap-1.5">
                {materials
                  .filter((material) => !material.is_active)
                  .map((material) => (
                    <span
                      key={material.id}
                      className="border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] text-gray-400"
                    >
                      {material.name}
                    </span>
                  ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
