'use client'

import * as React from 'react'
import { useId } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useModalDialog } from '@/components/admin/useModalDialog'
import { AdminDialogClose } from '@/components/admin/AdminDialogClose'
import { useMotionConfig, useReducedMotionDuration } from '@/lib/motion'

type ConfirmationTone = 'default' | 'danger' | 'success'

type ConfirmationModalProps = {
  open: boolean
  title: string
  description?: string
  confirmLabel: string
  pendingLabel?: string
  cancelLabel?: string | null
  overlayClassName?: string
  panelClassName?: string
  children?: React.ReactNode
  tone?: ConfirmationTone
  submitting?: boolean
  confirmDisabled?: boolean
  onClose: () => void
  onConfirm: () => void
}

const confirmButtonClassName: Record<ConfirmationTone, string> = {
  default: 'bg-blue-600 text-white hover:bg-blue-700',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700',
}

export function ConfirmationModal({
  open,
  title,
  description,
  confirmLabel,
  pendingLabel,
  cancelLabel = '취소',
  overlayClassName = 'z-[220]',
  panelClassName = 'max-w-md p-6',
  children,
  tone = 'default',
  submitting = false,
  confirmDisabled = false,
  onClose,
  onConfirm,
}: ConfirmationModalProps) {
  const titleId = useId()
  const descriptionId = useId()
  const motionConfig = useMotionConfig()
  const backdropDuration = useReducedMotionDuration(0.2)
  const dialogRef = useModalDialog<HTMLDivElement>({
    open,
    onClose,
    closeDisabled: submitting,
    priority: 220,
  })

  if (typeof document === 'undefined') {
    return null
  }

  return (
    <>
      {createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          role="presentation"
          className={`admin-dialog-backdrop fixed inset-0 flex items-center justify-center bg-black/40 px-5 sm:backdrop-blur-sm ${overlayClassName}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: backdropDuration }}
          onClick={() => {
            if (!submitting) {
              onClose()
            }
          }}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            className={`admin-dialog-panel max-h-[90vh] w-full overflow-auto rounded-[12px] bg-white shadow-[3px_5px_30px_0px_rgba(0,0,0,0.22)] ${panelClassName}`}
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={motionConfig.modal}
            onClick={(event) => event.stopPropagation()}
          >
        <div className="admin-dialog-header flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 id={titleId} className="admin-dialog-title break-words text-[21px] font-semibold tracking-[-0.231px] text-[#1d1d1f]">
              {title}
            </h3>
          </div>
          <AdminDialogClose
            preserveTextOutsideAdmin
            onClick={onClose}
            disabled={submitting}
            aria-label="닫기"
            className="admin-dialog-close shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-xs font-semibold text-slate-400 transition-all duration-200 ease-ios hover:bg-slate-100 hover:text-slate-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
          />
        </div>

        {(description || children) ? (
          <div className="admin-dialog-body admin-confirmation-body pt-4">
            {description ? (
              <p id={descriptionId} className="whitespace-pre-line text-sm text-slate-700">
                {description}
              </p>
            ) : null}
            {children ? (
              <div className={description ? 'mt-4' : undefined}>
                {children as React.ReactNode}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* 이 확인창은 학생 화면(.admin-shell 밖)에서도 쓰인다. 아래 유틸리티가 그곳의 유일한 레이아웃이므로 지우지 않는다. */}
        <div className="admin-dialog-footer flex flex-wrap items-center justify-end gap-2 pt-6">
          {cancelLabel !== null ? (
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-[8px] bg-slate-50 px-4 py-2 text-[14px] font-medium text-[#1d1d1f] transition-all duration-200 ease-ios hover:bg-slate-200 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
            >
              {cancelLabel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting || confirmDisabled}
            data-tone={tone}
            className={`admin-confirmation-confirm rounded-[8px] px-4 py-2 text-[14px] font-medium transition-all duration-200 ease-ios active:scale-[0.97] active:duration-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${confirmButtonClassName[tone]}`}
          >
            {submitting ? pendingLabel ?? `${confirmLabel} 중...` : confirmLabel}
          </button>
        </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
        document.getElementById('admin-portal-root') ?? document.body,
      )}
    </>
  )
}
