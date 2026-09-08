"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";

import { useDialogFocus } from "@/lib/useDialogFocus";
import { MODAL_SPRING, OVERLAY_FADE, withReducedMotion } from "@/lib/motion";

type ActionCompleteModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  notice?: string;
  badge?: string;
  confirmLabel?: string;
  widthClassName?: string;
};

/** DESIGN.md 5.10 — 짧은 완료 안내용 중앙 모달. */
export function ActionCompleteModal({
  open,
  onClose,
  title,
  description,
  notice = "변경 내용은 현재 화면에 바로 반영되며, 새로고침 이후에도 유지됩니다.",
  badge = "처리 완료",
  confirmLabel = "확인",
  widthClassName = "max-w-[512px]",
}: ActionCompleteModalProps) {
  const shouldReduceMotion = useReducedMotion();
  const panelRef = useDialogFocus<HTMLDivElement>(open, onClose);

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={withReducedMotion(OVERLAY_FADE, shouldReduceMotion)}
            className="admin-overlay"
          >
            <button
              type="button"
              aria-label="닫기"
              onClick={onClose}
              tabIndex={-1}
              className="admin-overlay-dismiss"
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={withReducedMotion(MODAL_SPRING, shouldReduceMotion)}
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`admin-dialog relative z-10 w-full ${widthClassName}`}
          >
            <div className="admin-dialog-header">
              <div className="min-w-0">
                <span className="admin-badge mb-2">{badge}</span>
                <h2 className="admin-dialog-title break-keep">{title}</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="admin-dialog-close"
                aria-label="닫기"
                title="닫기"
              >
                <X />
              </button>
            </div>

            <div className="admin-dialog-body">
              {description ? (
                <p className="text-[15px] leading-[1.5] text-admin-text break-keep">
                  {description}
                </p>
              ) : null}
              {notice ? <p className="admin-notice mt-4">{notice}</p> : null}
            </div>

            <div className="admin-dialog-footer">
              <button
                type="button"
                onClick={onClose}
                className="admin-button admin-button-primary"
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
