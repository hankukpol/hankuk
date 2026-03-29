'use client'

import { useEffect, useState, useCallback } from 'react'
import FeatureDisabledPanel from '@/components/FeatureDisabledPanel'
import { useAppConfig } from '@/hooks/use-app-config'

interface Stats {
  totalStudents: number
  byMaterial: { id: number; name: string; count: number }[]
}

export default function MonitorPage() {
  const { config, isLoading: isFeatureLoading } = useAppConfig()
  const [stats, setStats] = useState<Stats | null>(null)
  const [lastUpdated, setLastUpdated] = useState('')

  const fetchStats = useCallback(async () => {
    const res = await fetch('/api/monitor/stats', { cache: 'no-store' })
    if (!res.ok) throw new Error('monitor_stats_failed')

    const data: Stats = await res.json()
    setStats(data)
    setLastUpdated(new Date().toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' }))
  }, [])

  useEffect(() => {
    if (isFeatureLoading || !config.monitor_enabled) {
      return
    }

    void fetchStats().catch(() => {})
    const timer = setInterval(() => {
      void fetchStats().catch(() => {})
    }, 15000)

    return () => clearInterval(timer)
  }, [config.monitor_enabled, fetchStats, isFeatureLoading])

  const total = stats?.totalStudents ?? 0

  if (isFeatureLoading) {
    return <div className="py-16 text-center text-sm text-gray-500">기능 설정을 확인하는 중입니다...</div>
  }

  if (!config.monitor_enabled) {
    return (
      <FeatureDisabledPanel
        title="공개 모니터가 비활성화되어 있습니다."
        description="이 지점에서는 공개 배부 현황 모니터를 사용하지 않습니다. 기능 설정에서 다시 켜면 현황 화면과 모니터 API가 즉시 복구됩니다."
        fullPage
      />
    )
  }

  return (
    <div className="min-h-dvh bg-gray-950 p-8 text-white xl:p-16">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-sky-300 xl:text-4xl">
            자료 배부 현황
          </h1>
          <div className="text-right">
            <div className="text-4xl font-bold text-white xl:text-5xl">{total}</div>
            <div className="mt-1 text-sm text-gray-400">전체 학생 수</div>
            <div className="mt-1 text-xs text-gray-600">업데이트: {lastUpdated}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {stats?.byMaterial.map((material) => {
            const percentage = total > 0 ? (material.count / total) * 100 : 0
            const remaining = total - material.count

            return (
              <div key={material.id} className="border border-gray-800 bg-gray-900 p-6">
                <div className="mb-4 flex items-start justify-between">
                  <h2 className="text-lg font-bold text-white">{material.name}</h2>
                  <span
                    className="text-3xl font-bold"
                    style={{ color: percentage >= 100 ? '#4caf50' : '#90caf9' }}
                  >
                    {Math.round(percentage)}%
                  </span>
                </div>
                <div className="mb-3 h-3 w-full bg-gray-800">
                  <div
                    className="h-3 transition-all duration-1000"
                    style={{
                      width: `${percentage}%`,
                      background: percentage >= 100 ? '#4caf50' : '#1565c0',
                    }}
                  />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-green-400">{material.count}명 배부</span>
                  <span className="text-gray-500">{remaining}명 남음</span>
                </div>
              </div>
            )
          })}
        </div>

        {!stats ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          </div>
        ) : null}
      </div>
    </div>
  )
}
