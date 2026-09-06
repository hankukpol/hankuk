'use client'

import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2 } from 'lucide-react'
import { useId } from 'react'
import { useModalDialog } from '@/components/admin/useModalDialog'
import { AdminDialogClose } from '@/components/admin/AdminDialogClose'
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
  const titleId = useId()
  const receiptNos = parseReceiptNos(receiptNo)
  const open = receiptNos.length > 0
  const motionConfig = useMotionConfig()
  const backdropDuration = useReducedMotionDuration(0.2)
  const dialogRef = useModalDialog<HTMLDivElement>({
    open,
    onClose,
    priority: 230,
  })

  if (typeof document === 'undefined') return null

  return <>{createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          role="presentation"
          className="admin-dialog-backdrop fixed inset-0 z-[230] flex items-center justify-center px-5 sm:backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: backdropDuration }}
          onClick={onClose}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="admin-dialog-panel w-full max-w-[380px] overflow-hidden bg-white"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={motionConfig.modal}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-dialog-header">
              <div className="admin-receipt-heading">
                <CheckCircle2 aria-hidden="true" className="admin-receipt-icon" />
                <h3 id={titleId} className="admin-dialog-title min-w-0">수납 완료</h3>
              </div>
              <AdminDialogClose onClick={onClose} />
            </div>

            <div className="admin-dialog-body">
              <p className="admin-notice">카드 영수증에 아래 번호를 기재해 주세요.</p>

              {/* 여러 건을 한 번에 수납하면 번호도 여러 개다. 옮겨 적는 자리라 표로 둔다. */}
              <div className="admin-table-frame mt-4">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th>영수증 번호</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receiptNos.map((number) => (
                      <tr key={number}>
                        <td className="admin-receipt-number">{number}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="admin-dialog-footer">
              <button type="button" className="admin-button admin-button-primary" onClick={onClose}>
                확인
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.getElementById('admin-portal-root') ?? document.body,
  )}</>
}
