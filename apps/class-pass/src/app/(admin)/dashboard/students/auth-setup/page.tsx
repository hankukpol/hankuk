'use client'

import { getUserErrorMessage } from '@/lib/user-error-message'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ConfirmationModal } from '@/components/admin/confirmation-modal'
import { useTenantConfig } from '@/components/TenantProvider'
import { withTenantPrefix } from '@/lib/tenant'

type PendingSummary = {
  total: number
  birth_date_ready_count?: number
  pin_required_count?: number
  missing_birth_date_courses?: MissingBirthDateCourse[]
}

type MissingBirthDateStudent = {
  enrollment_id: number
  student_id: number | null
  name: string
  phone: string
  exam_number: string | null
  auth_method: 'birth_date' | 'pin' | null
}

type MissingBirthDateCourse = {
  course_id: number
  course_name: string
  course_status: 'active' | 'archived'
  missing_birth_date_count: number
  students: MissingBirthDateStudent[]
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

function getAuthMethodLabel(method: MissingBirthDateStudent['auth_method']) {
  if (method === 'birth_date') {
    return '생년월일 인증'
  }

  if (method === 'pin') {
    return 'PIN 인증'
  }

  return '인증 미설정'
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
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const pendingCount = summary?.total ?? 0
  const missingBirthDateCourses = summary?.missing_birth_date_courses ?? []
  const missingBirthDateCount = missingBirthDateCourses.reduce(
    (sum, course) => sum + course.missing_birth_date_count,
    0,
  )
  const hasOnlyMissingBirthDateStudents = pendingCount === 0 && missingBirthDateCount > 0

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

  function requestBulkSetup() {
    if (pendingCount === 0) {
      setMessage('인증 미설정 학생이 없습니다.')
      return
    }

    setConfirmOpen(true)
  }

  async function runBulkSetup() {
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
      setConfirmOpen(false)
    }
  }

  if (loading) {
    return <p className="py-12 text-center text-sm text-gray-400">불러오는 중입니다...</p>
  }

  return (
    <>
    <ConfirmationModal
      open={confirmOpen}
      title="학생 인증을 일괄 설정할까요?"
      description={`${pendingCount}명의 학생에게 생년월일 인증 또는 PIN 인증을 설정합니다. 새로 발급되는 PIN은 실행 직후에만 확인할 수 있습니다.`}
      confirmLabel="일괄 설정"
      pendingLabel="설정 중..."
      submitting={running}
      onClose={() => {
        if (!running) {
          setConfirmOpen(false)
        }
      }}
      onConfirm={() => {
        void runBulkSetup()
      }}
    />
    <div className="admin-flat-page flex flex-col gap-6">
      <div>
        <Link
          href={withTenantPrefix('/dashboard', tenant.type)}
          className="text-xs font-semibold text-slate-400 hover:text-slate-600"
        >
          대시보드
        </Link>
        <h2 className="admin-page-title mt-2">학생 인증 일괄 설정</h2>
      </div>

      {error || message ? (
        <div className="rounded-2xl bg-white px-5 py-3 shadow-sm">
          {error ? <p className="text-sm text-red-500">{getUserErrorMessage(error)}</p> : null}
          {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
        </div>
      ) : null}

      <section>
        <div className="admin-metric-strip">
          <div>
            <p className="text-sm font-bold text-slate-500">인증 방식 미설정</p>
            <p className="mt-1 text-3xl font-black text-slate-900">{pendingCount}명</p>
          </div>
          <div>
            <p className="text-sm font-bold text-slate-500">생년월일 미등록</p>
            <p className="mt-1 text-3xl font-black text-amber-600">{missingBirthDateCount}명</p>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-500">
              일괄 설정 대상: 생년월일 등록 {summary?.birth_date_ready_count ?? 0}명, PIN 발급 필요 {summary?.pin_required_count ?? 0}명
            </p>
            {hasOnlyMissingBirthDateStudents ? (
              <p className="mt-2 text-sm font-semibold text-amber-600">
                생년월일 미등록 학생은 이미 PIN 인증이 설정되어 있어 일괄 설정 대상에는 포함되지 않습니다.
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={requestBulkSetup}
            disabled={running || pendingCount === 0}
            className="admin-button admin-button-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? '일괄 설정 실행 중...' : pendingCount === 0 ? '설정 대상 없음' : '일괄 설정 실행'}
          </button>
        </div>
      </section>

      <section className="admin-auth-section">
        <h3 className="admin-section-title">실행 기준</h3>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm text-slate-600">
          <li>이미 인증 방식이 설정된 학생은 건너뜁니다.</li>
          <li>생년월일이 있으면 생년월일 인증으로 설정합니다.</li>
          <li>생년월일이 없으면 4자리 PIN을 새로 발급합니다.</li>
        </ul>
      </section>

      <section className="admin-auth-section">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="admin-section-title">강좌별 생년월일 미등록 학생</h3>
            <p className="mt-1 text-sm text-slate-500">
              활성 수강생 기준이며, 이미 PIN 인증이 설정된 학생도 포함합니다.
            </p>
          </div>
          <p className="text-sm font-bold text-slate-900">
            {missingBirthDateCourses.length}개 강좌 · {missingBirthDateCount}명
          </p>
        </div>

        {missingBirthDateCount === 0 ? (
          <p className="mt-4 text-sm text-slate-400">생년월일이 비어 있는 활성 수강생이 없습니다.</p>
        ) : (
          <div className="mt-4 divide-y divide-slate-100">
            {missingBirthDateCourses.map((course) => (
              <div key={course.course_id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{course.course_name}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-400">
                      {course.course_status === 'archived' ? '보관 강좌' : '운영 강좌'}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-amber-600">{course.missing_birth_date_count}명</p>
                </div>

                <div className="mt-3 divide-y divide-slate-100 sm:hidden">
                  {course.students.map((student) => (
                    <div key={student.enrollment_id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-semibold text-slate-900">{student.name}</p>
                        <p className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                          {getAuthMethodLabel(student.auth_method)}
                        </p>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{student.phone}</p>
                      <p className="mt-1 text-xs text-slate-400">수험번호 {student.exam_number || '-'}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-3 hidden overflow-x-auto sm:block">
                  <table className="w-full min-w-[680px] text-sm">
                    <thead className="text-left text-xs font-semibold text-slate-400">
                      <tr>
                        <th className="py-2 pr-4">이름</th>
                        <th className="px-4 py-2">전화번호</th>
                        <th className="px-4 py-2">수험번호</th>
                        <th className="px-4 py-2">인증 방식</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {course.students.map((student) => (
                        <tr key={student.enrollment_id}>
                          <td className="py-2 pr-4 font-semibold text-slate-900">{student.name}</td>
                          <td className="px-4 py-2 text-slate-600">{student.phone}</td>
                          <td className="px-4 py-2 text-slate-500">{student.exam_number || '-'}</td>
                          <td className="px-4 py-2 text-slate-600">{getAuthMethodLabel(student.auth_method)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="admin-auth-section">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="admin-section-title">실행 결과</h3>
            <p className="mt-1 text-sm text-slate-500">PIN은 이 화면에서만 확인 가능하므로 필요 시 바로 CSV로 다운로드하세요.</p>
          </div>
          {result && result.pin_count > 0 ? (
            <button
              type="button"
              onClick={() => downloadPinsCsv(tenant.type, result.generated_pins)}
              className="admin-button"
            >
              PIN 목록 CSV 다운로드
            </button>
          ) : null}
        </div>

        {!result ? (
          <p className="mt-4 text-sm text-slate-400">아직 실행한 내역이 없습니다.</p>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            <div className="admin-metric-strip">
              {resultSummary?.map((item) => (
                <div key={item.label} className={`rounded-xl border px-4 py-3 ${item.tone}`}>
                  <p className="text-xs font-semibold">{item.label}</p>
                  <p className="mt-1 text-2xl font-black">{item.value}명</p>
                </div>
              ))}
            </div>

            {result.pin_count > 0 ? (
              <div className="admin-table-frame overflow-x-auto border border-slate-200">
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
    </>
  )
}
