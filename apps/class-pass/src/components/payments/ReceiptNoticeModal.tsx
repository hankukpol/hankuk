'use client'

import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2 } from 'lucide-react'
import { useEffect } from 'react'
import { useMotionConfig, useReducedMotionDuration } from '@/lib/motion'

type ReceiptNoticeModalProps = {
  receiptNo: string | null
  onClose: () => void
}

function parseReceiptNos(value: string | null) {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function ReceiptNoticeModal({ receiptNo, onClose }: ReceiptNoticeModalProps) {
  const receiptNos = parseReceiptNos(receiptNo)
  const open = receiptNos.length > 0
  const motionConfig = useMotionConfig()
  const backdropDuration = useReducedMotionDuration(0.2)

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (typeof document === 'undefined') return null

  return <>{createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          role="presentation"
          className="fixed inset-0 z-[230] flex items-center justify-center px-5 sm:backdrop-blur-sm"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: backdropDuration }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-[320px] overflow-hidden rounded-2xl bg-white shadow-2xl"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={motionConfig.modal}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center px-6 pb-6 pt-8 text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              </div>

              <h3 className="text-[18px] font-semibold tracking-tight text-gray-900">수납 완료</h3>
              <p className="mt-1.5 text-sm text-gray-500">카드 영수증에 아래 번호를 기재해주세요.</p>

              <div className="mt-5 w-full space-y-2">
                {receiptNos.map((number) => (
                  <div key={number} className="w-full rounded-xl bg-gray-50 px-4 py-3.5">
                    <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-gray-400">
                      영수증 번호
                    </p>
                    <span className="font-mono text-[24px] font-bold tracking-wide text-gray-900">
                      {number}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-gray-100 px-6 py-4">
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-xl bg-blue-600 py-2.5 text-[14px] font-semibold text-white transition-all duration-150 hover:bg-blue-700 active:scale-[0.98]"
              >
                확인
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )}</>
}
