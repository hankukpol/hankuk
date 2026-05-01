'use client'

import { useEffect, useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
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
  children?: ReactNode
  tone?: ConfirmationTone
  submitting?: boolean
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
  children,
  tone = 'default',
  submitting = false,
  onClose,
  onConfirm,
}: ConfirmationModalProps) {
  const titleId = useId()
  const descriptionId = useId()
  const motionConfig = useMotionConfig()
  const backdropDuration = useReducedMotionDuration(0.2)

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open, submitting])

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
          className={`fixed inset-0 flex items-center justify-center bg-black/40 px-5 sm:backdrop-blur-sm ${overlayClassName}`}
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
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            className="max-h-[90vh] w-full max-w-md overflow-auto rounded-[12px] bg-white p-6 shadow-[3px_5px_30px_0px_rgba(0,0,0,0.22)]"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={motionConfig.modal}
            onClick={(event) => event.stopPropagation()}
          >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 id={titleId} className="text-[21px] font-semibold tracking-[-0.231px] text-[#1d1d1f]">
              {title}
            </h3>
            {description ? (
              <p id={descriptionId} className="mt-2 whitespace-pre-line text-sm text-slate-700">
                {description}
              </p>
            ) : null}
            {children ? (
              <div className="mt-4">
                {children}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-full px-2 py-1 text-xs font-semibold text-slate-400 transition-all duration-200 ease-ios hover:bg-slate-100 hover:text-slate-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
          >
            닫기
          </button>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
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
            disabled={submitting}
            className={`rounded-[8px] px-4 py-2 text-[14px] font-medium transition-all duration-200 ease-ios active:scale-[0.97] active:duration-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${confirmButtonClassName[tone]}`}
          >
            {submitting ? pendingLabel ?? `${confirmLabel} 중...` : confirmLabel}
          </button>
        </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
        document.body,
      )}
    </>
  )
}
