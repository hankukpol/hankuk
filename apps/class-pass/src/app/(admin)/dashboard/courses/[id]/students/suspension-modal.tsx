'use client'

import type { FormEvent } from 'react'
import { useEffect, useId, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { AdminDrawerSurface } from '@/components/admin/AdminDrawer'
import { AdminPortal } from '@/components/admin/AdminPortal'
import { AdminDialogClose } from '@/components/admin/AdminDialogClose'
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
  const titleId = useId()
  const [reason, setReason] = useState('')

  useEffect(() => {
    setReason(enrollment?.suspension_reason ?? '')
  }, [enrollment])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!submitting) onConfirm(reason)
  }

  return (
    <AdminPortal><AnimatePresence>
      {enrollment ? (
        <AdminDrawerSurface labelledBy={titleId} priority={50} onClose={onClose} closeDisabled={submitting} onSubmit={handleSubmit}>
        <div className="admin-dialog-header flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 id={titleId} className="admin-dialog-title break-words text-base font-bold text-gray-900">응시 정지</h3>
            <p className="mt-1 text-sm text-gray-500">
              {enrollment.name}
              {courseName ? ` · ${courseName}` : ''}
            </p>
          </div>
          <AdminDialogClose
            onClick={onClose}
            disabled={submitting}
            aria-label="닫기"
            className="admin-dialog-close shrink-0 text-sm text-gray-400 transition-all duration-200 ease-ios hover:text-gray-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
          />
        </div>

        <div className="admin-dialog-body pt-4">
        <div className="admin-notice admin-notice-warning">
          <p className="admin-notice-strong">이 학생은 이 강좌의 모바일 수강증에 진입할 수 없게 됩니다.</p>
          <p className="mt-1">QR, 좌석, 출석 등 수강증을 통해 접근하는 기능이 모두 차단됩니다.</p>
        </div>

        <label className="mt-4 block">
          <span className="text-sm font-semibold text-gray-700">정지 사유</span>
          <textarea
            disabled={submitting}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={4}
            placeholder="예: 월 누적 불참 기준 초과"
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          />
          <span className="mt-1 block text-xs text-gray-400">선택 사항입니다. 학생 안내 카드에 함께 노출됩니다.</span>
        </label>

        </div>

        <div className="admin-dialog-footer">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="admin-button"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="admin-button admin-button-primary"
          >
            {submitting ? '정지 처리 중...' : '정지 처리'}
          </button>
        </div>
        </AdminDrawerSurface>
      ) : null}
    </AnimatePresence></AdminPortal>
  )
}
