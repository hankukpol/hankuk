'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTenantConfig } from '@/components/TenantProvider'
import { withTenantPrefix } from '@/lib/tenant'

type PendingSummary = {
  total: number
  birth_date_ready_count?: number
  pin_required_count?: number
}

type GeneratedPin = {
  name: string
  phone: string
  pin: string
}

type SetupResult = {
  total: number
  birth_date_count: number
  pin_count: number
  generated_pins: GeneratedPin[]
}

function escapeCsvValue(value: string) {
  return `"${value.replace(/"/g, '""')}"`
}

function formatDateLabel(date: Date) {
  return date.toISOString().slice(0, 10)
}

function downloadPinsCsv(division: string, entries: GeneratedPin[]) {
  const lines = [
    ['이름', '전화번호', 'PIN'].map(escapeCsvValue).join(','),
    ...entries.map((entry) => [entry.name, entry.phone, entry.pin].map(escapeCsvValue).join(',')),
  ]

  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `student_pins_${division}_${formatDateLabel(new Date())}.csv`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export default function StudentAuthSetupPage() {
  const tenant = useTenantConfig()
  const [summary, setSummary] = useState<PendingSummary | null>(null)
  const [result, setResult] = useState<SetupResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const pendingCount = summary?.total ?? 0

  const loadSummary = useCallback(async () => {
    const response = await fetch(
      withTenantPrefix(`/api/students/bulk-setup-auth?division=${tenant.type}`, tenant.type),
      { cache: 'no-store' },
    )
    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      throw new Error(payload?.error ?? '인증 미설정 학생 현황을 불러오지 못했습니다.')
    }

    setSummary(payload as PendingSummary)
  }, [tenant.type])

  useEffect(() => {
    loadSummary()
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : '인증 미설정 학생 현황을 불러오지 못했습니다.')
      })
      .finally(() => setLoading(false))
  }, [loadSummary])

  const resultSummary = useMemo(() => {
    if (!result) {
      return null
    }

    return [
      { label: '생년월일 인증 적용', value: result.birth_date_count, tone: 'text-blue-700 bg-blue-50 border-blue-100' },
      { label: 'PIN 발급', value: result.pin_count, tone: 'text-violet-700 bg-violet-50 border-violet-100' },
    ]
  }, [result])

  async function runBulkSetup() {
    if (pendingCount === 0) {
      setMessage('인증 미설정 학생이 없습니다.')
      return
    }

    const confirmed = window.confirm(`${pendingCount}명의 학생에게 인증을 설정합니다. 계속하시겠습니까?`)
    if (!confirmed) {
      return
    }

    setRunning(true)
    setMessage('')
    setError('')

    try {
      const response = await fetch(withTenantPrefix('/api/students/bulk-setup-auth', tenant.type), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ division: tenant.type }),
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(payload?.error ?? '학생 인증 정보를 일괄 설정하지 못했습니다.')
      }

      const nextResult = payload as SetupResult
      setResult(nextResult)

      if (nextResult.total === 0) {
        setMessage('인증 설정이 필요한 학생이 없습니다.')
      } else {
        setMessage(
          `총 ${nextResult.total}명의 학생을 처리했습니다. 생년월일 인증 ${nextResult.birth_date_count}명, PIN 발급 ${nextResult.pin_count}명입니다.`,
        )
      }

      await loadSummary()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '학생 인증 정보를 일괄 설정하지 못했습니다.')
    } finally {
      setRunning(false)
    }
  }

  if (loading) {
    return <p className="py-12 text-center text-sm text-gray-400">불러오는 중입니다...</p>
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={withTenantPrefix('/dashboard', tenant.type)}
          className="text-xs font-semibold text-slate-400 hover:text-slate-600"
        >
          대시보드
        </Link>
        <h2 className="mt-2 text-xl font-extrabold text-gray-900">학생 인증 일괄 설정</h2>
        <p className="mt-1 text-sm text-gray-500">
          기존 학생 중 인증 방식이 비어 있는 학생에게 생년월일 인증 또는 PIN 인증을 한 번에 설정합니다.
        </p>
      </div>

      {error || message ? (
        <div className="rounded-2xl bg-white px-5 py-3 shadow-sm">
          {error ? <p className="text-sm text-red-500">{error}</p> : null}
          {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
        </div>
      ) : null}

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Pending Students</p>
            <p className="mt-2 text-3xl font-black text-slate-900">인증 미설정 학생: {pendingCount}명</p>
            <p className="mt-2 text-sm text-slate-500">
              생년월일 등록 학생 {summary?.birth_date_ready_count ?? 0}명, PIN 발급 필요 학생 {summary?.pin_required_count ?? 0}명
            </p>
          </div>
          <button
            type="button"
            onClick={() => void runBulkSetup()}
            disabled={running || pendingCount === 0}
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {running ? '일괄 설정 실행 중...' : '일괄 설정 실행'}
          </button>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-gray-700">실행 기준</h3>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm text-slate-600">
          <li>이미 인증 방식이 설정된 학생은 건너뜁니다.</li>
          <li>생년월일이 있으면 생년월일 인증으로 설정합니다.</li>
          <li>생년월일이 없으면 4자리 PIN을 새로 발급합니다.</li>
        </ul>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-700">실행 결과</h3>
            <p className="mt-1 text-sm text-slate-500">PIN은 이 화면에서만 확인 가능하므로 필요 시 바로 CSV로 다운로드하세요.</p>
          </div>
          {result && result.pin_count > 0 ? (
            <button
              type="button"
              onClick={() => downloadPinsCsv(tenant.type, result.generated_pins)}
              className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
            >
              PIN 목록 CSV 다운로드
            </button>
          ) : null}
        </div>

        {!result ? (
          <p className="mt-4 text-sm text-slate-400">아직 실행한 내역이 없습니다.</p>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {resultSummary?.map((item) => (
                <div key={item.label} className={`rounded-xl border px-4 py-3 ${item.tone}`}>
                  <p className="text-xs font-semibold">{item.label}</p>
                  <p className="mt-1 text-2xl font-black">{item.value}명</p>
                </div>
              ))}
            </div>

            {result.pin_count > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                    <tr>
                      <th className="px-4 py-3">이름</th>
                      <th className="px-4 py-3">전화번호</th>
                      <th className="px-4 py-3">PIN</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {result.generated_pins.map((entry) => (
                      <tr key={`${entry.name}-${entry.phone}-${entry.pin}`}>
                        <td className="px-4 py-3 font-semibold text-slate-900">{entry.name}</td>
                        <td className="px-4 py-3 text-slate-600">{entry.phone}</td>
                        <td className="px-4 py-3 font-mono text-base font-black tracking-[0.2em] text-slate-900">
                          {entry.pin}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-500">이번 실행에서 새로 발급된 PIN은 없습니다.</p>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
