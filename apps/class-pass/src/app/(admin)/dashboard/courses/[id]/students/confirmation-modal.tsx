'use client'

import { useId } from 'react'

type ConfirmationTone = 'default' | 'danger' | 'success'

type ConfirmationModalProps = {
  open: boolean
  title: string
  description?: string
  confirmLabel: string
  pendingLabel?: string
  cancelLabel?: string
  tone?: ConfirmationTone
  submitting?: boolean
  onClose: () => void
  onConfirm: () => void
}

const confirmButtonClassName: Record<ConfirmationTone, string> = {
  default: 'bg-[#1d1d1f] text-white hover:bg-black',
  danger: 'bg-[#b42318] text-white hover:bg-[#912018]',
  success: 'bg-[#007a5a] text-white hover:bg-[#00664b]',
}

export function ConfirmationModal({
  open,
  title,
  description,
  confirmLabel,
  pendingLabel,
  cancelLabel = '취소',
  tone = 'default',
  submitting = false,
  onClose,
  onConfirm,
}: ConfirmationModalProps) {
  const titleId = useId()
  const descriptionId = useId()

  if (!open) {
    return null
  }

  return (
    <div
      role="presentation"
      className="apple-modal-backdrop fixed inset-0 z-50 flex items-center justify-center px-5"
      onClick={() => {
        if (!submitting) {
          onClose()
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 id={titleId} className="text-[21px] font-semibold tracking-[-0.22px] text-[#1d1d1f]">
              {title}
            </h3>
            {description ? (
              <p id={descriptionId} className="mt-2 text-sm leading-6 text-black/65">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-full px-2 py-1 text-xs font-semibold text-black/45 transition hover:bg-black/5 hover:text-black/70 disabled:cursor-not-allowed disabled:opacity-50"
          >
            닫기
          </button>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-full bg-[#f5f5f7] px-4 py-2 text-sm font-semibold text-[#1d1d1f] transition hover:bg-[#ebebee] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${confirmButtonClassName[tone]}`}
          >
            {submitting ? pendingLabel ?? `${confirmLabel} 중...` : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
