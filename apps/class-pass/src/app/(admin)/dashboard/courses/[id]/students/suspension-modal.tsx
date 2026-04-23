'use client'

import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import type { Enrollment } from '@/types/database'

type SuspensionModalProps = {
  courseName: string
  enrollment: Enrollment | null
  submitting: boolean
  onClose: () => void
  onConfirm: (reason: string) => void
}

export function SuspensionModal({
  courseName,
  enrollment,
  submitting,
  onClose,
  onConfirm,
}: SuspensionModalProps) {
  const [reason, setReason] = useState('')

  useEffect(() => {
    setReason(enrollment?.suspension_reason ?? '')
  }, [enrollment])

  if (!enrollment) {
    return null
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onConfirm(reason)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-5"
      onClick={() => {
        if (!submitting) {
          onClose()
        }
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-gray-900">응시 정지</h3>
            <p className="mt-1 text-sm text-gray-500">
              {enrollment.name}
              {courseName ? ` · ${courseName}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-sm text-gray-400 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            닫기
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-800">이 학생은 이 강좌의 모바일 수강증에 진입할 수 없게 됩니다.</p>
          <p className="mt-1 text-xs leading-5 text-amber-700">
            QR, 좌석, 출석 등 수강증을 통해 접근하는 기능이 모두 차단됩니다.
          </p>
        </div>

        <label className="mt-4 block">
          <span className="text-sm font-semibold text-gray-700">정지 사유</span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={4}
            placeholder="예: 월 누적 불참 기준 초과"
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          />
          <span className="mt-1 block text-xs text-gray-400">선택 사항입니다. 학생 안내 카드에 함께 노출됩니다.</span>
        </label>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? '정지 처리 중...' : '정지 처리'}
          </button>
        </div>
      </form>
    </div>
  )
}
