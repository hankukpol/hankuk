'use client'

import { useEffect, useMemo, useState } from 'react'
import { SeatEditModal } from '@/components/designated-seat/SeatEditModal'
import type { CourseSubject } from '@/types/database'

export type AttendanceExcuseStudentOption = {
  id: number
  name: string
  examNumber: string | null
  phone: string
}

export type AttendanceExcuseRecord = {
  id: number
  courseId: number
  enrollmentId: number
  subjectId: number
  excuseDate: string
  reason: string
  createdBy: string
  createdAt: string
  updatedAt: string
  studentName: string
  examNumber: string | null
  phone: string
  subjectName: string
}

type AttendanceExcuseModalProps = {
  open: boolean
  courseId: number
  subjects: CourseSubject[]
  students: AttendanceExcuseStudentOption[]
  defaultDate: string
  defaultSubjectId?: number | null
  lockedEnrollmentId?: number | null
  editingExcuse?: AttendanceExcuseRecord | null
  onClose: () => void
  onSaved: (excuse: AttendanceExcuseRecord, message: string) => void
}

async function readJson<T>(response: Response) {
  return response.json().catch(() => null) as Promise<T | null>
}

function formatStudentLabel(student: AttendanceExcuseStudentOption) {
  const meta = [student.examNumber, student.phone].filter(Boolean).join(' · ')
  return meta ? `${student.name} (${meta})` : student.name
}

export function AttendanceExcuseModal({
  open,
  courseId,
  subjects,
  students,
  defaultDate,
  defaultSubjectId,
  lockedEnrollmentId,
  editingExcuse,
  onClose,
  onSaved,
}: AttendanceExcuseModalProps) {
  const [studentQuery, setStudentQuery] = useState('')
  const [enrollmentId, setEnrollmentId] = useState<number | null>(null)
  const [subjectId, setSubjectId] = useState<number | null>(null)
  const [excuseDate, setExcuseDate] = useState(defaultDate)
  const [reason, setReason] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) {
      return
    }

    setStudentQuery('')
    setEnrollmentId(editingExcuse?.enrollmentId ?? lockedEnrollmentId ?? null)
    setSubjectId(editingExcuse?.subjectId ?? defaultSubjectId ?? null)
    setExcuseDate(editingExcuse?.excuseDate ?? defaultDate)
    setReason(editingExcuse?.reason ?? '')
    setWorking(false)
    setError('')
  }, [defaultDate, defaultSubjectId, editingExcuse, lockedEnrollmentId, open])

  const selectedStudent = useMemo(() => {
    if (editingExcuse) {
      return students.find((student) => student.id === editingExcuse.enrollmentId) ?? {
        id: editingExcuse.enrollmentId,
        name: editingExcuse.studentName,
        examNumber: editingExcuse.examNumber,
        phone: editingExcuse.phone,
      }
    }

    return students.find((student) => student.id === enrollmentId) ?? null
  }, [editingExcuse, enrollmentId, students])

  const filteredStudents = useMemo(() => {
    const keyword = studentQuery.trim().replace(/\s+/g, '').toLowerCase()
    if (!keyword) {
      return students
    }

    return students.filter((student) => (
      [student.name, student.examNumber, student.phone]
        .filter(Boolean)
        .map((value) => String(value).replace(/\s+/g, '').replace(/-/g, '').toLowerCase())
        .some((value) => value.includes(keyword))
    ))
  }, [studentQuery, students])

  const selectedSubject = useMemo(
    () => subjects.find((subject) => subject.id === subjectId) ?? null,
    [subjectId, subjects],
  )

  const isEditMode = Boolean(editingExcuse)
  const canSubmit = Boolean(
    (isEditMode || enrollmentId)
    && (isEditMode || subjectId)
    && excuseDate
    && reason.trim()
    && !working
    && subjects.length > 0
  )

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!canSubmit) {
      setError('학생, 과목, 날짜, 사유를 모두 입력해 주세요.')
      return
    }

    setWorking(true)
    setError('')

    const response = await fetch(
      isEditMode
        ? `/api/attendance/admin/excuses/${editingExcuse?.id}`
        : '/api/attendance/admin/excuses',
      {
        method: isEditMode ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isEditMode
            ? {
              courseId,
              excuseDate,
              reason: reason.trim(),
            }
            : {
              courseId,
              enrollmentId,
              subjectId,
              excuseDate,
              reason: reason.trim(),
            },
        ),
      },
    )

    const payload = await readJson<{ excuse?: AttendanceExcuseRecord; error?: string }>(response)
    setWorking(false)

    if (!response.ok || !payload?.excuse) {
      setError(payload?.error ?? (isEditMode ? '사유서를 수정하지 못했습니다.' : '사유서를 등록하지 못했습니다.'))
      return
    }

    onSaved(payload.excuse, isEditMode ? '사유서를 수정했습니다.' : '사유서를 등록했습니다.')
  }

  return (
    <SeatEditModal
      open={open}
      title={isEditMode ? '사유서 수정' : '사유서 등록'}
      badge="Attendance"
      description={isEditMode
        ? '학생과 과목은 유지하고 날짜와 사유만 수정합니다.'
        : '학생이 빠질 날짜와 과목을 미리 지정해 연속 결석 계산에서 제외합니다.'}
      widthClassName="max-w-2xl"
      onClose={() => {
        if (!working) {
          onClose()
        }
      }}
    >
      <form className="flex flex-col gap-5" onSubmit={(event) => void handleSubmit(event)}>
        {subjects.length === 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            등록 가능한 과목이 없어 사유서를 만들 수 없습니다.
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-[#1d1d1f]">학생</label>
            {isEditMode || lockedEnrollmentId ? (
              <div className="rounded-2xl border border-[#d2d2d7] bg-[#f5f5f7] px-4 py-3 text-sm text-[#1d1d1f]">
                <p className="font-semibold">{selectedStudent ? formatStudentLabel(selectedStudent) : '학생 정보 없음'}</p>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  value={studentQuery}
                  onChange={(event) => setStudentQuery(event.target.value)}
                  placeholder="이름, 전화번호, 수험번호 검색"
                  className="w-full rounded-xl border border-[#d2d2d7] px-3 py-2.5 text-sm outline-none focus:border-[#1d1d1f]"
                />
                <select
                  value={enrollmentId ?? ''}
                  onChange={(event) => setEnrollmentId(event.target.value ? Number(event.target.value) : null)}
                  className="w-full rounded-xl border border-[#d2d2d7] px-3 py-2.5 text-sm outline-none focus:border-[#1d1d1f]"
                >
                  <option value="">학생 선택</option>
                  {filteredStudents.map((student) => (
                    <option key={student.id} value={student.id}>
                      {formatStudentLabel(student)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-[#1d1d1f]">과목</label>
            {isEditMode ? (
              <div className="rounded-2xl border border-[#d2d2d7] bg-[#f5f5f7] px-4 py-3 text-sm text-[#1d1d1f]">
                <p className="font-semibold">{editingExcuse?.subjectName ?? '-'}</p>
              </div>
            ) : (
              <select
                value={subjectId ?? ''}
                onChange={(event) => setSubjectId(event.target.value ? Number(event.target.value) : null)}
                className="w-full rounded-xl border border-[#d2d2d7] px-3 py-2.5 text-sm outline-none focus:border-[#1d1d1f]"
              >
                <option value="">과목 선택</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
            )}
            {!isEditMode && selectedSubject ? (
              <p className="text-xs text-[#86868b]">{selectedSubject.name} 기준으로 해당 날짜가 연속 결석 계산에서 제외됩니다.</p>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
          <div className="space-y-2">
            <label htmlFor="excuse-date" className="text-sm font-semibold text-[#1d1d1f]">날짜</label>
            <input
              id="excuse-date"
              type="date"
              value={excuseDate}
              onChange={(event) => setExcuseDate(event.target.value)}
              className="w-full rounded-xl border border-[#d2d2d7] px-3 py-2.5 text-sm outline-none focus:border-[#1d1d1f]"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="excuse-reason" className="text-sm font-semibold text-[#1d1d1f]">사유</label>
            <textarea
              id="excuse-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={4}
              placeholder="예: 학교 행사, 병원 예약, 개인 일정"
              className="w-full rounded-2xl border border-[#d2d2d7] px-3 py-2.5 text-sm outline-none focus:border-[#1d1d1f]"
            />
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={working}
            className="rounded-xl border border-[#d2d2d7] px-4 py-2.5 text-sm font-semibold text-[#1d1d1f] transition-all duration-200 ease-ios hover:bg-[#f5f5f7] active:scale-[0.97] disabled:opacity-60 disabled:active:scale-100"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-xl bg-[#0071e3] px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 ease-ios hover:bg-[#0077ed] hover:shadow-md active:scale-[0.97] active:duration-100 disabled:opacity-60 disabled:active:scale-100"
          >
            {working ? '저장 중...' : isEditMode ? '사유서 수정' : '사유서 등록'}
          </button>
        </div>
      </form>
    </SeatEditModal>
  )
}
